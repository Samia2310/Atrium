import { Router } from 'express';
import { query, withTransaction } from '../db';
import { requireSession } from '../auth';
import { hoursOfNotice, refundAmount, refundPercent, roomFee, seatFee } from '../credits';
import { hasFortyEightHoursNotice, isKnownSessionType, openingHoursViolation, sessionEnd } from '../bookingRules';
import { onCoachCancelledSession, onRoomBooked, onRoomCancelled } from '../events';

const router = Router();

const UPDATABLE_FIELDS = [
  'room_id',
  'discipline',
  'session_type',
  'starts_at'
];

type CurrentPerson = { id: number; kind: string; credits: string };

async function currentPerson(personId: number): Promise<CurrentPerson | null> {
  const [person] = await query<CurrentPerson>('select id, kind, credits from person where id = $1', [personId]);
  return person || null;
}

router.get('/', async (req, res) => {
  try {
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : new Date().toISOString();
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : null;

    const params: unknown[] = [from];
    let sql = `select id, room_id, coach_id, discipline, session_type, status,
                      starts_at, ends_at, room_fee_credits, seat_fee_credits
                 from session
                where starts_at >= $1
                  and status <> 'cancelled'`;

    if (to) {
      params.push(to);
      sql += ` and starts_at < $${params.length}`;
    }

    sql += ' order by starts_at';

    const sessions = await query(sql, params);
    const feed = [];

    for (const session of sessions) {
      const rooms = await query('select id, name, capacity from room where id = $1', [session.room_id]);
      const coaches = await query('select id, full_name from person where id = $1', [session.coach_id]);
      const enrolled = await query(
        "select count(*)::int as count from enrolment where session_id = $1 and status = 'active'",
        [session.id]
      );

      const capacity = rooms.length > 0 ? rooms[0].capacity : 0;
      const taken = enrolled[0].count;

      feed.push({
        ...session,
        room_name: rooms.length > 0 ? rooms[0].name : null,
        room_capacity: capacity,
        coach_name: coaches.length > 0 ? coaches[0].full_name : null,
        enrolled_count: taken,
        places_remaining: capacity - taken
      });
    }

    res.json(feed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load the calendar' });
  }
});

router.get('/:id', requireSession, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: 'no such session' });
      return;
    }

    const sessions = await query('select * from session where id = $1', [id]);

    if (sessions.length === 0) {
      res.status(404).json({ error: 'no such session' });
      return;
    }

    const session = sessions[0];
    const person = await currentPerson(res.locals.personId);
    if (!person) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    const rooms = await query('select id, name, capacity from room where id = $1', [session.room_id]);
    const coaches = await query('select id, full_name, email from person where id = $1', [session.coach_id]);
    const isOwnCoach = person.kind === 'coach' && session.coach_id === person.id;
    const isAdmin = person.kind === 'admin';
    const attendeeRows = isAdmin || isOwnCoach ? await query(
      `select e.id, e.status, e.credits_charged, e.credits_refunded, e.enrolled_at, e.cancelled_at,
              p.id as person_id, p.full_name, p.email
         from enrolment e
         join person p on p.id = e.person_id
        where e.session_id = $1
        order by e.id`,
      [id]
    ) : [];
    const myEnrolment = !isAdmin && !isOwnCoach ? await query(
      `select id, status, credits_charged, credits_refunded, enrolled_at, cancelled_at
         from enrolment
        where session_id = $1 and person_id = $2
        order by id desc
        limit 1`,
      [id, person.id]
    ) : [];

    res.json({
      ...session,
      room: rooms.length > 0 ? rooms[0] : null,
      coach: coaches.length > 0 ? coaches[0] : null,
      attendees: attendeeRows,
      my_enrolment: myEnrolment[0] || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load the session' });
  }
});

