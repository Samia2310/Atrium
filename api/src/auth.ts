import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { query } from './db';
import { sendEmail } from './email';

export const SESSION_COOKIE = 'atrium_session';

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
const SCRYPT_KEY_LENGTH = 64;

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

export async function requestPasswordSet(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const people = await query<{ id: number }>('select id from person where lower(email) = lower($1) and active = true', [normalizedEmail]);
  if (people.length === 0) return; // don't reveal whether the email exists

  const token = crypto.randomBytes(32).toString('hex'); // never stored raw
  await query(
    `insert into password_token (person_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [people[0].id, hashToken(token), new Date(Date.now() + RESET_TOKEN_TTL_MS)]
  );

  const link = `${process.env.WEB_BASE_URL || 'http://localhost:3000'}/set-password?token=${token}`;
  await sendEmail(normalizedEmail, 'Set your password', `Use this link within an hour: ${link}`);
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

    await query('update person set password_hash = $1 where id = $2', [hashPassword(password), record.person_id]);
    await query('update password_token set used_at = now() where id = $1', [record.id]);

    // Sign them straight in — nicer UX, and the token has already proven inbox ownership.
    res.cookie(SESSION_COOKIE, signSession(record.person_id), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS
    });
    res.json({ password_set: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not set the password' });
  }
}
