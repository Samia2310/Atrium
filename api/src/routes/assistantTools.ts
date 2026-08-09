import { query } from '../db';

export type Caller = { personId: number | null; kind: 'anonymous' | 'participant' | 'coach' | 'admin' };

// Every tool has the same shape — (caller, args) — even when a tool
// ignores args, so callModel can invoke all of them uniformly without
// a switch statement on arity. This is also what makes the permission
// check possible to write once, per tool, at the top of each function
// rather than scattered across call sites.
export const tools = {
  async searchSessions(_caller: Caller, args: { discipline?: string; from?: string }) {
    // Available to everyone, including anonymous — no permission check needed.
    const params: unknown[] = [args?.from || new Date().toISOString()];
    let sql = `select s.id, s.discipline, s.starts_at, s.session_type, s.seat_fee_credits,
                      r.capacity - coalesce(e.taken,0) as places_remaining
                 from session s
                 join room r on r.id = s.room_id
                 left join (select session_id, count(*) filter (where status='active')::int as taken
                              from enrolment group by session_id) e on e.session_id = s.id
                where s.starts_at >= $1 and s.status = 'scheduled'`;
    if (args?.discipline) { params.push(args.discipline); sql += ` and s.discipline = $${params.length}`; }
    sql += ' order by s.starts_at limit 20';
    return query(sql, params);
  },

  async myBookings(caller: Caller, _args: unknown) {
    if (!caller.personId) return { error: 'sign in required' };
    return query(
      `select e.id, s.discipline, s.starts_at, e.status
         from enrolment e join session s on s.id = e.session_id
        where e.person_id = $1 order by s.starts_at desc limit 20`,
      [caller.personId]
    );
  },

  async myCreditBalance(caller: Caller, _args: unknown) {
    if (!caller.personId) return { error: 'sign in required' };
    const [row] = await query<{ credits: string }>('select credits from person where id = $1', [caller.personId]);
    return { credits: row?.credits ?? null };
  },

  // Coach-only, and scoped to that coach's own sessions.
  async myUpcomingSessionsWithAttendees(caller: Caller, _args: unknown) {
    if (caller.kind !== 'coach' || !caller.personId) return { error: 'not permitted' };
    return query(
      `select s.id, s.discipline, s.starts_at,
              json_agg(json_build_object('name', p.full_name, 'status', e.status)) as attendees
         from session s
         join enrolment e on e.session_id = s.id
         join person p on p.id = e.person_id
        where s.coach_id = $1 and s.starts_at >= now()
        group by s.id order by s.starts_at limit 20`,
      [caller.personId]
    );
  },

  // Admin-only.
  async searchAnyPerson(caller: Caller, args: { email?: string }) {
    if (caller.kind !== 'admin') return { error: 'not permitted' };
    return query(
      'select id, email, full_name, kind, credits, active from person where email ilike $1',
      [`%${args?.email || ''}%`]
    );
  }
};

export type ToolName = keyof typeof tools;