import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventCalendar, getUpcomingCalendarEvents } from '../src/utils/eventCalendar.js';
const now = new Date('2026-01-01T00:00:00Z');
const event = { id: 1, name: 'UFC Test', date: '2026-07-11', start_time: '2026-07-12T02:00:00Z' };
test('exports fixed MST in summer and winter, including prior-day rollover', () => {
  for (const [time, expected] of [['2026-07-12T02:00:00Z', '20260711T190000'], ['2026-12-13T02:00:00Z', '20261212T190000']]) {
    const output = buildEventCalendar([{ ...event, start_time: time }], { now });
    assert.ok(output.includes(`DTSTART;TZID=America/Phoenix:${expected}`));
    assert.ok(output.includes('TZOFFSETTO:-0700'));
    assert.ok(output.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!output.includes('DAYLIGHT'));
  }
});
test('uses earliest confirmed segment and includes all segment times and event link', () => {
  const output = buildEventCalendar([{ ...event, card_start_times: { early_prelims: '2026-07-11T22:00:00Z', prelims: '2026-07-12T00:00:00Z', main_card: event.start_time } }], { now, origin: 'https://example.com' }).replace(/\r\n /g, '');
  assert.ok(output.includes('DTSTART;TZID=America/Phoenix:20260711T150000'));
  assert.ok(output.includes('Early Prelims:'));
  assert.ok(output.includes('Prelims:'));
  assert.ok(output.includes('Main Card:'));
  assert.ok(output.includes('URL:https://example.com/?event=1&view=picks'));
});
test('filters completed, cancelled, past, non-UFC, invalid dates and duplicates across seasons', () => {
  const events = [event, event, { ...event, id: 2, is_completed: true }, { ...event, id: 3, status: 'Cancelled' }, { ...event, id: 4, start_time: '2025-01-01T00:00:00Z' }, { ...event, id: 5, name: 'Boxing' }, { id: 6, name: 'UFC', date: '2026-02-30' }, { id: 7, name: 'UFC Future', date: '2027-01-01' }];
  assert.deepEqual(getUpcomingCalendarEvents(events, now).map(e => e.id), [1, 7]);
});
test('unknown or ambiguous times use all-day TBD without inventing a start time', () => {
  const output = buildEventCalendar([{ ...event, start_time: '2026-07-11T20:00:00' }], { now });
  assert.ok(output.includes('DTSTART;VALUE=DATE:20260711'));
  assert.ok(output.includes('SUMMARY:UFC Test (time TBD)'));
});
test('escapes text, folds UTF-8 lines to 75 octets, uses CRLF and stable event IDs', () => {
  const output = buildEventCalendar([{ ...event, name: 'UFC ' + '🥊'.repeat(50) + ', test;\\\nEND:VEVENT', venue: 'Arena, City' }], { now });
  for (const line of output.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(output.split('BEGIN:VEVENT').length, 2);
  assert.ok(output.replace(/\r\n /g, '').includes('\\, test\\;\\\\\\nEND:VEVENT'));
  assert.ok(output.includes('UID:ufc-event-1@fight-picker'));
});
test('date-only upcoming filtering uses the MST date near midnight UTC', () => {
  assert.equal(getUpcomingCalendarEvents([{ id: 1, name: 'UFC', date: '2026-01-01' }], new Date('2026-01-02T03:00:00Z')).length, 1);
  assert.throws(() => buildEventCalendar([], { now }), /No upcoming/);
});
