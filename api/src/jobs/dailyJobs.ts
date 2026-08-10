import { query } from '../db';
import { sendEmail } from '../email';
import { addDays, localMidnightUtc, localYmdNow } from './timezone';

const CENTRE_TZ = process.env.CENTRE_TIMEZONE || 'America/New_York';

type DailySession = {
  id: number;
  coach_id: number;
  coach_email: string;
  coach_name: string;
  discipline: string;
  session_type: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  active_bookings: number;
  checked_in_count: number;
  attendee_names: string | null;
};

function localDateLabel(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function localTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
}

function sessionSummaryLine(session: DailySession): string {
  const attendees = session.attendee_names ? `; attendees: ${session.attendee_names}` : '; no attendees';
  return [
    `${localTime(session.starts_at)}-${localTime(session.ends_at)}`,
    session.discipline,
    session.session_type,
    session.room_name,
    `${session.active_bookings} booked`,
    `${session.checked_in_count} checked in${attendees}`
  ].join(' | ');
}

export async function runDailyJobs() {
  const { year, month, day } = localYmdNow(CENTRE_TZ);
  const windowStart = localMidnightUtc(year, month, day, CENTRE_TZ);
  const tomorrow = addDays(year, month, day, 1);
  const windowEnd = localMidnightUtc(tomorrow.year, tomorrow.month, tomorrow.day, CENTRE_TZ);
  const dateLabel = localDateLabel(year, month, day);

  const sessions = await query<DailySession>(
    `select s.id,
            s.coach_id,
            coach.email as coach_email,
            coach.full_name as coach_name,
            s.discipline,
            s.session_type,
            s.starts_at,
            s.ends_at,
            r.name as room_name,
            count(distinct e.id)::int as active_bookings,
            count(distinct ci.id)::int as checked_in_count,
            string_agg(distinct attendee.full_name, ', ' order by attendee.full_name) as attendee_names
       from session s
       join person coach on coach.id = s.coach_id
       join room r on r.id = s.room_id
       left join enrolment e on e.session_id = s.id and e.status = 'active'
       left join person attendee on attendee.id = e.person_id
       left join check_in ci on ci.enrolment_id = e.id
      where s.starts_at >= $1
        and s.starts_at < $2
        and s.status = 'scheduled'
      group by s.id, coach.email, coach.full_name, r.name
      order by s.starts_at`,
    [windowStart.toISOString(), windowEnd.toISOString()]
  );

  const byCoach = new Map<number, DailySession[]>();
  for (const session of sessions) {
    if (!byCoach.has(session.coach_id)) byCoach.set(session.coach_id, []);
    byCoach.get(session.coach_id)!.push(session);
  }

  for (const coachSessions of byCoach.values()) {
    const { coach_email, coach_name } = coachSessions[0];
    const lines = coachSessions.map(sessionSummaryLine).join('\n');
    await sendEmail(
      coach_email,
      `Your Atrium bookings for ${dateLabel}`,
      `Hi ${coach_name},\n\nHere are your bookings for ${dateLabel} (${CENTRE_TZ}):\n\n${lines}`
    );
  }

  const admins = await query<{ email: string }>("select email from person where kind = 'admin' and active = true");
  const digest = sessions.length > 0
    ? sessions.map((session) => `${session.coach_name}: ${sessionSummaryLine(session)}`).join('\n')
    : `No scheduled bookings for ${dateLabel} (${CENTRE_TZ}).`;

  for (const admin of admins) {
    await sendEmail(
      admin.email,
      `Atrium bookings and attendance digest for ${dateLabel}`,
      digest
    );
  }
}
