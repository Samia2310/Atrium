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

type LoginMode = 'participant' | 'coach';

const modeCopy: Record<LoginMode, { title: string; help: string; placeholder: string }> = {
  participant: {
    title: 'Participant access',
    help: 'Book sessions, review your enrolments and keep track of credits.',
    placeholder: 'participant@example.com'
  },
  coach: {
    title: 'Coach access',
    help: 'Manage your coached sessions, room bookings and availability.',
    placeholder: 'coach@example.com'
  }
};

function dashboardFor(kind: LoginResponse['kind']) {
  if (kind === 'admin') return '/admin';
  if (kind === 'coach') return '/coach';
  return '/participant';
}

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('participant');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <section className="auth-copy" aria-label="Atrium sign in">
        <p className="eyebrow">Atrium Coaching Centre</p>
        <h1>Welcome back.</h1>
        <p className="lede">
          One secure login takes each person to the workspace their account is allowed to use.
        </p>
      </section>
      <form className="panel" onSubmit={onSubmit}>
        <h1>Log in</h1>
        <p className="muted">Choose your account type, then sign in with your Atrium credentials.</p>
        <div className="segmented-control" aria-label="Account type">
          <button
            type="button"
            className={mode === 'participant' ? 'active' : ''}
            onClick={() => setMode('participant')}
          >
            Participant
          </button>
          <button
            type="button"
            className={mode === 'coach' ? 'active' : ''}
            onClick={() => setMode('coach')}
          >
            Coach
          </button>
        </div>
        <div className="login-mode-note">
          <strong>{modeCopy[mode].title}</strong>
          <span>{modeCopy[mode].help}</span>
        </div>
        {error && <p className="notice error">{error}</p>}
        <label>
          <span>Email</span>
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            placeholder={modeCopy[mode].placeholder}
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
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Log in'}</button>
      </form>
    </main>
  );
}
