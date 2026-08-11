'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/api';

type Person = {
  id: number;
  email: string;
  full_name: string;
  kind: 'participant' | 'coach' | 'admin';
};

type AuthActionResponse = {
  setup_link?: string;
};

type AuthMode = 'sign-in' | 'create' | 'link';
type PublicKind = 'participant' | 'coach';

function dashboardFor(kind: Person['kind']) {
  if (kind === 'admin') return '/admin';
  if (kind === 'coach') return '/coach';
  return '/participant';
}

function titleFor(mode: AuthMode) {
  if (mode === 'create') return 'Create your account';
  if (mode === 'link') return 'Email me a sign-in link';
  return 'Sign in to Atrium';
}

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [kind, setKind] = useState<PublicKind>('participant');
  const [notice, setNotice] = useState('');
  const [setupLink, setSetupLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setNotice('');
    setSetupLink('');
    setError('');
    setPassword('');
    setShowPassword(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setSetupLink('');

    const endpoint =
      mode === 'create' ? '/api/register' :
      mode === 'link' ? '/api/request-password-set' :
      '/api/login';

    const body =
      mode === 'create' ? { email, full_name: fullName, kind } :
      mode === 'link' ? { email } :
      { email, password };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    setBusy(false);
    if (!res.ok) {
      const responseBody = await res.json().catch(() => ({}));
      setError(responseBody.error || 'Something went wrong. Please try again.');
      return;
    }

    if (mode === 'sign-in') {
      const person: Person = await res.json();
      router.push(dashboardFor(person.kind));
      return;
    }

    const responseBody: AuthActionResponse = await res.json();
    setNotice('Check your email for a secure link to verify the address and set your password.');
    if (responseBody.setup_link) setSetupLink(responseBody.setup_link);
    if (mode === 'create') setMode('sign-in');
  }

  return (
    <main className="auth-shell auth-shell-wide">
      <section className="auth-copy" aria-label="Atrium sign in">
        <p className="eyebrow">Atrium Coaching Centre</p>
        <h1>One calm door for every role.</h1>
        <p className="lede">
          Sign in with your email and password. Atrium sends each person to the right dashboard based on the account record, not a role selected in the browser.
        </p>
        <div className="auth-benefits" aria-label="Account rules">
          <article>
            <strong>Participants</strong>
            <span>Start with 4000 credits and book places in sessions.</span>
          </article>
          <article>
            <strong>Coaches</strong>
            <span>Start with 2000 credits and book rooms after email verification.</span>
          </article>
          <article>
            <strong>Administrators</strong>
            <span>Use seeded staff accounts. Public sign-up never creates admins.</span>
          </article>
        </div>
      </section>

      <section className="auth-card" aria-label={titleFor(mode)}>
        <div className="auth-tabs" aria-label="Authentication options">
          <button
            type="button"
            className={mode === 'sign-in' ? 'active' : ''}
            onClick={() => switchMode('sign-in')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'create' ? 'active' : ''}
            onClick={() => switchMode('create')}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <div>
            <h2>{titleFor(mode)}</h2>
            <p className="muted">
              {mode === 'create'
                ? 'Enter your details once. We will email a verification link before your password is set.'
                : mode === 'link'
                  ? 'Use this for a new password or to finish setting up an invited account.'
                  : 'No role picker needed. Your account decides where you land.'}
            </p>
          </div>

          {notice && (
            <div className="notice success">
              <p>{notice}</p>
              {setupLink && <a href={setupLink}>Open password setup link</a>}
            </div>
          )}
          {error && <p className="notice error">{error}</p>}

          {mode === 'create' && (
            <>
              <label>
                <span>Full name</span>
                <input
                  required
                  name="full_name"
                  autoComplete="name"
                  placeholder="Jordan Lee"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </label>
              <fieldset className="role-picker">
                <legend>Account type</legend>
                <label className={kind === 'participant' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="kind"
                    value="participant"
                    checked={kind === 'participant'}
                    onChange={() => setKind('participant')}
                  />
                  <span>
                    <strong>Participant</strong>
                    <small>Book seats and manage enrolments.</small>
                  </span>
                </label>
                <label className={kind === 'coach' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="kind"
                    value="coach"
                    checked={kind === 'coach'}
                    onChange={() => setKind('coach')}
                  />
                  <span>
                    <strong>Coach</strong>
                    <small>Book rooms and run sessions.</small>
                  </span>
                </label>
              </fieldset>
            </>
          )}

          <label>
            <span>Email</span>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          {mode === 'sign-in' && (
            <label>
              <span>Password</span>
              <span className="password-field">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
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
          )}

          <button type="submit" disabled={busy}>
            {busy
              ? 'Working...'
              : mode === 'create'
                ? 'Email verification link'
                : mode === 'link'
                  ? 'Send link'
                  : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'sign-in' ? (
            <button type="button" className="link-button" onClick={() => switchMode('link')}>
              Need to set or reset your password?
            </button>
          ) : (
            <button type="button" className="link-button" onClick={() => switchMode('sign-in')}>
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
