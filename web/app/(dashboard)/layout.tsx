'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type Me = { id: number; kind: 'participant' | 'coach' | 'admin'; full_name: string };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Me>('/api/me')
      .then(setMe)
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!me) return null;

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-medium">{me.full_name} · {me.kind}</span>
        <nav className="flex gap-4 text-sm">
          <a href={`/${me.kind}`}>Dashboard</a>
          <a href="/calendar">Calendar</a>
        </nav>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
