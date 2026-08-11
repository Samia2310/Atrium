'use client';

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

type Room = { id: number; name: string; capacity: number };
type Person = { id: number; full_name: string; email: string; kind: string };
type Session = { id: number; starts_at: string; ends_at: string };

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export default function AdminDashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const from = startOfWeek(new Date());
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

    Promise.all([
      fetch(`${API_BASE}/api/rooms`, { credentials: 'include' }).then((res) => res.json()),
      fetch(`${API_BASE}/api/people`, { credentials: 'include' }).then((res) => res.json()),
      fetch(
        `${API_BASE}/api/sessions?from=${from.toISOString()}&to=${to.toISOString()}`,
        { credentials: 'include' }
      ).then((res) => res.json())
    ])
      .then(([roomRows, peopleRows, sessionRows]) => {
        if (roomRows.error || peopleRows.error || sessionRows.error) {
          throw new Error(roomRows.error || peopleRows.error || sessionRows.error);
        }
        setRooms(roomRows);
        setPeople(peopleRows);
        setSessions(sessionRows);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="page-shell">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Dashboard</h1>
        </div>
        <a className="button" href="/admin/sessions">Session calendar</a>
      </section>
      {error && <p className="notice error">{error}</p>}
      <section className="stat-grid">
        <article className="stat-card"><span>Rooms</span><strong>{rooms.length}</strong><div className="stat-bars"><i /><i /><i /></div></article>
        <article className="stat-card"><span>Sessions this week</span><strong>{sessions.length}</strong><div className="stat-donut" style={{ '--stat-progress': `${Math.min(sessions.length * 10, 100)}%` } as React.CSSProperties}><b>{sessions.length}</b></div></article>
        <article className="stat-card"><span>People</span><strong>{people.length}</strong><div className="stat-bar"><i style={{ width: `${Math.min(people.length * 5, 100)}%` }} /></div></article>
      </section>
    </main>
  );
}
