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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
          <span className="password-field">
            <input
              required
              minLength={8}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.5" />
                {showPassword && <path className="password-slash" d="m4 4 16 16" />}
              </svg>
            </button>
          </span>
        </label>
        <label>
          <span>Confirm password</span>
          <span className="password-field">
            <input
              required
              minLength={8}
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
              aria-pressed={showConfirm}
              onClick={() => setShowConfirm((visible) => !visible)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.5" />
                {showConfirm && <path className="password-slash" d="m4 4 16 16" />}
              </svg>
            </button>
          </span>
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
