'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Assistant from '@/components/Assistant';

type Me = { full_name: string; credits: string };
type Booking = {
  id: number;
  discipline: string;
  starts_at: string;
  ends_at: string;
  status: string;
  session_status: string;
  credits_charged: string;
  credits_refunded: string;
};

export default function ParticipantDashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<Me>('/api/me'),
      apiFetch<Booking[]>('/api/enrolments/mine')
    ])
      .then(([person, rows]) => {
        setMe(person);
        setBookings(rows);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="page-shell">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Participant</p>
          <h1>{me ? me.full_name : 'Your dashboard'}</h1>
        </div>
        <div className="metric">{me ? `${me.credits} credits` : 'Loading...'}</div>
      </section>

      {error && <p className="notice error">{error}</p>}
      {!error && bookings.length === 0 && <p className="notice">You have no bookings yet.</p>}

      {bookings.length > 0 && (
        <div className="table-wrap">
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
                  <td>{new Date(booking.starts_at).toLocaleString()}</td>
                  <td>{booking.status} / {booking.session_status}</td>
                  <td>{booking.credits_charged}</td>
                  <td>{booking.credits_refunded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Assistant />
    </main>
  );
}
