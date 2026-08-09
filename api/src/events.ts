// api/src/events.ts — the six event-driven paths from Section 9
import { query } from './db';
import { sendEmail } from './email';

async function adminEmails(): Promise<string[]> {
  const rows = await query<{ email: string }>("select email from person where kind = 'admin'");
  return rows.map((r) => r.email);
}

export async function onCoachCancelledSession(session: any, attendeeEmails?: string[]) {
  const [coach] = await query<{ email: string; full_name: string }>('select email, full_name from person where id = $1', [session.coach_id]);
  const attendees = attendeeEmails ? attendeeEmails.map((email) => ({ email })) : await query<{ email: string }>(
    `select p.email from enrolment e join person p on p.id = e.person_id where e.session_id = $1 and e.status = 'active'`,
    [session.id]
  );
  const admins = await adminEmails();
  const subject = `Session cancelled: ${session.discipline} at ${session.starts_at}`;
  for (const a of admins) await sendEmail(a, subject, `${coach.full_name} cancelled a session.`);
  for (const p of attendees) await sendEmail(p.email, subject, `Your booked session was cancelled.`);
}

export async function onParticipantBooked(session: any, personId: number) {
  const [coach] = await query<{ email: string }>('select email from person where id = $1', [session.coach_id]);
  const [person] = await query<{ full_name: string }>('select full_name from person where id = $1', [personId]);
  await sendEmail(coach.email, 'New booking', `${person.full_name} booked your ${session.discipline} session.`);
}

export async function onParticipantCancelled(enrolment: any, personId: number) {
  const [coach] = await query<{ email: string }>('select email from person where id = $1', [enrolment.coach_id]);
  const [person] = await query<{ full_name: string }>('select full_name from person where id = $1', [personId]);
  await sendEmail(coach.email, 'Booking cancelled', `${person.full_name} cancelled their booking.`);
}

export async function onCoachAttendingChanged(session: any, attendingCoachIds: number[]) {
  const coaches = await query<{ email: string }>(
    `select email from person where id = any($1)`, [attendingCoachIds]
  );
  for (const c of coaches) await sendEmail(c.email, 'Session updated', `A session you're attending changed.`);
}

export async function onRoomBooked(session: any) {
  const admins = await adminEmails();
  for (const a of admins) await sendEmail(a, 'Room booked', `A coach booked a room for ${session.discipline}.`);
}

export async function onRoomCancelled(session: any) {
  const admins = await adminEmails();
  for (const a of admins) await sendEmail(a, 'Room cancelled', `A coach cancelled a room booking.`);
}
