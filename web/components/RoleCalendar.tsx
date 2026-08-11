'use client';

type CalendarItem = {
  id: number;
  discipline: string;
  session_type: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  is_own?: boolean;
  is_attending?: boolean;
};

type RoleCalendarProps = { items: CalendarItem[]; role: 'participant' | 'coach' };
const hours = Array.from({ length: 14 }, (_, index) => index + 7);
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const timeZone = 'America/New_York';

function localParts(value: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, weekday: 'short', hour: '2-digit' }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { day: dayNames.indexOf(parts.weekday), hour: Number(parts.hour === '24' ? 0 : parts.hour) };
}

function dayLabel(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + offset);
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(date);
}

export default function RoleCalendar({ items, role }: RoleCalendarProps) {
  return <div className="role-calendar" aria-label={`${role} weekly calendar`}>
    <div className="calendar-toolbar"><span>07:00 - 21:00</span><strong>This week</strong><span>America/New_York</span></div>
    <div className="calendar-scroll"><div className="role-calendar-grid"><div className="calendar-corner" />
      {dayNames.map((day, index) => <div className="calendar-day-header" key={day}><strong>{day}</strong><span>{dayLabel(index)}</span></div>)}
      {hours.map((hour) => <div className="calendar-row" key={hour}><div className="calendar-hour">{String(hour).padStart(2, '0')}:00</div>
        {dayNames.map((_, dayIndex) => { const cellItems = items.filter((item) => { const parts = localParts(item.starts_at); return parts.day === dayIndex && parts.hour === hour; }); return <div className="calendar-cell" key={`${hour}-${dayIndex}`}>
          {cellItems.map((item) => <div className={`calendar-entry ${item.is_own || item.is_attending ? 'calendar-entry-active' : ''}`} key={item.id}><strong>{item.discipline}</strong><span>{item.session_type}</span><small>{item.room_name}</small></div>)}
        </div>; })}
      </div>)}
    </div></div>
  </div>;
}