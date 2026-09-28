const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEventStartTimes, normalizeCardSegment } = require('../lib/eventStartTimes');

test('recognizes feed and display names for each card segment', () => {
  for (const [key, labels] of [
    ['main_card', ['Main', 'MainCard', ' Main Card ', 'MAIN_CARD']],
    ['prelims', ['Prelims1', 'Prelims', ' PRELIMS ']],
    ['early_prelims', ['Prelims2', 'Early Prelims', 'early_prelims']],
  ]) {
    for (const label of labels) assert.equal(normalizeCardSegment(label), key);
  }
  for (const label of [null, '', 'Unknown', 'constructor']) assert.equal(normalizeCardSegment(label), null);
});

test('keeps the main-card time distinct from the earliest event start', () => {
  const start = '2026-10-03T20:00:00Z';
  const rows = [
    { StartTime: start, CardSegment: 'Main', CardSegmentStartTime: '2026-10-04T00:00:00Z' },
    { StartTime: start, CardSegment: 'Prelims1', CardSegmentStartTime: '2026-10-03T22:00:00Z' },
    { StartTime: start, CardSegment: 'Prelims2', CardSegmentStartTime: start },
  ];
  const expected = {
    start_time: start,
    card_start_times: { early_prelims: start, prelims: '2026-10-03T22:00:00Z', main_card: '2026-10-04T00:00:00Z' },
  };
  assert.deepEqual(buildEventStartTimes(rows), expected);
  assert.deepEqual(buildEventStartTimes([...rows].reverse()), expected);
});

test('does not fill an unknown main-card time with the event or prelim time', () => {
  const start = '2026-10-03T20:00:00Z';
  const result = buildEventStartTimes([
    { StartTime: start, CardSegment: 'Main', CardSegmentStartTime: null },
    { StartTime: start, CardSegment: 'Prelims1', CardSegmentStartTime: start },
  ]);
  assert.equal(result.start_time, start);
  assert.equal(result.card_start_times.prelims, start);
  assert.equal(result.card_start_times.main_card, null);
});

test('reads segment times without an event start and keeps the earliest confirmed values', () => {
  const result = buildEventStartTimes([
    { CardSegment: 'Main Card', CardSegmentStartTime: '2026-10-04T01:00:00Z' },
    { CardSegment: 'main', CardSegmentStartTime: ' 2026-10-04T00:00:00Z ' },
    { CardSegment: 'Early Prelims', CardSegmentStartTime: '2026-10-03T20:00:00+00:00' },
  ]);
  assert.equal(result.start_time, '2026-10-03T20:00:00+00:00');
  assert.equal(result.card_start_times.main_card, '2026-10-04T00:00:00Z');
});

test('rejects invalid and ambiguous timestamps without hiding later valid values', () => {
  const result = buildEventStartTimes([
    { StartTime: 'invalid', CardSegment: 'Main', CardSegmentStartTime: '2026-10-04T00:00:00' },
    { StartTime: '2026-10-03T20:00:00Z', CardSegment: 'Main', CardSegmentStartTime: '2026-10-04T00:00:00Z' },
  ]);
  assert.equal(result.start_time, '2026-10-03T20:00:00Z');
  assert.equal(result.card_start_times.main_card, '2026-10-04T00:00:00Z');
  assert.deepEqual(buildEventStartTimes(), {
    start_time: null,
    card_start_times: { early_prelims: null, prelims: null, main_card: null },
  });
});
