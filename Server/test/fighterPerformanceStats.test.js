const test = require('node:test');
const assert = require('node:assert/strict');
const { PERFORMANCE_STAT_FIELDS, normalizePerformanceStatValue } = require('../lib/fighterPerformanceStats');
const { applyManualFightCardPreviewUpdates, buildImportedFightCardEditorPreview } = require('../lib/fightCardImport');

test('performance values accept decimals, zero, percentages, dates and normalized recent form', () => {
  for (const [field, value, expected] of [
    ['SigStrLandedPerMin', '4.37', 4.37], ['TakedownAvgPer15', '.25', .25],
    ['SigStrikeAccuracyPct', '100', 100], ['SubmissionAvgPer15', '0', 0],
    ['AverageFightTimeSeconds', '811', 811], ['LastFightDate', '2024-02-29', '2024-02-29'],
    ['RecentForm', ' w, l, nc ', 'W,L,NC'],
  ]) assert.deepEqual(normalizePerformanceStatValue(field, value), { ok: true, value: expected });
  for (const field of PERFORMANCE_STAT_FIELDS) assert.deepEqual(normalizePerformanceStatValue(field, ''), { ok: true, value: null });
});

test('performance validation rejects bad ranges, malformed numbers, dates and results', () => {
  for (const [field, value] of [
    ['SigStrikeAccuracyPct', '100.01'], ['TakedownDefensePct', '-1'],
    ['SigStrLandedPerMin', 'Infinity'], ['SigStrLandedPerMin', '4junk'],
    ['SigStrLandedPerMin', '0x10'], ['AverageFightTimeSeconds', '12.5'],
    ['AverageFightTimeSeconds', '2147483648'], ['LastFightDate', '2026-02-29'],
    ['LastFightDate', '2026-04-31'], ['LastFightDate', '0000-01-01'],
    ['RecentForm', 'W,W,W,W,W,W'], ['RecentForm', 'win,loss'],
  ]) assert.equal(normalizePerformanceStatValue(field, value).ok, false, `${field}: ${value}`);
});

test('preview and imported editor expose, update and clear every performance field', () => {
  const row = { FightId: 10, FighterId: 100, Corner: 'Red', EventId: 1 };
  const values = Object.fromEntries(PERFORMANCE_STAT_FIELDS.map((field) => [field,
    field === 'RecentForm' ? 'W,L' : field === 'LastFightDate' ? '2026-09-01' : field === 'AverageFightTimeSeconds' ? 811 : 0.25]));
  const result = applyManualFightCardPreviewUpdates({ rows: [row] }, { '10|100|Red': values });
  assert.equal(result.appliedManualUpdateCount, 12);
  const preview = buildImportedFightCardEditorPreview({ eventId: 1, eventRecord: { id: 1 }, rows: result.preview.rows });
  for (const field of PERFORMANCE_STAT_FIELDS) assert.equal(preview.editableRows[0][field], values[field]);
  const cleared = applyManualFightCardPreviewUpdates(result.preview, { '10|100|Red': Object.fromEntries(PERFORMANCE_STAT_FIELDS.map((field) => [field, null])) });
  assert.equal(cleared.appliedManualUpdateCount, 12);
  for (const field of PERFORMANCE_STAT_FIELDS) assert.equal(cleared.preview.rows[0][field], null);
});
