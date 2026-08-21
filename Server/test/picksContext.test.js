const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPicksContextPayload,
  buildPriorPickOutcomes,
  buildSubmittedPicks,
  buildVoteCounts,
} = require('../lib/picksContext');

test('buildSubmittedPicks includes only picks on the selected event card', () => {
  assert.deepEqual(
    buildSubmittedPicks([
      { fight_id: 10, fighter_id: 101 },
      { fight_id: 20, fighter_id: 201 },
    ], [10]),
    { 10: '101' }
  );
});

test('buildVoteCounts separates human and bot totals and drops unknown users', () => {
  const counts = buildVoteCounts([
    { fight_id: 10, fighter_id: 101, user_id: 1 },
    { fight_id: 10, fighter_id: 101, user_id: 2 },
    { fight_id: 10, fighter_id: 102, user_id: 999 },
  ], [
    { user_id: 1, username: 'human', is_bot: false },
    { user_id: 2, username: 'bot', is_bot: true },
  ]);

  assert.deepEqual(counts, { 10: { 101: { total: 2, human: 1 } } });
});

test('buildPriorPickOutcomes returns completed picks before the selected event', () => {
  const outcomes = buildPriorPickOutcomes({
    predictions: [
      { fight_id: 1, fighter_id: 11 },
      { fight_id: 2, fighter_id: 22 },
    ],
    fightMeta: [
      { FightId: 1, EventId: 100, event_date: '2026-01-01' },
      { FightId: 2, EventId: 200, event_date: '2026-09-01' },
    ],
    results: [
      { fight_id: 1, fighter_id: 11, is_completed: true },
      { fight_id: 2, fighter_id: 22, is_completed: true },
    ],
    selectedEventDate: '2026-08-01',
  });

  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].fighter_won, true);
  assert.equal(outcomes[0].event_id, 100);
});

test('buildPicksContextPayload returns stable empty collections', () => {
  assert.deepEqual(buildPicksContextPayload({}), {
    fights: [],
    submitted_picks: {},
    vote_counts: {},
    reminders: [],
    prior_pick_outcomes: [],
  });
});

test('buildPriorPickOutcomes treats a neutral result as completed without a loss', () => {
  const outcomes = buildPriorPickOutcomes({
    predictions: [{ fight_id: 1, fighter_id: 11 }],
    fightMeta: [{ FightId: 1, EventId: 100, event_date: '2026-01-01' }],
    results: [{ fight_id: 1, fighter_id: null, is_completed: true, result_type: 'draw' }],
    selectedEventDate: '2026-08-01',
  });

  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].result_type, 'draw');
  assert.equal(outcomes[0].fighter_won, null);
});