router.post('/', requireSession, async (req, res) => {
  try {
    const body = req.body || {};
    const { room_id, discipline, session_type, starts_at } = body;
    const person = await currentPerson(res.locals.personId);

    if (!person) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }

    if (person.kind !== 'admin' && person.kind !== 'coach') {
      res.status(403).json({ error: 'only coaches and administrators can create sessions' });
      return;
    }

    const coach_id = person.kind === 'admin' ? Number(body.coach_id) : person.id;

    if (!room_id || !coach_id || !discipline || !session_type || !starts_at) {
      res.status(400).json({
        error: 'room_id, discipline, session_type and starts_at are required'
      });
      return;
    }

    if (!isKnownSessionType(session_type)) {
      res.status(400).json({ error: 'session_type must be short, standard or intensive' });
      return;
    }

    const startsAt = new Date(starts_at);
    const endsAt = sessionEnd(startsAt, session_type);
    if (!endsAt) {
      res.status(400).json({ error: 'session_type must be short, standard or intensive' });
      return;
    }

    const openingViolation = openingHoursViolation(startsAt, endsAt);
    if (openingViolation) {
      res.status(400).json({ error: openingViolation });
      return;
    }

    if (person.kind === 'coach' && !hasFortyEightHoursNotice(startsAt)) {
      res.status(400).json({ error: 'coaches must book rooms at least 48 hours before the session starts' });
      return;
    }

    const rooms = await query('select id, name, capacity from room where id = $1', [room_id]);
    if (rooms.length === 0) {
      res.status(400).json({ error: 'no such room' });
      return;
    }

    const coaches = await query('select id, credits, kind from person where id = $1', [coach_id]);
    if (coaches.length === 0) {
      res.status(400).json({ error: 'no such coach' });
      return;
    }
    if (coaches[0].kind !== 'coach') {
      res.status(400).json({ error: 'coach_id must belong to a coach' });
      return;
    }

    const clashes = await query(
      `select id, starts_at, ends_at
         from session
        where room_id = $1
          and status <> 'cancelled'
          and starts_at < $3
          and ends_at > $2
        limit 1`,
      [room_id, startsAt.toISOString(), endsAt.toISOString()]
    );

    if (clashes.length > 0) {
      res.status(409).json({ error: `${rooms[0].name} is already booked for that time` });
      return;
    }

    const fee = roomFee(session_type);
    const seat = seatFee(session_type);
    if (Number(coaches[0].credits) < fee) {
      res.status(402).json({ error: 'not enough coach credits to book that room' });
      return;
    }

    const created = await withTransaction(async (client) => {
      const personClashes = await client.query(
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
        [startsAt.toISOString(), endsAt.toISOString(), coach_id]
      );
      if (personClashes.rowCount! > 0) {
        throw new Error('COACH_CLASH');
      }

      const roomClashes = await client.query(
        `select id
           from session
          where id <> coalesce($4, -1)
            and room_id = $1
            and status <> 'cancelled'
            and starts_at < $3
            and ends_at > $2
          limit 1`,
        [room_id, startsAt.toISOString(), endsAt.toISOString(), null]
      );
      if (roomClashes.rowCount! > 0) {
        throw new Error('ROOM_CLASH');
      }

      const lockedCoach = await client.query('select credits from person where id = $1 for update', [coach_id]);
      if (lockedCoach.rowCount === 0 || Number(lockedCoach.rows[0].credits) < fee) {
        throw new Error('COACH_CREDITS');
      }

      const inserted = await client.query(
        `insert into session
           (room_id, coach_id, discipline, session_type, status, starts_at, ends_at,
            room_fee_credits, seat_fee_credits)
         values ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $8)
         returning *`,
        [room_id, coach_id, discipline, session_type, startsAt.toISOString(), endsAt.toISOString(), fee, seat]
      );

      await client.query('update person set credits = credits - $1 where id = $2', [fee, coach_id]);

      return inserted.rows[0];
    }, 'serializable');

    await onRoomBooked(created);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof Error && err.message === 'COACH_CLASH') {
      res.status(409).json({ error: 'that coach already has a commitment during that time' });
      return;
    }
    if (err instanceof Error && err.message === 'ROOM_CLASH') {
      res.status(409).json({ error: 'that room is already booked for that time' });
      return;
    }
    if (err instanceof Error && err.message === 'COACH_CREDITS') {
      res.status(402).json({ error: 'not enough coach credits to book that room' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'could not create the session' });
  }
});

