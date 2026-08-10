import { Router } from 'express';
import { readSession, SESSION_COOKIE } from '../auth';
import { query } from '../db';
import { Caller, tools, ToolName } from './assistantTools';

const router = Router();

async function resolveCaller(req: any): Promise<Caller> {
  const session = readSession(req.cookies ? req.cookies[SESSION_COOKIE] : undefined);
  if (!session) return { personId: null, kind: 'anonymous' };

  const [person] = await query<{ kind: string }>('select kind from person where id = $1', [session.personId]);
  if (!person) return { personId: null, kind: 'anonymous' };

  return { personId: session.personId, kind: person.kind as Caller['kind'] };
}

function pickToolsFor(kind: Caller['kind']): ToolName[] {
  const base: ToolName[] = ['searchSessions'];
  if (kind === 'participant') return [...base, 'myBookings', 'myCreditBalance'];
  if (kind === 'coach') return [...base, 'myUpcomingSessionsWithAttendees', 'myCreditBalance'];
  if (kind === 'admin') return [...base, 'searchAnyPerson', 'myBookings', 'myCreditBalance'];
  return base;
}

function requestedDiscipline(message: string): string | undefined {
  const disciplines = ['fitness', 'lifestyle', 'financial', 'nutrition', 'career', 'mindfulness'];
  return disciplines.find((discipline) => message.toLowerCase().includes(discipline));
}

function isGreeting(message: string): boolean {
  return /^(hi|hello|hey|helo|heloo|good morning|good afternoon|good evening)\b/i.test(message.trim());
}

function isCapabilityQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('can i ask') ||
    lower.includes('what can you do') ||
    lower.includes('help') ||
    lower.includes('question')
  );
}

function formatSessions(rows: any[]): string {
  if (rows.length === 0) return 'I could not find any upcoming sessions that match.';
  return rows.slice(0, 5).map((row) => {
    const starts = new Date(row.starts_at).toLocaleString('en-US', {
      timeZone: process.env.CENTRE_TIMEZONE || 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    const places = row.places_remaining === undefined ? '' : `, ${row.places_remaining} places left`;
    const fee = row.seat_fee_credits === undefined ? '' : `, ${row.seat_fee_credits} credits`;
    return `#${row.id} ${row.discipline} ${row.session_type} on ${starts}${fee}${places}`;
  }).join('\n');
}

async function answerFromTools(message: string, caller: Caller, allowedTools: ToolName[]): Promise<string> {
  const lower = message.toLowerCase();

  if (isGreeting(message)) {
    return 'Hello. I can help you find upcoming sessions, check bookings and answer credit questions for your Atrium account.';
  }

  if (isCapabilityQuestion(message)) {
    const privateHelp = caller.kind === 'anonymous'
      ? 'Sign in first if you want me to check your bookings or credit balance.'
      : 'You can ask about your bookings, credits or upcoming sessions.';
    return `Yes. Ask me about Atrium sessions, coaches, rooms, bookings or credits. ${privateHelp}`;
  }

  if ((lower.includes('credit') || lower.includes('balance')) && allowedTools.includes('myCreditBalance')) {
    const result = await tools.myCreditBalance(caller, {});
    if ('error' in result) return result.error || 'That information is not available.';
    return `Your current credit balance is ${result.credits}.`;
  }

  if ((lower.includes('my booking') || lower.includes('bookings')) && allowedTools.includes('myBookings')) {
    const result = await tools.myBookings(caller, {});
    if (!Array.isArray(result)) return result.error || 'That information is not available.';
    if (result.length === 0) return 'You do not have any bookings yet.';
    return result.map((row: any) => `#${row.id} ${row.discipline} on ${new Date(row.starts_at).toLocaleString()}: ${row.status}`).join('\n');
  }

  if ((lower.includes('attendee') || lower.includes('my sessions')) && allowedTools.includes('myUpcomingSessionsWithAttendees')) {
    const result = await tools.myUpcomingSessionsWithAttendees(caller, {});
    if (!Array.isArray(result)) return result.error || 'That information is not available.';
    if (result.length === 0) return 'You do not have upcoming coached sessions with attendees.';
    return result.map((row: any) => {
      const attendees = Array.isArray(row.attendees) ? row.attendees.map((a: any) => `${a.name} (${a.status})`).join(', ') : 'no attendees';
      return `#${row.id} ${row.discipline}: ${attendees}`;
    }).join('\n');
  }

  if (lower.includes('person') || lower.includes('email')) {
    if (!allowedTools.includes('searchAnyPerson')) {
      return 'I cannot look up other people from this account.';
    }
    const match = message.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    const result = await tools.searchAnyPerson(caller, { email: match ? match[0] : '' });
    if (!Array.isArray(result)) return result.error || 'That information is not available.';
    return result.length === 0 ? 'No matching people found.' : result.map((row: any) => `${row.full_name} (${row.email}) - ${row.kind}`).join('\n');
  }

  const result = await tools.searchSessions(caller, { discipline: requestedDiscipline(message) });
  return formatSessions(result);
}

router.post('/', async (req, res) => {
  try {
    const caller = await resolveCaller(req);
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const allowedTools = pickToolsFor(caller.kind);
    const reply = await answerFromTools(message, caller, allowedTools);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'assistant could not answer' });
  }
});

export default router;
