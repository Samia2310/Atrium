'use client';

type Role = 'participant' | 'coach';
type View = 'dashboard' | 'available' | 'booked' | 'calendar';

const labels: [View, string][] = [['dashboard', 'Dashboard'], ['available', 'Available slots'], ['booked', 'Booked sessions'], ['calendar', 'Calendar']];

export default function RoleSubNav({ role, active }: { role: Role; active: View }) {
  return <nav className="role-subnav" aria-label={`${role} sections`}>
    {labels.map(([view, label]) => <a className={active === view ? 'active' : ''} href={view === 'dashboard' ? `/${role}` : view === 'calendar' ? `/calendar?role=${role}` : `/${role}?view=${view}`} key={view}>{label}</a>)}
  </nav>;
}