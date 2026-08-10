import { query } from './db';
import { sendEmail } from './email';

type SessionLike = {
  id: number;
  room_id?: number;
  coach_id: number;
  discipline: string;
  session_type?: string;
  starts_at: string;
  ends_at?: string;
};

async function adminEmails(): Promise<string[]> {
  const rows = await query<{ email: string }>("select email from person where kind = 'admin' and active = true");
  return rows.map((row) => row.email);
}

function sessionLine(session: SessionLike): string {
  const end = session.ends_at ? ` to ${session.ends_at}` : '';
  return `${session.discipline} at ${session.starts_at}${end}`;
}

async function activeAttendeeEmails(sessionId: number): Promise<string[]> {
  const attendees = await query<{ email: string }>(
    `select distinct p.email
       from enrolment e
       join person p on p.id = e.person_id
      where e.session_id = $1
        and e.status = 'active'
        and p.active = true`,
    [sessionId]
  );
  return attendees.map((row) => row.email);
}

export async function coachAttendeeIds(sessionId: number, excludeCoachId?: number): Promise<number[]> {
  const params: unknown[] = [sessionId];
  let excludeClause = '';
  if (excludeCoachId !== undefined) {
    params.push(excludeCoachId);
    excludeClause = ` and p.id <> $${params.length}`;
  }

  const rows = await query<{ id: number }>(
    `select distinct p.id
       from enrolment e
       join person p on p.id = e.person_id
      where e.session_id = $1
        and e.status = 'active'
        and p.kind = 'coach'
        and p.active = true${excludeClause}`,
    params
  );
  return rows.map((row) => row.id);
}

export async function onCoachCancelledSession(session: SessionLike, attendeeEmails?: string[]) {
  const [coach] = await query<{ email: string; full_name: string }>(
    'select email, full_name from person where id = $1',
    [session.coach_id]
  );
  const attendees = attendeeEmails || await activeAttendeeEmails(session.id);
  const recipients = [...new Set(attendees)];
  const admins = await adminEmails();
  const subject = `Session cancelled: ${session.discipline}`;
  const line = sessionLine(session);

  for (const admin of admins) {
    await sendEmail(
      admin,
      subject,
      `${coach?.full_name || 'A coach'} cancelled ${line}. Affected participants have been notified.`
    );
  }
  for (const email of recipients) {
    await sendEmail(email, subject, `Your booked session has been cancelled:\n\n${line}`);
  }
}

export async function onParticipantBooked(session: SessionLike, personId: number) {
  const [coach] = await query<{ email: string }>('select email from person where id = $1 and active = true', [
    session.coach_id
  ]);
  const [person] = await query<{ full_name: string }>('select full_name from person where id = $1', [personId]);
  if (!coach) return;

  await sendEmail(
    coach.email,
    'New session booking',
    `${person?.full_name || 'A participant'} booked ${sessionLine(session)}.`
  );
}

export async function onParticipantCancelled(enrolment: SessionLike, personId: number) {
  const [coach] = await query<{ email: string }>('select email from person where id = $1 and active = true', [
    enrolment.coach_id
  ]);
  const [person] = await query<{ full_name: string }>('select full_name from person where id = $1', [personId]);
  if (!coach) return;

  await sendEmail(
    coach.email,
    'Booking cancelled',
    `${person?.full_name || 'A participant'} cancelled their booking for ${sessionLine(enrolment)}.`
  );
}

export async function onCoachAttendingChanged(session: SessionLike, attendingCoachIds: number[]) {
  const uniqueIds = [...new Set(attendingCoachIds)].filter((id) => id !== session.coach_id);
  if (uniqueIds.length === 0) return;

  const coaches = await query<{ email: string }>(
    `select email from person where id = any($1) and kind = 'coach' and active = true`,
    [uniqueIds]
  );
  for (const coach of coaches) {
    await sendEmail(
      coach.email,
      'Session you are attending changed',
      `A session you are attending has changed:\n\n${sessionLine(session)}`
    );
  }
}

export async function onRoomBooked(session: SessionLike) {
  const [coach] = await query<{ full_name: string }>('select full_name from person where id = $1', [
    session.coach_id
  ]);
  const [room] = session.room_id ? await query<{ name: string }>('select name from room where id = $1', [session.room_id]) : [];
  const admins = await adminEmails();

  for (const admin of admins) {
    await sendEmail(
      admin,
      'Room booked',
      `${coach?.full_name || 'A coach'} booked ${room?.name || 'a room'} for ${sessionLine(session)}.`
    );
  }
}

export async function onRoomCancelled(session: SessionLike) {
  const [coach] = await query<{ full_name: string }>('select full_name from person where id = $1', [
    session.coach_id
  ]);
  const [room] = session.room_id ? await query<{ name: string }>('select name from room where id = $1', [session.room_id]) : [];
  const admins = await adminEmails();

  for (const admin of admins) {
    await sendEmail(
      admin,
      'Room cancelled',
      `${coach?.full_name || 'A coach'} cancelled ${room?.name || 'a room'} for ${sessionLine(session)}.`
    );
  }
}
