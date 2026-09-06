const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCalendarEvents, createCalendarFeedHandler } = require('../lib/calendarFeed');
const now = new Date('2026-09-06T12:00:00Z');
function database(events = [], fights = []) {
  const calls = [];
  let fail = false;
  return {
    calls, setFailure(value) { fail = value; },
    from(table) {
      let rows = table === 'events' ? events : fights;
      const query = {
        select() { return query; },
        gte(key, value) { rows = rows.filter(row => row[key] >= value); return query; },
        in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
        order() { return query; },
        async range(from, to) { calls.push({ table, from, to }); return fail ? { error: new Error('database unavailable') } : { data: rows.slice(from, to + 1) }; },
      };
      return query;
    },
  };
}
function response() {
  return { headers: {}, set(headers) { Object.assign(this.headers, headers); return this; }, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; } };
}
const future = { id: 1, name: 'UFC Future', date: '2026-09-12' };
test('loads every page, keeps recent completed events and reads segment times without StartTime', async () => {
  const events = Array.from({ length: 501 }, (_, index) => ({ ...future, id: index + 1 }));
  events.push({ id: 502, name: 'UFC Recent', date: '2026-09-01', is_completed: true }, { id: 503, name: 'UFC Old', date: '2020-01-01' }, { id: 504, name: 'Boxing', date: future.date });
  const fights = Array.from({ length: 501 }, (_, id) => ({ id, EventId: 1, CardSegment: 'Main Card', CardSegmentStartTime: '2026-09-13T02:00:00Z' }));
  fights.push({ id: 502, EventId: 1, CardSegment: 'Early Prelims', CardSegmentStartTime: '2026-09-12T22:00:00Z' });
  const db = database(events, fights);
  const result = await loadCalendarEvents(db, now);
  assert.equal(result.length, 502);
  assert.equal(result[0].card_start_times.early_prelims, '2026-09-12T22:00:00Z');
  assert.ok(db.calls.some(call => call.table === 'events' && call.from === 500));
  assert.ok(db.calls.some(call => call.table === 'ufc_full_fight_card' && call.from === 500));
});
test('public handler caches, refreshes changed times under the same UID, and includes new events', async () => {
  let time = now;
  const events = [future];
  const fights = [{ id: 1, EventId: 1, StartTime: '2026-09-13T02:00:00Z' }];
  const db = database(events, fights);
  const handler = createCalendarFeedHandler({ supabase: db, now: () => time });
  const first = response(); await handler({}, first);
  assert.equal(first.code, 200);
  assert.match(first.headers['Content-Type'], /text\/calendar/);
  assert.match(first.body, /DTSTART;TZID=America\/Phoenix:20260912T190000/);
  const count = db.calls.length;
  await handler({}, response()); assert.equal(db.calls.length, count);
  fights[0].StartTime = '2026-09-13T03:00:00Z'; events.push({ ...future, id: 2 });
  time = new Date(now.getTime() + 301000);
  const updated = response(); await handler({}, updated);
  assert.match(updated.body, /DTSTART;TZID=America\/Phoenix:20260912T200000/);
  assert.match(updated.body, /UID:ufc-event-1@fight-picker/);
  assert.match(updated.body, /UID:ufc-event-2@fight-picker/);
  assert.match(updated.body, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  assert.doesNotMatch(updated.body, /Download again/);
});
test('empty schedule remains a valid feed, while database failures return 503, never an empty calendar', async () => {
  const db = database();
  const handler = createCalendarFeedHandler({ supabase: db, now: () => now });
  const empty = response(); await handler({}, empty);
  assert.equal(empty.code, 200); assert.match(empty.body, /END:VCALENDAR/); assert.doesNotMatch(empty.body, /BEGIN:VEVENT/);
  db.setFailure(true);
  const failing = createCalendarFeedHandler({ supabase: db, logger: { error() {} } });
  const unavailable = response(); await failing({}, unavailable);
  assert.equal(unavailable.code, 503); assert.equal(unavailable.headers['Cache-Control'], 'no-store');
  assert.doesNotMatch(unavailable.body, /BEGIN:VCALENDAR/);
  db.setFailure(false);
  const recovered = response(); await failing({}, recovered); assert.equal(recovered.code, 200);
});
test('TBD-to-timed changes retain identity and completed cards remain in the subscription', async () => {
  const { buildEventCalendar } = await import('../lib/eventCalendar.mjs');
  const options = { now, subscription: true };
  const before = buildEventCalendar([future], options);
  const after = buildEventCalendar([{ ...future, start_time: '2026-09-13T02:00:00Z' }], options);
  assert.equal(before.match(/UID:.+/)[0], after.match(/UID:.+/)[0]);
  assert.match(before, /DTSTART;VALUE=DATE/); assert.match(after, /DTSTART;TZID/);
  assert.match(buildEventCalendar([{ ...future, date: '2026-09-01', is_completed: true }], options), /BEGIN:VEVENT/);
});
