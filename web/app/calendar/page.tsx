'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Assistant from '@/components/Assistant';

type Me = { kind: 'participant' | 'coach' | 'admin'; full_name: string; credits?: string };
type CalendarItem = {
  id: number;
  discipline: string;
  session_type: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  coach_name: string | null;
  places_remaining?: number;
  seat_fee_credits?: string;
  is_own?: boolean;
  is_attending?: boolean;
  is_booked?: boolean;
};
type Session = CalendarItem & { places_remaining: number; seat_fee_credits: string };
type Booking = { id: number; session_id: number; status: string; credits_refunded: string };

const centreTime = (value: string) => new Date(value).toLocaleString('en-US', {
  timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short'
});

function groupByDay(items: CalendarItem[]) {
  return items.reduce<Record<string, CalendarItem[]>>((groups, item) => {
    const day = new Date(item.starts_at).toLocaleDateString('en-US', {
      timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric'
    });
    (groups[day] ||= []).push(item);
    return groups;
  }, {});
}

export default function CalendarPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [available, setAvailable] = useState<Session[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    const from = new Date();
    const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
    const person = await apiFetch<Me>('/api/me');
    const calendar = await apiFetch<CalendarItem[]>(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`);
    setMe(person);
    setItems(calendar);
    if (person.kind === 'participant') {
      const [sessions, mine] = await Promise.all([
        apiFetch<Session[]>(`/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`),
        apiFetch<Booking[]>('/api/enrolments/mine')
      ]);
      setAvailable(sessions);
      setBookings(mine);
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load the calendar.'));
  }, []);

  async function book(sessionId: number) {
    setBusyId(sessionId); setError(''); setNotice('');
    try { await apiFetch('/api/enrolments', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }); setNotice('Booked. Your credits and calendar have been updated.'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not book that session.'); }
    finally { setBusyId(null); }
  }

  async function cancel(bookingId: number) {
    setBusyId(bookingId); setError(''); setNotice('');
    try { const result = await apiFetch<{ credits_refunded: number }>(`/api/enrolments/${bookingId}/cancel`, { method: 'POST' }); setNotice(`Booking cancelled. ${result.credits_refunded} credits refunded.`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel that booking.'); }
    finally { setBusyId(null); }
  }

  if (!me) {
    return (
      <main className="page-shell">
        <p className={`notice ${error ? 'error' : ''}`}>{error || 'Loading your calendar...'}</p>
        {error && <button type="button" onClick={() => { setError(''); load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load the calendar.')); }}>Try again</button>}
      </main>
    );
  }

  if (me.kind === 'admin') return <main className="page-shell"><section className="section-heading"><div><p className="eyebrow">Administrator</p><h1>Calendar</h1></div><a className="button" href="/admin/sessions">Manage sessions</a></section><p className="notice">The administrator calendar includes full session management and attendee counts.</p></main>;

  const participantItems = me.kind === 'participant' ? available : items;
  const grouped = groupByDay(participantItems);
  const bookingBySession = new Map(bookings.filter((booking) => booking.status === 'active').map((booking) => [booking.session_id, booking]));

  return (
    <main className="page-shell role-page">
      <section className="role-hero">
        <div><p className="eyebrow">{me.kind === 'coach' ? 'Coach calendar' : 'Participant calendar'}</p><h1>{me.full_name}</h1><p className="lede">Everything here is shown in America/New_York time.</p></div>
        {me.credits && <div className="credit-balance"><span>Available credits</span><strong>{me.credits}</strong></div>}
      </section>
      {notice && <p className="notice success">{notice}</p>}
      {error && <p className="notice error">{error}</p>}
      {Object.keys(grouped).length === 0 && <p className="notice">No sessions in the next 30 days.</p>}
      <section className="agenda" aria-label="Upcoming calendar">
        {Object.entries(grouped).map(([day, dayItems]) => (
          <section className="agenda-day" key={day}>
            <h2>{day}</h2>
            <div className="agenda-list">
              {dayItems.map((item) => {
                const booking = bookingBySession.get(item.id);
                const own = me.kind === 'coach' && item.is_own;
                return <article className={`agenda-item ${own ? 'agenda-own' : ''}`} key={item.id}>
                  <div><span className="session-type">{item.session_type}</span><h3>{item.discipline}</h3><p>{centreTime(item.starts_at)} to {centreTime(item.ends_at)}</p><small>{item.room_name}{item.coach_name ? ` with ${item.coach_name}` : ''}{me.kind === 'coach' && !own ? ' · Busy room block' : ''}</small></div>
                  {me.kind === 'participant' && <div className="session-action"><strong>{item.seat_fee_credits} credits</strong>{booking ? <button className="button secondary" disabled={busyId === booking.id} onClick={() => cancel(booking.id)}>{busyId === booking.id ? 'Cancelling...' : 'Cancel booking'}</button> : <button disabled={busyId === item.id || (item.places_remaining ?? 0) < 1} onClick={() => book(item.id)}>{busyId === item.id ? 'Booking...' : (item.places_remaining ?? 0) < 1 ? 'Full' : 'Book place'}</button>}</div>}
                </article>;
              })}
            </div>
          </section>
        ))}
      </section>
      <Assistant />
    </main>
  );
}