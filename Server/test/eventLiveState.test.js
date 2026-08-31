const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEventLiveState } = require('../lib/eventLiveState');

const cardRows = [
  { FightId: 10, FighterId: 101, Corner: 'Red', FightOrder: 1, FightStatus: 'Scheduled', odds: '-150' },
  { FightId: 10, FighterId: 102, Corner: 'Blue', FightOrder: 1, FightStatus: 'Scheduled', odds: '+130' },
  { FightId: 20, FighterId: 201, Corner: 'Red', FightOrder: 2, FightStatus: 'Scheduled', odds: '-110' },
  { FightId: 20, FighterId: 202, Corner: 'Blue', FightOrder: 2, FightStatus: 'Scheduled', odds: '-110' },
];

test('builds stable revisions regardless of source row order or identifier types', () => {
  const first = buildEventLiveState({
    cardRows,
    resultRows: [{ fight_id: 10, fighter_id: 101, is_completed: true, result_type: 'winner' }],
    predictionRows: [{ fight_id: 20, fighter_id: 202, user_id: 3 }],
  });
  const second = buildEventLiveState({
    cardRows: [...cardRows].reverse().map((row) => ({ ...row, FightId: String(row.FightId), FighterId: String(row.FighterId) })),
    resultRows: [{ fight_id: '10', fighter_id: '101', is_completed: true, result_type: 'winner' }],
    predictionRows: [{ fight_id: '20', fighter_id: '202', user_id: '3' }],
  });

  assert.equal(first.card_revision, second.card_revision);
  assert.equal(first.result_revision, second.result_revision);
  assert.equal(first.prediction_revision, second.prediction_revision);
});

test('changes only the relevant revision when a result or prediction changes', () => {
  const initial = buildEventLiveState({ cardRows });
  const withResult = buildEventLiveState({
    cardRows,
    resultRows: [{ fight_id: 10, fighter_id: 101, is_completed: true, result_type: 'winner' }],
  });
  const withPrediction = buildEventLiveState({
    cardRows,
    predictionRows: [{ fight_id: 20, fighter_id: 202, user_id: 3 }],
  });

  assert.equal(initial.card_revision, withResult.card_revision);
  assert.notEqual(initial.result_revision, withResult.result_revision);
  assert.equal(initial.prediction_revision, withResult.prediction_revision);
  assert.equal(initial.card_revision, withPrediction.card_revision);
  assert.equal(initial.result_revision, withPrediction.result_revision);
  assert.notEqual(initial.prediction_revision, withPrediction.prediction_revision);
});

test('reports resolution from completed and cancelled fight state', () => {
  const partiallyResolved = buildEventLiveState({
    cardRows,
    resultRows: [{ fight_id: 10, fighter_id: 101, is_completed: true, result_type: 'winner' }],
  });
  const fullyResolved = buildEventLiveState({
    cardRows: cardRows.map((row) => (
      row.FightId === 20 ? { ...row, FightStatus: 'Canceled' } : row
    )),
    resultRows: [{ fight_id: 10, fighter_id: 101, is_completed: true, result_type: 'winner' }],
  });

  assert.equal(partiallyResolved.all_fights_resolved, false);
  assert.equal(fullyResolved.all_fights_resolved, true);
  assert.equal(fullyResolved.completed_fight_count, 1);
  assert.equal(fullyResolved.canceled_fight_count, 1);
});
