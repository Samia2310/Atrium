'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { API_BASE } from '@/lib/api';

type SetPasswordResponse = {
  kind: 'participant' | 'coach' | 'admin';
};

function dashboardFor(kind: SetPasswordResponse['kind']) {
  if (kind === 'admin') return '/admin';
  if (kind === 'coach') return '/coach';
  return '/participant';
}

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    const res = await fetch(`${API_BASE}/api/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, password })
    });
    setBusy(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Could not set your password.');
      return;
    }

    const person: SetPasswordResponse = await res.json();
    router.push(dashboardFor(person.kind));
  }

  return (
    <main className="auth-shell">
      <form className="panel" onSubmit={onSubmit}>
        <h1>Set password</h1>
        <p className="muted">Create a password for the account attached to this email link.</p>
        {!token && <p className="notice error">This password link is missing its token.</p>}
        {error && <p className="notice error">{error}</p>}
        <label>
          <span>Password</span>
          <input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          <span>Confirm password</span>
          <input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || !token}>{busy ? 'Saving...' : 'Set password'}</button>
      </form>
    </main>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<main className="auth-shell"><div className="panel">Loading...</div></main>}>
      <SetPasswordForm />
    </Suspense>
  );
}
