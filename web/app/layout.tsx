import type { Metadata } from 'next';
import './globals.css';
import SiteNav from '@/components/SiteNav';
import Assistant from '@/components/Assistant';

export const metadata: Metadata = {
  title: 'Atrium'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
        <Assistant />
      </body>
    </html>
  );
}
