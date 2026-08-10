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
          <span className="brand-lockup" aria-label="Atrium">
            <span className="brand-mark" aria-hidden="true">A</span>
            <span className="brand-name">Atrium</span>
          </span>
          <a href="/#sessions">Sessions</a>
          <a href="/#policies">Policies</a>
          <a href="/login">Log in</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
