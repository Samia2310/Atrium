// api/src/jobs/scheduler.ts
// Rather than a fixed cron("0 0 * * *") anchored to a UTC hour — which is
// wrong precisely on the two dates the assignment calls out — this
// recomputes the *next* local-midnight instant every time it fires and
// reschedules a fresh setTimeout for exactly that instant.
import { runDailyJobs } from './dailyJobs';
import { localMidnightUtc, localYmdNow, addDays } from './timezone';

const CENTRE_TZ = process.env.CENTRE_TIMEZONE || 'America/New_York';

function scheduleNext() {
  const { year, month, day } = localYmdNow(CENTRE_TZ);
  const nextDay = addDays(year, month, day, 1);
  const nextMidnight = localMidnightUtc(nextDay.year, nextDay.month, nextDay.day, CENTRE_TZ);
  const delay = Math.max(1000, nextMidnight.getTime() - Date.now());

  setTimeout(async () => {
    try { await runDailyJobs(); } catch (err) { console.error('daily job failed', err); }
    scheduleNext();
  }, delay);
}

export function startScheduler() {
  if (process.env.SCHEDULER_ENABLED === 'false') return;
  scheduleNext();
}
