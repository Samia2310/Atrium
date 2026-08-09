'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

type Room = { id: number; name: string; capacity: number };
type Person = { id: number; full_name: string; email: string; kind: string };
type Session = {
  id: number;
  discipline: string;
  session_type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  room_capacity: number;
  coach_name: string;
  enrolled_count: number;
  places_remaining: number;
};

const dayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

const disciplines = [
  'fitness',
  'lifestyle',
  'financial',
  'nutrition',
  'career',
  'mindfulness'
];

const sessionTypes = ['short', 'standard', 'intensive'];

const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const dayMilliseconds = 24 * 60 * 60 * 1000;

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export default function AdminSessions() {
  const [hydrated, setHydrated] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [discipline, setDiscipline] = useState(disciplines[0]);
  const [sessionType, setSessionType] = useState(sessionTypes[1]);
  const [roomId, setRoomId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const days = [0, 1, 2, 3, 4, 5, 6].map(
    (offset) => new Date(weekStart.getTime() + offset * dayMilliseconds)
  );

  function loadSessions() {
    const to = new Date(weekStart.getTime() + 7 * dayMilliseconds);

    fetch(
      `${API_BASE}/api/sessions?from=${weekStart.toISOString()}&to=${to.toISOString()}`,
      { credentials: 'include' }
    )
      .then((res) => res.json())
      .then((rows) => {
        if (rows.error) throw new Error(rows.error);
        setSessions(rows);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [weekStart]);

  useEffect(() => {
    fetch(`${API_BASE}/api/rooms`, { credentials: 'include' })
      .then((res) => res.json())
      .then(setRooms);

    fetch(`${API_BASE}/api/people?kind=coach`, { credentials: 'include' })
      .then((res) => res.json())
      .then(setPeople);
  }, []);

  function sessionsFor(day: Date, hour: number) {
    return sessions.filter((session) => {
      const starts = new Date(session.starts_at);
      return (
        starts.getFullYear() === day.getFullYear() &&
        starts.getMonth() === day.getMonth() &&
        starts.getDate() === day.getDate() &&
        starts.getHours() === hour
      );
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setError('');

    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        room_id: Number(roomId),
        coach_id: Number(coachId),
        discipline,
        session_type: sessionType,
        starts_at: centreLocalInputToIso(date, startTime)
      })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Could not create the session.');
      return;
    }

    setNotice('Session created.');
    loadSessions();
  }

  if (!hydrated) {
    return (
      <main className="page-shell">
        <section className="section-heading">
          <div>
            <p className="eyebrow">Administrator</p>
            <h1>Session calendar</h1>
          </div>
        </section>
        <p className="notice">Loading session calendar...</p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Session calendar</h1>
        </div>
      </section>

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="notice error">{error}</p>}

      <p>
        <button onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * dayMilliseconds))}>
          Previous week
        </button>{' '}
        <button onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * dayMilliseconds))}>
          Next week
        </button>
      </p>

      <table className="calendar">
        <thead>
          <tr>
            <th className="hour"></th>
            {days.map((day, index) => (
              <th key={index}>
                {dayNames[index]} {day.getDate()}/{day.getMonth() + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <th className="hour">{hour}:00</th>
              {days.map((day, index) => (
                <td key={index}>
                  {sessionsFor(day, hour).map((session) => (
                    <div className="entry" key={session.id}>
                      {session.discipline} — {session.room_name} ({session.enrolled_count}/
                      {session.room_capacity})
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Create a session</h2>
      <form onSubmit={onSubmit}>
        <label>
          <span>Date</span>
          <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          <span>Starts</span>
          <input
            required
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>
        <label>
          <span>Discipline</span>
          <select value={discipline} onChange={(event) => setDiscipline(event.target.value)}>
            {disciplines.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Type</span>
          <select value={sessionType} onChange={(event) => setSessionType(event.target.value)}>
            {sessionTypes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Room</span>
          <select required value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value=""></option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Coach</span>
          <select required value={coachId} onChange={(event) => setCoachId(event.target.value)}>
            <option value=""></option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Create</button>
      </form>
    </main>
  );
}

function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asIfUtc - date.getTime()) / 60000;
}

function centreLocalInputToIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = offsetMinutesAt(new Date(localAsUtc), 'America/New_York');
  return new Date(localAsUtc - offset * 60_000).toISOString();
}
