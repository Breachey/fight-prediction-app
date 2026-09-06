import { buildEventCalendar } from '../../../Server/lib/eventCalendar.mjs';
export { buildEventCalendar, getCalendarStart, getUpcomingCalendarEvents } from '../../../Server/lib/eventCalendar.mjs';

export function downloadEventCalendar(events) {
  const calendar = buildEventCalendar(events, { origin: window.location.origin });
  const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = events.length === 1 ? `ufc-event-${encodeURIComponent(events[0].id)}.ics` : 'upcoming-ufc-fights.ics';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
