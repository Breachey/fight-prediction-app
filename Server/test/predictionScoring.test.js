const test = require('node:test');
const assert = require('node:assert/strict');
const { scorePredictionOutcome } = require('../lib/predictionScoring');

test('awards odds-based points only for the winning fighter', () => {
  assert.deepEqual(scorePredictionOutcome({
    resultType: 'winner',
    winnerId: 101,
    predictionFighterId: 101,
    bettingOdds: 250,
  }), { predictedCorrectly: true, points: 4 });
});

test('draws and no contests award zero points to either pick', () => {
  for (const resultType of ['draw', 'no_contest']) {
    assert.deepEqual(scorePredictionOutcome({
      resultType,
      winnerId: null,
      predictionFighterId: 101,
      bettingOdds: 250,
    }), { predictedCorrectly: false, points: 0 });
    assert.deepEqual(scorePredictionOutcome({
      resultType,
      winnerId: null,
      predictionFighterId: 102,
      bettingOdds: -300,
    }), { predictedCorrectly: false, points: 0 });
  }
});
