import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAverageFightTime,
  formatLastFightRecency,
  getComparisonWidth,
  getMatchupComparison,
  getMetricScalePosition,
  getMetricScaleRatio,
  parseRecentForm,
} from '../src/utils/fighterStats.js';

test('comparison widths use the same matchup scale', () => {
  assert.equal(getComparisonWidth(4, 5, 1), 80);
  assert.equal(getComparisonWidth(5, 4, 1), 100);
  assert.equal(getComparisonWidth(null, 4, 1), 0);
});

test('metric plot positions use explicit scales and keep dots inside the lane', () => {
  assert.equal(getMetricScaleRatio(4, 8), 0.5);
  assert.equal(getMetricScaleRatio(12, 8), 1);
  assert.equal(getMetricScaleRatio(null, 8), null);
  assert.equal(getMetricScalePosition(0, 100), 4);
  assert.equal(getMetricScalePosition(50, 100), 50);
  assert.equal(getMetricScalePosition(100, 100), 96);
});

test('matchup edge positions show the leading side and preserve lower-is-better meaning', () => {
  assert.deepEqual(getMatchupComparison(4, 5), {
    comparable: true,
    leader: 'blue',
    delta: 1,
    edgePosition: 58,
  });

  const absorbed = getMatchupComparison(8.13, 5.18, 'lower');
  assert.equal(absorbed.leader, 'blue');
  assert.equal(Number(absorbed.delta.toFixed(2)), 2.95);
  assert.ok(absorbed.edgePosition > 50);

  assert.deepEqual(getMatchupComparison(null, 5), {
    comparable: false,
    leader: null,
    delta: null,
    edgePosition: 50,
  });
});

test('fighter stat formatters keep compact display values', () => {
  assert.deepEqual(parseRecentForm('W,L,NC,D,W,L'), ['W', 'L', 'NC', 'D', 'W']);
  assert.equal(formatAverageFightTime(811), '13:31');
  assert.equal(
    formatLastFightRecency('2026-07-11', new Date('2026-08-24T12:00:00Z')),
    '6w since last fight'
  );
});
