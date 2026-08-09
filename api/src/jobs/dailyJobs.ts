// api/src/jobs/dailyJobs.ts
import { query } from '../db';
import { sendEmail } from '../email';
import { localMidnightUtc, localYmdNow, addDays } from './timezone';

const CENTRE_TZ = process.env.CENTRE_TIMEZONE || 'America/New_York';

export async function runDailyJobs() {
  const { year, month, day } = localYmdNow(CENTRE_TZ);
  // "The day ahead" — today's local midnight to tomorrow's local midnight,
  // each computed independently, so the window is correctly 23h or 25h
  // long on the DST transition dates instead of always exactly 24h.
  const windowStart = localMidnightUtc(year, month, day, CENTRE_TZ);
  const tomorrow = addDays(year, month, day, 1);
  const windowEnd = localMidnightUtc(tomorrow.year, tomorrow.month, tomorrow.day, CENTRE_TZ);

  const sessions = await query<any>(
    `select s.*, p.email as coach_email, p.full_name as coach_name
       from session s join person p on p.id = s.coach_id
      where s.starts_at >= $1 and s.starts_at < $2 and s.status = 'scheduled'
      order by s.starts_at`,
    [windowStart.toISOString(), windowEnd.toISOString()]
  );

  const byCoach = new Map<number, any[]>();
  for (const s of sessions) {
    if (!byCoach.has(s.coach_id)) byCoach.set(s.coach_id, []);
    byCoach.get(s.coach_id)!.push(s);
  }
  // A coach with none receives no email at all — no empty digest.
  for (const [, coachSessions] of byCoach) {
    const { coach_email, coach_name } = coachSessions[0];
    const lines = coachSessions.map((s) => `${s.discipline} at ${s.starts_at}`).join('\n');
    await sendEmail(coach_email, 'Your sessions tomorrow', `Hi ${coach_name},\n\n${lines}`);
  }

  if (sessions.length > 0) {
    const admins = await query<{ email: string }>("select email from person where kind = 'admin'");
    const summary = sessions.map((s: any) => `${s.discipline} (${s.coach_name})`).join('\n');
    for (const a of admins) await sendEmail(a.email, "Tomorrow's bookings digest", summary);
  }
}
