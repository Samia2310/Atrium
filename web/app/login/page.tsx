'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/api';

type LoginResponse = {
  id: number;
  email: string;
  full_name: string;
  kind: 'participant' | 'coach' | 'admin';
};

function dashboardFor(kind: LoginResponse['kind']) {
  if (kind === 'admin') return '/admin';
  if (kind === 'coach') return '/coach';
  return '/participant';
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@atrium.local');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Could not sign in.');
      return;
    }

    const person: LoginResponse = await res.json();
    router.push(dashboardFor(person.kind));
  }

  return (
    <main className="auth-shell">
      <form className="panel" onSubmit={onSubmit}>
        <h1>Log in</h1>
        <p className="muted">One sign-in for participants, coaches and administrators.</p>
        {error && <p className="notice error">{error}</p>}
        <label>
          <span>Email</span>
          <input
            required
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            required
            type="password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Log in'}</button>
      </form>
    </main>
  );
}
