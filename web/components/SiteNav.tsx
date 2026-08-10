'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Me = { full_name: string; kind: 'participant' | 'coach' | 'admin' };

function dashboardFor(kind: Me['kind']) {
  return kind === 'admin' ? '/admin' : `/${kind}`;
}

export default function SiteNav() {
  const [me, setMe] = useState<Me | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    apiFetch<Me>('/api/me').then(setMe).catch(() => setMe(null));
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/';
    }
  }

  return (
    <nav>
      <span className="brand-lockup" aria-label="Atrium">
        <span className="brand-mark" aria-hidden="true">A</span>
        <span className="brand-name">Atrium</span>
      </span>
      <a href="/#sessions">Sessions</a>
      <a href="/#policies">Policies</a>
      {me ? (
        <>
          <a className="profile-link" href={dashboardFor(me.kind)}>
            <span className="profile-avatar" aria-hidden="true">{me.full_name.charAt(0).toUpperCase()}</span>
            <span>{me.full_name}</span>
            <small>{me.kind} profile</small>
          </a>
          <button className="nav-logout" type="button" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? 'Signing out...' : 'Log out'}
          </button>
        </>
      ) : (
        <a href="/login">Log in</a>
      )}
    </nav>
  );
}