router.patch('/:id', requireSession, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: 'no such session' });
      return;
    }

    const body = req.body || {};
    const existingRows = await query('select * from session where id = $1', [id]);
    if (existingRows.length === 0) {
      res.status(404).json({ error: 'no such session' });
      return;
    }

    const person = await currentPerson(res.locals.personId);
    if (!person) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    if (person.kind !== 'admin' && !(person.kind === 'coach' && existingRows[0].coach_id === person.id)) {
      res.status(403).json({ error: 'not permitted' });
      return;
    }

    if (body.status !== undefined) {
      res.status(400).json({ error: 'use the cancellation endpoint to change session status' });
      return;
    }

    const nextRoomId = body.room_id !== undefined ? Number(body.room_id) : existingRows[0].room_id;
    const nextStartsAt = new Date(body.starts_at || existingRows[0].starts_at);
    const nextType = body.session_type || existingRows[0].session_type;
    const nextEndsAt = sessionEnd(nextStartsAt, nextType);

    if (!Number.isInteger(nextRoomId)) {
      res.status(400).json({ error: 'room_id must be a valid room' });
      return;
    }
    if (!isKnownSessionType(nextType) || !nextEndsAt) {
      res.status(400).json({ error: 'session_type must be short, standard or intensive' });
      return;
    }

    const openingViolation = openingHoursViolation(nextStartsAt, nextEndsAt);
    if (openingViolation) {
      res.status(400).json({ error: openingViolation });
      return;
    }

    const assignments: string[] = [];
    const params: unknown[] = [];

    for (const field of UPDATABLE_FIELDS) {
      if (body[field] !== undefined) {
        params.push(field === 'starts_at' ? nextStartsAt.toISOString() : body[field]);
        assignments.push(`${field} = $${params.length}`);
      }
    }

    if (body.starts_at !== undefined || body.session_type !== undefined) {
      params.push(nextEndsAt.toISOString());
      assignments.push(`ends_at = $${params.length}`);
    }
    if (body.session_type !== undefined) {
      params.push(roomFee(nextType));
      assignments.push(`room_fee_credits = $${params.length}`);
      params.push(seatFee(nextType));
      assignments.push(`seat_fee_credits = $${params.length}`);
    }

    if (assignments.length === 0) {
      res.status(400).json({ error: 'nothing to update' });
      return;
    }

    const touchesSchedule = body.room_id !== undefined || body.starts_at !== undefined || body.session_type !== undefined;

    const updated = await withTransaction(async (client) => {
      if (touchesSchedule) {
        const roomClashes = await client.query(
          `select id
             from session
            where id <> $4
              and room_id = $1
              and status <> 'cancelled'
              and starts_at < $3
              and ends_at > $2
            limit 1`,
          [nextRoomId, nextStartsAt.toISOString(), nextEndsAt.toISOString(), id]
        );
        if (roomClashes.rowCount! > 0) throw new Error('ROOM_CLASH');

        const coachClashes = await client.query(
          `select s.id
             from session s
            where s.id <> $4
              and s.status <> 'cancelled'
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
          [nextStartsAt.toISOString(), nextEndsAt.toISOString(), existingRows[0].coach_id, id]
        );
        if (coachClashes.rowCount! > 0) throw new Error('COACH_CLASH');

        const attendeeClashes = await client.query(
          `select e.person_id
             from enrolment e
            where e.session_id = $3
              and e.status = 'active'
              and exists (
                select 1
                  from session s
                 where s.id <> $3
                   and s.status <> 'cancelled'
                   and s.starts_at < $2
                   and s.ends_at > $1
                   and (
                     s.coach_id = e.person_id
                     or exists (
                       select 1 from enrolment other_e
                        where other_e.session_id = s.id
                          and other_e.person_id = e.person_id
                          and other_e.status = 'active'
                     )
                   )
              )
            limit 1`,
          [nextStartsAt.toISOString(), nextEndsAt.toISOString(), id]
        );
        if (attendeeClashes.rowCount! > 0) throw new Error('ATTENDEE_CLASH');
      }

      params.push(id);
      const result = await client.query(
        `update session set ${assignments.join(', ')} where id = $${params.length} returning *`,
        params
      );
      return result.rows;
    }, 'serializable');

    if (updated.length === 0) {
      res.status(404).json({ error: 'no such session' });
      return;
    }

    res.json(updated[0]);
  } catch (err) {
    if (err instanceof Error && err.message === 'ROOM_CLASH') {
      res.status(409).json({ error: 'that room is already booked for that time' });
      return;
    }
    if (err instanceof Error && err.message === 'COACH_CLASH') {
      res.status(409).json({ error: 'that coach already has a commitment during that time' });
      return;
    }
    if (err instanceof Error && err.message === 'ATTENDEE_CLASH') {
      res.status(409).json({ error: 'one or more attendees already has a commitment during that time' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'could not update the session' });
  }
});

router.post('/:id/cancel', requireSession, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ error: 'no such session' });
      return;
    }

    const sessions = await query('select * from session where id = $1', [id]);

    if (sessions.length === 0) {
      res.status(404).json({ error: 'no such session' });
      return;
    }

    const session = sessions[0];
    const person = await currentPerson(res.locals.personId);
    if (!person) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    if (person.kind !== 'admin' && !(person.kind === 'coach' && session.coach_id === person.id)) {
      res.status(403).json({ error: 'not permitted' });
      return;
    }

    if (session.status === 'cancelled') {
      res.status(409).json({ error: 'that session is already cancelled' });
      return;
    }

    const percent = refundPercent(hoursOfNotice(new Date(), new Date(session.starts_at)));
    const roomRefund = refundAmount(Number(session.room_fee_credits), percent);

    const summary = await withTransaction(async (client) => {
      const enrolments = await client.query(
        `select e.id, e.person_id, e.credits_charged, p.email
           from enrolment e
           join person p on p.id = e.person_id
          where e.session_id = $1 and e.status = 'active'`,
        [id]
      );

      let seatsRefunded = 0;

      for (const enrolment of enrolments.rows) {
        const refund = Number(enrolment.credits_charged);

        await client.query(
          `update enrolment
              set status = 'cancelled', credits_refunded = $1, cancelled_at = now()
            where id = $2`,
          [refund, enrolment.id]
        );

        await client.query('update person set credits = credits + $1 where id = $2', [
          refund,
          enrolment.person_id
        ]);

        seatsRefunded += refund;
      }

      await client.query('update person set credits = credits + $1 where id = $2', [
        roomRefund,
        session.coach_id
      ]);

      await client.query("update session set status = 'cancelled' where id = $1", [id]);

      return {
        enrolments: enrolments.rowCount,
        seatsRefunded,
        attendeeEmails: enrolments.rows.map((row) => row.email)
      };
    }, 'serializable');

    await onCoachCancelledSession(session, summary.attendeeEmails);
    await onRoomCancelled(session);

    res.json({
      id,
      status: 'cancelled',
      refund_percent: percent,
      room_fee_refunded: roomRefund,
      enrolments_cancelled: summary.enrolments,
      seat_fees_refunded: summary.seatsRefunded
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not cancel the session' });
  }
});

export default router;
