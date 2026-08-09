export const CENTRE_TIMEZONE = process.env.CENTRE_TIMEZONE || 'America/New_York';

const SESSION_MINUTES: Record<string, number> = {
  short: 45,
  standard: 60,
  intensive: 210
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  weekday: string;
  minutes: number;
};

export function sessionMinutes(sessionType: string): number {
  return SESSION_MINUTES[sessionType] || 0;
}

export function sessionEnd(startsAt: Date, sessionType: string): Date | null {
  const minutes = sessionMinutes(sessionType);
  if (!minutes) return null;
  return new Date(startsAt.getTime() + minutes * 60 * 1000);
}

export function isKnownSessionType(sessionType: string): boolean {
  return sessionMinutes(sessionType) > 0;
}

function localParts(date: Date): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: CENTRE_TIMEZONE,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date).map((part) => [part.type, part.value])
  );

  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: String(parts.weekday),
    minutes: hour * 60 + Number(parts.minute)
  };
}

export function openingHoursViolation(startsAt: Date, endsAt: Date): string | null {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return 'starts_at must be a valid timestamp';
  }
  if (endsAt <= startsAt) return 'session must end after it starts';

  const start = localParts(startsAt);
  const end = localParts(endsAt);

  if (start.weekday === 'Sun') return 'Atrium is closed on Sundays';
  if (start.year !== end.year || start.month !== end.month || start.day !== end.day) {
    return 'session must fit inside one centre-local day';
  }
  if (start.minutes < 7 * 60 || end.minutes > 21 * 60) {
    return 'session must fit inside opening hours, 07:00 to 21:00 America/New_York';
  }

  return null;
}

export function hasFortyEightHoursNotice(startsAt: Date, from: Date = new Date()): boolean {
  return startsAt.getTime() - from.getTime() >= 48 * 60 * 60 * 1000;
}
