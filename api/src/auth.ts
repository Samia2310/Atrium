import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { query } from './db';
import { sendEmail } from './email';

export const SESSION_COOKIE = 'atrium_session';

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
const SCRYPT_KEY_LENGTH = 64;
const STARTING_CREDITS: Record<'participant' | 'coach', number> = {
  participant: 4000,
  coach: 2000
};

type PasswordLinkDelivery = {
  sent: true;
  setupLink?: string;
};

function sessionSecret(): string {
  return process.env.SESSION_SECRET || 'change-me';
}

function legacySha256(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(password: string, storedHash: string | null): { ok: boolean; needsUpgrade: boolean } {
  if (!storedHash) return { ok: false, needsUpgrade: false };

  if (storedHash.startsWith('scrypt$')) {
    const [, salt, key] = storedHash.split('$');
    if (!salt || !key) return { ok: false, needsUpgrade: false };
    const candidate = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
    const expected = Buffer.from(key, 'hex');
    if (candidate.length !== expected.length) return { ok: false, needsUpgrade: false };
    return { ok: crypto.timingSafeEqual(candidate, expected), needsUpgrade: false };
  }

  const candidate = legacySha256(password);
  const ok = candidate.length === storedHash.length &&
    crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(storedHash));
  return { ok, needsUpgrade: ok };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function exposeSetupLinks(): boolean {
  return process.env.MAIL_TRANSPORT === 'console' || process.env.NODE_ENV !== 'production';
}

async function sendPasswordSetToken(
  personId: number,
  email: string,
  subject = 'Set your Atrium password'
): Promise<PasswordLinkDelivery> {
  const token = crypto.randomBytes(32).toString('hex'); // never stored raw
  await query(
    `insert into password_token (person_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [personId, hashToken(token), new Date(Date.now() + RESET_TOKEN_TTL_MS)]
  );

  const link = `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/set-password?token=${token}`;
  const delivery = await sendEmail(
    email,
    subject,
    `Use this link within an hour to verify your email and set your password: ${link}`
  );

  if (!delivery.delivered) {
    throw new Error(`EMAIL_DELIVERY_FAILED: ${delivery.error || 'unknown SMTP error'}`);
  }

  return exposeSetupLinks() ? { sent: true, setupLink: link } : { sent: true };
}

export function signSession(personId: number, issuedAt: number = Date.now()): string {
  const payload = `${personId}.${issuedAt}`;
  const mac = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex');
  return `${payload}.${mac}`;
}

export function readSession(cookie: string | undefined): { personId: number; issuedAt: number } | null {
  if (!cookie) return null;

  const parts = cookie.split('.');
  if (parts.length !== 3) return null;

  const payload = `${parts[0]}.${parts[1]}`;
  const mac = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex');
  if (mac !== parts[2]) return null;

  const personId = Number(parts[0]);
  const issuedAt = Number(parts[1]);
  if (!Number.isInteger(personId) || !Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_MS) return null;

  return { personId, issuedAt };
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const session = readSession(req.cookies ? req.cookies[SESSION_COOKIE] : undefined);
  if (!session) {
    res.status(401).json({ error: 'not signed in' });
    return;
  }
  res.locals.personId = session.personId;
  next();
}

export async function login(req: Request, res: Response): Promise<void> {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : undefined;
  const password = req.body ? req.body.password : undefined;

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const people = await query(
      'select id, email, full_name, kind, active, password_hash from person where lower(email) = lower($1)',
      [email]
    );

    if (people.length === 0) {
      res.status(401).json({ error: 'invalid email or password' });
      return;
    }

    const person = people[0];
    if (!person.active) {
      res.status(401).json({ error: 'invalid email or password' });
      return;
    }

    const verified = verifyPassword(password, person.password_hash);
    if (!verified.ok) {
      res.status(401).json({ error: 'invalid email or password' });
      return;
    }

    if (verified.needsUpgrade) {
      await query('update person set password_hash = $1 where id = $2', [hashPassword(password), person.id]);
    }

    res.cookie(SESSION_COOKIE, signSession(person.id), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS
    });

    res.json({
      id: person.id,
      email: person.email,
      full_name: person.full_name,
      kind: person.kind
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not sign in' });
  }
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ signed_out: true });
}

export async function me(_req: Request, res: Response): Promise<void> {
  try {
    const people = await query(
      'select id, email, full_name, kind, credits, active from person where id = $1',
      [res.locals.personId]
    );

    if (people.length === 0) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }

    res.json(people[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load the current user' });
  }
}

// Anonymous booking flow: create (or reuse) an account by email only.
// No password is set here — that only happens via the emailed link below.
export async function findOrCreatePersonByEmail(email: string): Promise<number> {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await query<{ id: number }>('select id from person where lower(email) = lower($1)', [normalizedEmail]);
  if (existing.length > 0) return existing[0].id;

  const inserted = await query<{ id: number }>(
    `insert into person (email, password_hash, full_name, kind, credits, active, created_at)
     values ($1, null, $2, 'participant', 4000, true, now()) returning id`,
    [normalizedEmail, normalizedEmail.split('@')[0]]
  );
  return inserted[0].id;
}

export async function requestPasswordSet(email: string): Promise<PasswordLinkDelivery | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const people = await query<{ id: number }>(
    `select id
       from person
      where lower(email) = lower($1)
        and (active = true or password_hash is null)`,
    [normalizedEmail]
  );
  if (people.length === 0) return null; // don't reveal whether the email exists

  return sendPasswordSetToken(people[0].id, normalizedEmail);
}

export async function register(req: Request, res: Response): Promise<void> {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
  const kind = req.body?.kind;

  if (!fullName || fullName.length < 2) {
    res.status(400).json({ error: 'full name is required' });
    return;
  }
  if (!email || !isPlausibleEmail(email)) {
    res.status(400).json({ error: 'a valid email is required' });
    return;
  }
  if (kind !== 'participant' && kind !== 'coach') {
    res.status(400).json({ error: 'account type must be participant or coach' });
    return;
  }
  const accountKind: 'participant' | 'coach' = kind;

  try {
    const existing = await query<{
      id: number;
      email: string;
      active: boolean;
      password_hash: string | null;
    }>(
      'select id, email, active, password_hash from person where lower(email) = lower($1)',
      [email]
    );

    if (existing.length > 0) {
      const person = existing[0];
      let delivery: PasswordLinkDelivery | null = null;
      if (person.active || person.password_hash === null) {
        delivery = await sendPasswordSetToken(person.id, person.email, 'Your Atrium sign-in link');
      }
      res.status(202).json({
        registered: true,
        check_your_email: true,
        setup_link: delivery?.setupLink
      });
      return;
    }

    const inserted = await query<{ id: number; email: string }>(
      `insert into person (email, password_hash, full_name, kind, credits, active, created_at)
       values ($1, null, $2, $3, $4, false, now())
       returning id, email`,
      [email, fullName, accountKind, STARTING_CREDITS[accountKind]]
    );

    const delivery = await sendPasswordSetToken(inserted[0].id, inserted[0].email, 'Verify your Atrium email');
    res.status(201).json({
      registered: true,
      check_your_email: true,
      setup_link: delivery.setupLink
    });
  } catch (err) {
    console.error(err);
    if (err instanceof Error && err.message.startsWith('EMAIL_DELIVERY_FAILED')) {
      res.status(502).json({
        error: 'account was saved, but the verification email could not be sent. Check SMTP settings and try the password link again.'
      });
      return;
    }
    res.status(500).json({ error: 'could not create that account' });
  }
}

export async function setPasswordWithToken(req: Request, res: Response): Promise<void> {
  const token = req.body?.token;
  const password = req.body?.password;

  if (!token || !password || password.length < 8) {
    res.status(400).json({ error: 'a valid token and an 8+ character password are required' });
    return;
  }

  try {
    const rows = await query<{ id: number; person_id: number; expires_at: string; used_at: string | null }>(
      'select id, person_id, expires_at, used_at from password_token where token_hash = $1',
      [hashToken(token)]
    );
    if (rows.length === 0) {
      res.status(400).json({ error: 'invalid or expired link' });
      return;
    }

    const record = rows[0];
    if (record.used_at) {
      res.status(400).json({ error: 'this link has already been used' });
      return;
    }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'this link has expired' });
      return;
    }

    const updatedPeople = await query<{
      id: number;
      email: string;
      full_name: string;
      kind: 'participant' | 'coach' | 'admin';
      active: boolean;
    }>(
      `update person
          set password_hash = $1,
              active = case when password_hash is null then true else active end
        where id = $2
          and (active = true or password_hash is null)
        returning id, email, full_name, kind, active`,
      [hashPassword(password), record.person_id]
    );

    const person = updatedPeople[0];
    if (!person || !person.active) {
      res.status(403).json({ error: 'this account is inactive' });
      return;
    }

    await query('update password_token set used_at = now() where id = $1', [record.id]);

    // Sign them straight in — nicer UX, and the token has already proven inbox ownership.
    res.cookie(SESSION_COOKIE, signSession(record.person_id), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS
    });
    res.json({
      password_set: true,
      id: person.id,
      email: person.email,
      full_name: person.full_name,
      kind: person.kind
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not set the password' });
  }
}
