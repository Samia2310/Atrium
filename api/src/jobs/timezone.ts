// api/src/jobs/timezone.ts
export function offsetMinutesAt(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asIfUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute, +parts.second);
  return (asIfUTC - date.getTime()) / 60000;
}

// The instant that is local midnight, for the given Y/M/D, in timeZone.
// Independent per calendar day — correct on both DST transition dates.
export function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guessUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = offsetMinutesAt(new Date(guessUtc), timeZone);
  return new Date(guessUtc - offset * 60000);
}

// Local calendar date (Y/M/D) "now" in timeZone.
export function localYmdNow(timeZone: string): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(dtf.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day };
}

export function addDays(y: number, m: number, d: number, n: number): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}