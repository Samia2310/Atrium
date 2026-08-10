import { Router } from 'express';
import { withTransaction, query } from '../db';
import { requireSession } from '../auth';
import { findOrCreatePersonByEmail, requestPasswordSet } from '../auth';
import { coachAttendeeIds, onCoachAttendingChanged, onParticipantBooked, onParticipantCancelled } from '../events';
import { hoursOfNotice, participantRefundPercent, refundAmount } from '../credits';

const router = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// The actual booking transaction — capacity check, duplicate check, credit
// check, charge, insert — shared by both the signed-in route and the
// anonymous route below. Neither caller trusts a role or identity claim
// beyond the personId passed in; that value always comes from either the
// session cookie or a freshly created/looked-up person row, never from
// the request body.
async function bookSession(sessionId: number, personId: number) {
  return withTransaction(async (client) => {
    // Lock the session row so two concurrent bookings can't both slip
    // past the capacity check.
    const sessions = await client.query(
      `select s.*, r.capacity
         from session s join room r on r.id = s.room_id
        where s.id = $1 and s.status = 'scheduled'
        for update`,
      [sessionId]
    );
    if (sessions.rowCount === 0) throw new HttpError(404, 'no such session');
    const session = sessions.rows[0];
    if (session.coach_id === personId) {
      throw new HttpError(409, 'a coach cannot enrol in their own session');
    }

    const enrolled = await client.query(
      `select count(*)::int as count from enrolment
        where session_id = $1 and status = 'active'`,
      [sessionId]
    );
    if (enrolled.rows[0].count >= session.capacity) {
      throw new HttpError(409, 'that session is full');
    }

    const already = await client.query(
      `select id from enrolment
        where session_id = $1 and person_id = $2 and status = 'active'`,
      [sessionId, personId]
    );
    if (already.rowCount! > 0) throw new HttpError(409, 'already booked');

    const person = await client.query('select credits, active from person where id = $1', [personId]);
    if (person.rowCount === 0) throw new HttpError(404, 'no such person');
    if (!person.rows[0].active) throw new HttpError(403, 'account is inactive');

    const commitment = await client.query(
      `select s.id
         from session s
        where s.status <> 'cancelled'
          and s.starts_at < $2
          and s.ends_at > $1
          and (
            s.coach_id = $3
            or exists (
              select 1 from enrolment e
               where e.session_id = s.id and e.person_id = $3 and e.status = 'active'
            )
          )
        limit 1`,
      [session.starts_at, session.ends_at, personId]
    );
    if (commitment.rowCount! > 0) {
      throw new HttpError(409, 'you already have a commitment during that time');
    }

    const fee = Number(session.seat_fee_credits);
    if (Number(person.rows[0].credits) < fee) throw new HttpError(402, 'not enough credits');

    await client.query('update person set credits = credits - $1 where id = $2', [fee, personId]);
    const inserted = await client.query(
      `insert into enrolment (session_id, person_id, status, credits_charged, enrolled_at)
       values ($1, $2, 'active', $3, now()) returning *`,
      [sessionId, personId, fee]
    );
    return { enrolment: inserted.rows[0], session };
  }, 'serializable');
}

// Book a seat while signed in.
router.post('/', requireSession, async (req, res) => {
  const sessionId = Number(req.body?.session_id);
  if (!Number.isInteger(sessionId)) {
    res.status(400).json({ error: 'session_id is required' });
    return;
  }
  const personId = res.locals.personId;

  try {
    const result = await bookSession(sessionId, personId);
    await onParticipantBooked(result.session, personId);
    await onCoachAttendingChanged(result.session, await coachAttendeeIds(sessionId, result.session.coach_id));
    res.status(201).json(result.enrolment);
  } catch (err) {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    console.error(err);
    res.status(500).json({ error: 'could not book that session' });
  }
});

// Book a seat as an anonymous visitor supplying only an email — Section
// 10's "It can also take a booking from a visitor who supplies only an
// email address. That address becomes their account, and the password
// must be established through a properly secured flow." The person row
// is created (or reused) with no password, the booking runs for real
// against that person, and only afterward is the password-set email sent.
router.post('/anonymous', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const sessionId = Number(req.body?.session_id);

  if (!email || !isPlausibleEmail(email) || !Number.isInteger(sessionId)) {
    res.status(400).json({ error: 'a valid email and session_id are required' });
    return;
  }

  try {
    const personId = await findOrCreatePersonByEmail(email);
    const result = await bookSession(sessionId, personId);

    await onParticipantBooked(result.session, personId);
    await onCoachAttendingChanged(result.session, await coachAttendeeIds(sessionId, result.session.coach_id));
    // Fire-and-forget in the sense that a failed email shouldn't undo a
    // successful, already-committed booking — but we still await it so
    // any error is logged rather than silently lost.
    await requestPasswordSet(email);

    res.status(201).json({
      booked: true,
      enrolment_id: result.enrolment.id,
      check_your_email: true
    });
  } catch (err) {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    console.error(err);
    res.status(500).json({ error: 'could not complete that booking' });
  }
});

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// A participant's own bookings — filtered at the query, not in the response shaping.
router.get('/mine', requireSession, async (_req, res) => {
  try {
    const rows = await query(
      `select e.*, s.discipline, s.starts_at, s.ends_at, s.status as session_status
         from enrolment e join session s on s.id = e.session_id
        where e.person_id = $1
        order by s.starts_at desc`,
      [res.locals.personId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load your bookings' });
  }
});

router.post('/:id/cancel', requireSession, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await withTransaction(async (client) => {
      const rows = await client.query(
        `select e.*, s.room_id, s.starts_at, s.ends_at, s.room_fee_credits, s.coach_id, s.discipline, s.session_type
           from enrolment e join session s on s.id = e.session_id
          where e.id = $1 for update`,
        [id]
      );
      if (rows.rowCount === 0) throw new HttpError(404, 'no such booking');
      const enrolment = rows.rows[0];
      // Ownership check happens here, server-side — not by hiding a button.
      if (enrolment.person_id !== res.locals.personId) throw new HttpError(403, 'not your booking');
      if (enrolment.status === 'cancelled') throw new HttpError(409, 'already cancelled');

      const percent = participantRefundPercent(hoursOfNotice(new Date(), new Date(enrolment.starts_at)));
      const refund = refundAmount(Number(enrolment.credits_charged), percent);

      await client.query(
        `update enrolment set status = 'cancelled', credits_refunded = $1, cancelled_at = now() where id = $2`,
        [refund, id]
      );
      await client.query('update person set credits = credits + $1 where id = $2', [refund, res.locals.personId]);
      return { enrolment, refund };
    }, 'serializable');

    await onParticipantCancelled(result.enrolment, res.locals.personId);
    await onCoachAttendingChanged(
      result.enrolment,
      await coachAttendeeIds(result.enrolment.session_id, result.enrolment.coach_id)
    );
    res.json({ id, cancelled: true, credits_refunded: result.refund });
  } catch (err) {
    if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
    console.error(err);
    res.status(500).json({ error: 'could not cancel that booking' });
  }
});

export default router;
