import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIGHT_CARD_EDITOR_FIELDS, buildManualPreviewUpdates, getVisibleEditorFields,
  groupEditorRows, hasInvalidEditorValues, hasUnsavedEditorChanges, scopeFightEditorRows,
} from '../src/utils/fightCardEditor.js';

function completeRow(overrides = {}) {
  return { rowKey: '10', fightId: 1, corner: 'Red',
    ...Object.fromEntries(FIGHT_CARD_EDITOR_FIELDS.map(([key, , type]) => [key, type === 'url'
      ? 'https://www.tapology.com/fightcenter/fighters/10-test' : type === 'text' ? 'Wrestling' : '0'])),
    ...overrides };
}

test('missing filter hides populated fields and treats zero as a value', () => {
  const row = completeRow({ style: null, odds: '  ' });
  assert.deepEqual(getVisibleEditorFields(row, {}, 'missing').map(([field]) => field), ['odds', 'style']);
  assert.deepEqual(getVisibleEditorFields(completeRow(), {}, 'missing'), []);
});

test('missing input remains visible during typing and disappears after saving', () => {
  const row = completeRow({ style: null });
  const edits = { 10: { style: 'Wrestling' } };
  assert.deepEqual(getVisibleEditorFields(row, edits, 'missing').map(([field]) => field), ['style']);
  const patch = buildManualPreviewUpdates([row], edits)['10'];
  assert.deepEqual(getVisibleEditorFields({ ...row, ...patch }, {}, 'missing'), []);
});

test('clear, unchanged, signed streak and changed filters preserve intended edits', () => {
  const row = completeRow();
  const edits = { 10: { style: '', Streak: '-3', KO_TKO_Losses: '0' } };
  assert.deepEqual(buildManualPreviewUpdates([row], edits), { 10: { style: null, Streak: '-3' } });
  assert.deepEqual(getVisibleEditorFields(row, edits, 'changed').map(([field]) => field), ['style', 'Streak']);
  assert.equal(hasUnsavedEditorChanges([row], edits), true);
});

test('invalid changes are reported even when other fields are valid', () => {
  const row = completeRow();
  assert.equal(hasInvalidEditorValues([row], { 10: { KO_TKO_Wins: '-1', style: 'Boxing' } }), true);
  assert.equal(hasInvalidEditorValues([row], { 10: { TapologyFighterURL: 'https://example.com' } }), true);
  assert.equal(hasInvalidEditorValues([row], { 10: { odds: '+125', Streak: '-2', Rank: '0' } }), false);
});

test('single-fight editor cannot include updates for other fights', () => {
  const rows = scopeFightEditorRows([
    { id: 10, FightId: 1, Corner: 'Red' }, { id: 11, FightId: '1', Corner: 'Blue' },
    { id: 12, FightId: 2, Corner: 'Red' },
  ], '1');
  assert.deepEqual(rows.map((row) => row.id), [10, 11]);
  const patches = buildManualPreviewUpdates(rows, { 10: { style: 'Boxing' }, 12: { style: 'Wrestling' } });
  assert.deepEqual(patches, { 10: { style: 'Boxing' } });
});

test('editor groups bouts and orders red before blue regardless of response order', () => {
  const groups = groupEditorRows([completeRow({ corner: 'Blue' }), completeRow(), completeRow({ fightId: 2 })]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].fighters.map((row) => row.corner), ['Red', 'Blue']);
});
