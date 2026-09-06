// RFC 5545 calendar exports. MST is fixed UTC-07:00, without daylight saving.
const SEGMENTS = [['early_prelims', 'Early Prelims'], ['prelims', 'Prelims'], ['main_card', 'Main Card']];
const MST_OFFSET = 7 * 60 * 60 * 1000;
const timestamp = (value) => {
  // Reject ambiguous local timestamps rather than depending on the user's timezone.
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const compact = (date) => date.toISOString().replace(/[-:]/g, '').slice(0, 15);
const mstDate = (date) => new Date(date.getTime() - MST_OFFSET);
const dateOnly = (value) => {
  const day = String(value || '').split('T')[0];
  const parsed = new Date(`${day}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(day) ? day : null;
};
export const getCalendarStart = (event) => {
  const dates = SEGMENTS.map(([key]) => timestamp(event.card_start_times?.[key])).filter(Boolean);
  if (!dates.length) return timestamp(event.start_time);
  return new Date(Math.min(...dates.map(Number)));
};
export function getUpcomingCalendarEvents(events, now = new Date()) {
  const today = mstDate(now).toISOString().slice(0, 10);
  const seen = new Set();
  return events.filter((event) => {
    if (event.id == null || seen.has(String(event.id)) || !/\bUFC\b/i.test(event.name || '') || event.is_completed || /complete|cancel/i.test(event.status || '')) return false;
    const start = getCalendarStart(event);
    const upcoming = start ? start > now : dateOnly(event.date) >= today;
    if (upcoming) seen.add(String(event.id));
    return upcoming;
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
const escapeText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const foldLine = (line) => {
  let result = '', size = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 75) { result += '\r\n '; size = 1; }
    result += char;
    size += bytes;
  }
  return result;
};
export function buildEventCalendar(events, { now = new Date(), origin = '', subscription = false } = {}) {
  // Subscription loaders supply a rolling window including recently completed events.
  // Keep these in the feed so finishing an event does not immediately erase it.
  const upcoming = subscription
    ? events.filter(event => event.id != null && /\bUFC\b/i.test(event.name || '') && (getCalendarStart(event) || dateOnly(event.date)))
    : getUpcomingCalendarEvents(events, now);
  if (!subscription && !upcoming.length) throw new Error('No upcoming UFC events available to export.');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fight Picker//UFC Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Upcoming UFC Fights', 'X-WR-TIMEZONE:America/Phoenix',
    'BEGIN:VTIMEZONE', 'TZID:America/Phoenix', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0700', 'TZNAME:MST', 'END:STANDARD', 'END:VTIMEZONE'];
  if (subscription) lines.splice(lines.indexOf('BEGIN:VTIMEZONE'), 0, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H');
  for (const event of upcoming) {
    const start = getCalendarStart(event);
    const details = ['Times in MST (UTC-7 year-round).'];
    for (const [key, label] of SEGMENTS) {
      const time = timestamp(event.card_start_times?.[key]);
      if (time) details.push(`${label}: ${time.toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} MST`);
    }
    if (start) details.push(`Event starts: ${start.toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'medium', timeStyle: 'short' })} MST`);
    else details.push('Start time TBD. All-day placeholder until a time is confirmed.');
    details.push(subscription
      ? 'Schedule subject to change. Subscribed calendars receive updates when your calendar provider refreshes this feed.'
      : 'Schedule subject to change. Download again for updated times.');
    lines.push('BEGIN:VEVENT', `UID:ufc-event-${encodeURIComponent(event.id)}@fight-picker`, `DTSTAMP:${compact(now)}Z`,
      start ? `DTSTART;TZID=America/Phoenix:${compact(mstDate(start))}` : `DTSTART;VALUE=DATE:${dateOnly(event.date).replace(/-/g, '')}`,
      `SUMMARY:${escapeText(event.name)}${start ? '' : ' (time TBD)'}`,
      `DESCRIPTION:${escapeText(details.join('\n'))}`,
      `LOCATION:${escapeText([event.venue, event.location_city, event.location_state, event.location_country].filter(Boolean).join(', '))}`);
    if (origin) lines.push(`URL:${new URL(`/?event=${encodeURIComponent(event.id)}&view=picks`, origin).href}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
