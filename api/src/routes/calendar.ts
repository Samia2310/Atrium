import { Router } from 'express';
import { query } from '../db';
import { requireSession } from '../auth';

const router = Router();

// GET /api/calendar?from=&to=
// Anonymous / not-yet-resolved callers never reach this route (requireSession
// gates it) — the public catalogue on sessions.ts GET / covers anonymous browsing.
router.get('/', requireSession, async (req, res) => {
  try {
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : new Date().toISOString();
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : null;
    const personId = res.locals.personId;

    const [person] = await query<{ kind: string }>('select kind from person where id = $1', [personId]);
    if (!person) { res.status(401).json({ error: 'not signed in' }); return; }

    const params: unknown[] = [from];
    let toClause = '';
    if (to) { params.push(to); toClause = ` and s.starts_at < $${params.length}`; }

    let rows;
    if (person.kind === 'admin') {
      // Admin: everything.
      params.push(personId); // unused but keeps param numbering simple below if needed
      rows = await query(
        `select s.id, s.discipline, s.session_type, s.status, s.starts_at, s.ends_at,
                r.name as room_name, p.full_name as coach_name
           from session s
           join room r on r.id = s.room_id
           join person p on p.id = s.coach_id
          where s.starts_at >= $1${toClause}
          order by s.starts_at`,
        params.slice(0, params.length - 1)
      );
    } else if (person.kind === 'coach') {
      // Coach: their own sessions with detail, plus all other room holds
      // reduced to busy blocks for planning.
      rows = await query(
        `select s.id,
                case when s.coach_id = $${params.length + 1} then s.discipline else 'busy' end as discipline,
                s.session_type, s.status, s.starts_at, s.ends_at,
                r.name as room_name,
                case when s.coach_id = $${params.length + 1} then p.full_name else null end as coach_name,
                (s.coach_id = $${params.length + 1}) as is_own,
                exists (
                  select 1 from enrolment e
                   where e.session_id = s.id and e.person_id = $${params.length + 1} and e.status = 'active'
                ) as is_attending
           from session s
           join room r on r.id = s.room_id
           join person p on p.id = s.coach_id
          where s.starts_at >= $1${toClause} and s.status <> 'cancelled'
          order by s.starts_at`,
        [...params, personId]
      );
    } else {
      // Participant: only sessions they're booked into. The public
      // catalogue remains available through /api/sessions.
      rows = await query(
        `select s.id, s.discipline, s.session_type, s.status, s.starts_at, s.ends_at,
                r.name as room_name, p.full_name as coach_name,
                true as is_booked
           from session s
           join room r on r.id = s.room_id
           join person p on p.id = s.coach_id
           join enrolment e on e.session_id = s.id
          where s.starts_at >= $1${toClause}
            and s.status <> 'cancelled'
            and e.person_id = $${params.length + 1}
            and e.status = 'active'
          order by s.starts_at`,
        [...params, personId]
      );
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load the calendar' });
  }
});

export default router;
