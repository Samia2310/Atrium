import Assistant from '@/components/Assistant';

export const dynamic = 'force-dynamic';

type Session = {
  id: number;
  discipline: string;
  session_type: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  coach_name: string;
  places_remaining: number;
  seat_fee_credits: string;
};

const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4000';

async function getUpcomingSessions(): Promise<
  { ok: true; sessions: Session[] } | { ok: false; error: string }
> {
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);

  try {
    const res = await fetch(
      `${apiBaseUrl}/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return { ok: false, error: `Schedule could not be loaded (${res.status}).` };
    return { ok: true, sessions: await res.json() };
  } catch {
    return { ok: false, error: 'Schedule could not be loaded. Is the API running?' };
  }
}

function centreTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export default async function PublicPage() {
  const result = await getUpcomingSessions();

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Atrium Coaching Centre</p>
          <h1>Book coaching sessions with clear credit rules.</h1>
          <p className="lede">
            Atrium runs Monday to Saturday, 07:00 to 21:00 America/New_York. Rooms are closed on Sundays.
          </p>
        </div>
        <a className="button" href="/login">Sign in</a>
      </section>

      <section className="policy-grid" aria-label="Booking policies">
        <article>
          <h2>Fees</h2>
          <p>Short: room 30 credits, seat 15 credits. Standard: room 40, seat 20. Intensive: room 120, seat 60.</p>
        </article>
        <article>
          <h2>Coach cancellation</h2>
          <p>96+ hours notice refunds 100%, 48-96 hours 50%, 24-48 hours 25%, under 24 hours 0%.</p>
        </article>
        <article>
          <h2>Participant cancellation</h2>
          <p>Participants follow the same notice tiers. Partial-credit refunds round down to whole credits.</p>
        </article>
        <article>
          <h2>When a coach cancels</h2>
          <p>Every affected participant gets a full seat refund because the cancellation was outside their control.</p>
        </article>
      </section>

      <section>
        <div className="section-heading">
          <h2>Upcoming Sessions</h2>
          <p>Times are shown in the centre timezone.</p>
        </div>

        {!result.ok && <p className="notice error">{result.error}</p>}
        {result.ok && result.sessions.length === 0 && <p className="notice">No sessions are scheduled in the next two weeks.</p>}

        {result.ok && result.sessions.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Starts</th>
                  <th>Room</th>
                  <th>Coach</th>
                  <th>Seat fee</th>
                  <th>Places</th>
                </tr>
              </thead>
              <tbody>
                {result.sessions.map((session) => (
                  <tr key={session.id}>
                    <td>{session.discipline} / {session.session_type}</td>
                    <td>{centreTime(session.starts_at)}</td>
                    <td>{session.room_name}</td>
                    <td>{session.coach_name}</td>
                    <td>{session.seat_fee_credits}</td>
                    <td>{session.places_remaining > 0 ? session.places_remaining : 'Full'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Assistant />
    </main>
  );
}
