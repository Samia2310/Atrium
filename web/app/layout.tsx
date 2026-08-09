import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Atrium'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <a href="/">Atrium</a>
          <a href="/participant">Participant</a>
          <a href="/coach">Coach</a>
          <a href="/admin">Dashboard</a>
          <a href="/admin/sessions">Calendar</a>
          <a href="/login">Log in</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
