'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Assistant from '@/components/Assistant';

type Me = { full_name: string; credits: string };
type Session = { id: number; discipline: string; session_type: string; starts_at: string; ends_at: string; room_name: string; coach_name: string; places_remaining: number; seat_fee_credits: string };
type Booking = {
  id: number;
  session_id: number;
  discipline: string;
  starts_at: string;
  ends_at: string;
  status: string;
  session_status: string;
  credits_charged: string;
  credits_refunded: string;
};

function sessionWindow() {
  const from = new Date();
  return `?from=${from.toISOString()}&to=${new Date(from.getTime() + 14 * 86400000).toISOString()}`;
}

function centreTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short'
  });
}

export default function ParticipantDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);
  async function book(sessionId: number) {
    try { await apiFetch('/api/enrolments', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not book that session.'); }
  }
  async function cancel(id: number) {
    try { await apiFetch(`/api/enrolments/${id}/cancel`, { method: 'POST' }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel that booking.'); }
  }
  async function load() {
    const [person, available, mine] = await Promise.all([
      apiFetch<Me>('/api/me'),
      apiFetch<Session[]>(`/api/sessions${sessionWindow()}`),
      apiFetch<Booking[]>('/api/enrolments/mine')
    ]);
    setMe(person);
    setSessions(available);
    setBookings(mine);
  }

  const booked = new Set(bookings.filter((row) => row.status === 'active').map((row) => row.session_id));
  return (
    <main className="page-shell role-page">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Participant</p>
          <h1>{me ? me.full_name : 'Your dashboard'}</h1>
        </div>
        <div className="metric">{me ? `${me.credits} credits` : 'Loading...'}</div>
      </section>

      {error && <p className="notice error">{error}</p>}
      <section className="role-grid">
          <div><div className="section-heading compact-heading"><div><p className="eyebrow">Next 14 days</p><h2>Book a place</h2></div><a className="button ghost" href="/calendar">Open calendar</a></div>
          <div className="session-list">{sessions.map((session) => <article className="session-card" key={session.id}><div><span className="session-type">{session.session_type}</span><h3>{session.discipline}</h3><p>{centreTime(session.starts_at)} in {session.room_name}</p><small>{session.places_remaining} places left with {session.coach_name}</small></div><div className="session-action"><strong>{session.seat_fee_credits} credits</strong><button disabled={booked.has(session.id) || session.places_remaining < 1} onClick={() => book(session.id)}>{booked.has(session.id) ? 'Already booked' : session.places_remaining < 1 ? 'Full' : 'Book place'}</button></div></article>)}</div>
        </div>
        <aside className="role-side"><p className="eyebrow">Profile</p><h2>Participant account</h2><p className="muted">Book places and manage enrolments.</p><div className="profile-facts"><span>Starting balance</span><strong>4000 credits</strong><span>Current balance</span><strong>{me ? `${me.credits} credits` : 'Loading...'}</strong></div></aside>
      </section>

      {bookings.length > 0 && (
        <section className="role-section"><div className="section-heading compact-heading"><div><p className="eyebrow">Your calendar</p><h2>Bookings</h2></div></div><div className="booking-list">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Starts</th>
                <th>Status</th>
                <th>Paid</th>
                <th>Refunded</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.discipline}</td>
                  <td>{centreTime(booking.starts_at)}</td>
                  <td>{booking.status} / {booking.session_status}</td>
                  <td>{booking.credits_charged}</td>
                  <td>{booking.credits_refunded}</td>
                  <td><button className="button secondary" disabled={booking.status !== 'active'} onClick={() => cancel(booking.id)}>Cancel</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></section>
      )}
      <Assistant />
    </main>
  );
}
