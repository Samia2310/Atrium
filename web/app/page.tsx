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

function apiBaseUrl() {
  return (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://localhost:4000'
  ).replace(/\/$/, '');
}

async function getUpcomingSessions(): Promise<
  { ok: true; sessions: Session[] } | { ok: false; error: string }
> {
  const from = new Date();
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
  const baseUrl = apiBaseUrl();

  if (process.env.NODE_ENV === 'production' && baseUrl.includes('localhost')) {
    return {
      ok: false,
      error: 'Schedule could not be loaded because the deployed web app is still configured to use localhost for the API.'
    };
  }

  try {
    const res = await fetch(
      `${baseUrl}/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
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
  const previewSessions = result.ok ? result.sessions.slice(0, 4) : [];

  return (
    <main>
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">Atrium Coaching Centre</p>
          <h1>Focused coaching, clear booking, calm scheduling.</h1>
          <p className="lede">
            Plan sessions across twelve rooms, spend credits with confidence and keep every booking visible to the right people.
          </p>
          <div className="hero-actions">
            <a className="button" href="/login">Log in</a>
            <a className="button secondary" href="#sessions">View schedule</a>
          </div>
        </div>
        <div className="home-hero-panel" aria-label="Atrium schedule preview">
          <div className="hero-panel-top">
            <span>Today at Atrium</span>
            <strong>{previewSessions.length || 0} upcoming</strong>
          </div>
          <div className="hero-panel-list">
            {previewSessions.length > 0 ? previewSessions.map((session) => (
              <article key={session.id}>
                <strong>{session.discipline}</strong>
                <span>{centreTime(session.starts_at)}</span>
                <small>{session.room_name} with {session.coach_name}</small>
              </article>
            )) : (
              <p className="muted">Live sessions appear here when the API is available.</p>
            )}
          </div>
        </div>
      </section>

      <section className="home-band">
        <div className="home-metrics" aria-label="Atrium highlights">
          <article>
            <strong>12</strong>
            <span>coaching rooms</span>
          </article>
          <article>
            <strong>6</strong>
            <span>open days weekly</span>
          </article>
          <article>
            <strong>4000</strong>
            <span>starting participant credits</span>
          </article>
        </div>
      </section>

      <section className="page-shell home-section" id="policies">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Before You Book</p>
            <h2>Simple rules, shown upfront.</h2>
          </div>
          <p>Opening hours are Monday to Saturday, 07:00 to 21:00 America/New_York. Rooms are closed on Sundays.</p>
        </div>
        <div className="policy-grid" aria-label="Booking policies">
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
          <p>96+ hours notice refunds 100%, 48-96 hours 75%, 24-48 hours 50%, and under 24 hours 0%. Partial refunds round down to whole credits. The gentler policy recognises that cancelling a place releases it back to the catalogue without releasing a coach's room cost.</p>
        </article>
        <article>
          <h2>When a coach cancels</h2>
          <p>Every affected participant gets a full seat refund because the cancellation was outside their control.</p>
        </article>
        </div>
      </section>

      <section className="page-shell home-section" id="sessions">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live Schedule</p>
            <h2>Upcoming sessions</h2>
          </div>
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
