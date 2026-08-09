'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Assistant from '@/components/Assistant';

type Me = { full_name: string; credits: string };
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
};

function nextMonthWindow() {
  const from = new Date();
  const to = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function CoachDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const { from, to } = nextMonthWindow();
    Promise.all([
      apiFetch<Me>('/api/me'),
      apiFetch<CalendarItem[]>(`/api/calendar?from=${from}&to=${to}`)
    ])
      .then(([person, rows]) => {
        setMe(person);
        setItems(rows);
      })
      .catch((err) => setError(err.message));
  }, []);

  const own = items.filter((item) => item.is_own);
  const busy = items.filter((item) => !item.is_own);

  return (
    <main className="page-shell">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Coach</p>
          <h1>{me ? me.full_name : 'Coach dashboard'}</h1>
        </div>
        <div className="metric">{me ? `${me.credits} credits` : 'Loading...'}</div>
      </section>

      {error && <p className="notice error">{error}</p>}

      <section className="split">
        <div>
          <h2>Your Sessions</h2>
          {own.length === 0 && <p className="notice">No coached sessions in the next 30 days.</p>}
          {own.map((item) => (
            <article className="list-row" key={item.id}>
              <strong>{item.discipline} / {item.session_type}</strong>
              <span>{new Date(item.starts_at).toLocaleString()} in {item.room_name}</span>
            </article>
          ))}
        </div>
        <div>
          <h2>Busy Room Blocks</h2>
          {busy.length === 0 && <p className="notice">No other busy blocks in this window.</p>}
          {busy.slice(0, 12).map((item) => (
            <article className="list-row muted-row" key={item.id}>
              <strong>{item.is_attending ? 'Attending' : 'Busy'}</strong>
              <span>{new Date(item.starts_at).toLocaleString()} in {item.room_name}</span>
            </article>
          ))}
        </div>
      </section>
      <Assistant />
    </main>
  );
}
