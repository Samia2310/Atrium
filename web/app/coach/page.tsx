'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Assistant from '@/components/Assistant';

type Me = { full_name: string; credits: string };
type Room = { id: number; name: string; capacity: number };
type CalendarItem = {
  id: number;
  discipline: string;
  session_type: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  coach_name: string | null;
  is_own: boolean;
  is_attending: boolean;
  attendees?: { id: number; full_name: string; email: string; status: string }[];
};

const disciplines = ['fitness', 'lifestyle', 'financial', 'nutrition', 'career', 'mindfulness'];
const sessionTypes = ['short', 'standard', 'intensive'];

function calendarWindow() {
  const from = new Date();
  const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function CoachDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [discipline, setDiscipline] = useState(disciplines[0]);
  const [sessionType, setSessionType] = useState(sessionTypes[1]);
  const [roomId, setRoomId] = useState('');

  useEffect(() => { load().catch((err) => setError(err.message)); }, []);
  async function load() {
    const [person, roomRows, calendar] = await Promise.all([
      apiFetch<Me>('/api/me'),
      apiFetch<Room[]>('/api/rooms'),
      apiFetch<CalendarItem[]>(`/api/calendar?from=${new Date().toISOString()}&to=${new Date(Date.now() + 30 * 86400000).toISOString()}`)
    ]);
    const ownItems = calendar.filter((item) => item.is_own);
    const ownDetails = await Promise.all(ownItems.map((item) => apiFetch<{ attendees: CalendarItem['attendees'] }>(`/api/sessions/${item.id}`)));
    const attendeesBySession = new Map(ownItems.map((item, index) => [item.id, ownDetails[index].attendees || []]));
    setMe(person);
    setRooms(roomRows);
    setItems(calendar.map((item) => ({ ...item, attendees: attendeesBySession.get(item.id) })));
  }

  async function saveSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const path = editingId ? `/api/sessions/${editingId}` : '/api/sessions';
      await apiFetch(path, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({ room_id: Number(roomId), discipline, session_type: sessionType, starts_at: centreLocalInputToIso(date, startTime) })
      });
      setNotice(editingId ? 'Session updated and affected attendees notified.' : 'Session created and room credits charged.');
      setEditingId(null); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save that session.'); }
    finally { setSaving(false); }
  }

  async function cancelSession(id: number) {
    if (!window.confirm('Cancel this session? Active participants will receive a full seat refund.')) return;
    setSaving(true); setError(''); setNotice('');
    try { const result = await apiFetch<{ room_fee_refunded: number; enrolments_cancelled: number }>(`/api/sessions/${id}/cancel`, { method: 'POST' }); setNotice(`Session cancelled. ${result.enrolments_cancelled} participant(s) received a full refund.`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel that session.'); }
    finally { setSaving(false); }
  }

  function editSession(item: CalendarItem) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(item.starts_at));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    setEditingId(item.id); setDate(`${values.year}-${values.month}-${values.day}`); setStartTime(`${values.hour === '24' ? '00' : values.hour}:${values.minute}`); setDiscipline(item.discipline); setSessionType(item.session_type); setRoomId(String(rooms.find((room) => room.name === item.room_name)?.id || ''));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const own = items.filter((item) => item.is_own);
  const busy = items.filter((item) => !item.is_own);

  return (
    <main className="page-shell role-page">
      <section className="role-hero">
        <div>
          <p className="eyebrow">Coach profile</p>
          <h1>{me ? me.full_name : 'Coach dashboard'}</h1>
          <p className="lede">Your teaching calendar and room commitments, kept together with your profile.</p>
        </div>
        <div className="credit-balance"><span>Available credits</span><strong>{me ? me.credits : '...'}</strong><small>Room fees are charged when sessions are created.</small></div>
      </section>

      {error && <p className="notice error">{error}</p>}
      {notice && <p className="notice success">{notice}</p>}

      <section className="role-section coach-tools">
        <div className="section-heading compact-heading"><div><p className="eyebrow">Room booking</p><h2>{editingId ? 'Reschedule your session' : 'Create a session'}</h2></div>{editingId && <button className="button secondary" type="button" onClick={() => setEditingId(null)}>Cancel edit</button>}</div>
        <p className="muted">Sessions must be Monday to Saturday, 07:00-21:00, and coaches need at least 48 hours notice.</p>
        <form className="session-form" onSubmit={saveSession}>
          <label><span>Date</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label><span>Starts</span><input required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
          <label><span>Discipline</span><select value={discipline} onChange={(event) => setDiscipline(event.target.value)}>{disciplines.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Type</span><select value={sessionType} onChange={(event) => setSessionType(event.target.value)}>{sessionTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Room</span><select required value={roomId} onChange={(event) => setRoomId(event.target.value)}><option value="">Select a room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} ({room.capacity} places)</option>)}</select></label>
          <button disabled={saving} type="submit">{saving ? 'Saving...' : editingId ? 'Save changes' : 'Book room'}</button>
        </form>
      </section>

      <section className="role-grid">
        <div className="role-main">
          <h2>Your Sessions</h2>
          {own.length === 0 && <p className="notice">No coached sessions in the next 30 days.</p>}
          {own.map((item) => (
            <article className="list-row" key={item.id}>
              <div><strong>{item.discipline} / {item.session_type}</strong><span>{centreTime(item.starts_at)} in {item.room_name}</span><small className="attendee-summary">{item.attendees?.length ? `${item.attendees.length} attendee(s): ${item.attendees.map((attendee) => `${attendee.full_name} (${attendee.status})`).join(', ')}` : 'No attendees yet'}</small></div>
              <div className="row-actions"><button className="button secondary" disabled={saving} onClick={() => editSession(item)}>Reschedule</button><button disabled={saving} onClick={() => cancelSession(item.id)}>Cancel session</button></div>
            </article>
          ))}
        </div>
        <div className="role-side">
          <p className="eyebrow">Profile</p><h2>Coach account</h2><p className="muted">{me ? me.full_name : 'Loading...'}</p>
          <div className="profile-facts"><span>Starting balance</span><strong>2000 credits</strong><span>Role access</span><strong>Teach sessions and view your calendar</strong></div>
          <p className="muted">{rooms.length} rooms are available to centre staff.</p>
        </div>
        <div className="role-main">
          <h2>Busy Room Blocks</h2>
          {busy.length === 0 && <p className="notice">No other busy blocks in this window.</p>}
          {busy.slice(0, 12).map((item) => (
            <article className="list-row muted-row" key={item.id}>
              <strong>{item.is_attending ? 'Attending' : 'Busy'}</strong>
              <span>{centreTime(item.starts_at)} in {item.room_name}</span>
            </article>
          ))}
        </div>
      </section>
      <Assistant />
    </main>
  );
}

function centreTime(value: string) {
  return new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
}

function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map((part) => [part.type, part.value]));
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(hour), Number(parts.minute), Number(parts.second));
  return (asIfUtc - date.getTime()) / 60000;
}

function centreLocalInputToIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = offsetMinutesAt(new Date(localAsUtc), 'America/New_York');
  return new Date(localAsUtc - offset * 60_000).toISOString();
}
