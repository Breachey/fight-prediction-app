const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePredictionTarget } = require('../lib/predictionValidation');

const scheduledFightRows = [
  { FighterId: 101, odds: '-150', FightStatus: 'Scheduled' },
  { FighterId: 202, odds: '+130', FightStatus: 'Scheduled' },
];

test('accepts either fighter assigned to a scheduled fight', () => {
  const validation = validatePredictionTarget({
    fightRows: scheduledFightRows,
    fighterId: '202',
  });

  assert.equal(validation.valid, true);
  assert.equal(validation.selectedFighter.FighterId, 202);
});

test('rejects a fighter who is not assigned to the requested fight', () => {
  assert.deepEqual(validatePredictionTarget({
    fightRows: scheduledFightRows,
    fighterId: 303,
  }), {
    valid: false,
    status: 400,
    error: 'Selected fighter is not part of this fight',
  });
});

test('rejects missing or incomplete fight-card data', () => {
  assert.deepEqual(validatePredictionTarget({
    fightRows: scheduledFightRows.slice(0, 1),
    fighterId: 101,
  }), {
    valid: false,
    status: 404,
    error: 'Fight not found or missing fighter data',
  });
});

test('rejects malformed fight-card data with more than two fighters', () => {
  assert.deepEqual(validatePredictionTarget({
    fightRows: [...scheduledFightRows, { FighterId: 303, odds: '+400', FightStatus: 'Scheduled' }],
    fighterId: 303,
  }), {
    valid: false,
    status: 404,
    error: 'Fight not found or missing fighter data',
  });
});

test('rejects cancelled fights without applying a start-time cutoff', () => {
  assert.deepEqual(validatePredictionTarget({
    fightRows: scheduledFightRows.map((row) => ({ ...row, FightStatus: 'Canceled' })),
    fighterId: 101,
  }), {
    valid: false,
    status: 409,
    error: 'Predictions are closed for a cancelled fight',
  });
});

test('rejects completed fights', () => {
  assert.deepEqual(validatePredictionTarget({
    fightRows: scheduledFightRows,
    fighterId: 101,
    fightResult: { is_completed: true },
  }), {
    valid: false,
    status: 409,
    error: 'Predictions are closed for a completed fight',
  });
});
