const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addFightToFightRankChanges,
  findLatestCompletedFightId,
} = require('../lib/eventLeaderboardDeltas');

test('findLatestCompletedFightId uses the lowest completed bout order', () => {
  const eventResults = [
    { fight_id: 12 },
    { fight_id: 11 },
    { fight_id: 10 },
  ];
  const fightRows = [
    { FightId: 10, FightOrder: 8 },
    { FightId: 11, FightOrder: 9 },
    { FightId: 12, FightOrder: 10 },
    { FightId: 9, FightOrder: 7 },
  ];

  assert.equal(findLatestCompletedFightId(eventResults, fightRows), '10');
});

test('addFightToFightRankChanges compares current rank to the prior fight snapshot', () => {
  const baseline = [
    { user_id: 'a', total_points: 8 },
    { user_id: 'b', total_points: 6 },
    { user_id: 'c', total_points: 4 },
  ];
  const current = [
    { user_id: 'b', total_points: 10, points_change: 4 },
    { user_id: 'a', total_points: 8, points_change: 0 },
    { user_id: 'c', total_points: 5, points_change: 1 },
  ];

  assert.deepEqual(
    addFightToFightRankChanges(current, baseline).map(({ user_id, rank_change, points_change }) => ({
      user_id,
      rank_change,
      points_change,
    })),
    [
      { user_id: 'b', rank_change: 1, points_change: 0 },
      { user_id: 'a', rank_change: -1, points_change: 0 },
      { user_id: 'c', rank_change: 0, points_change: 0 },
    ]
  );
});

test('addFightToFightRankChanges reports no movement before a prior fight exists', () => {
  assert.deepEqual(
    addFightToFightRankChanges([{ user_id: 'a', total_points: 2 }], []),
    [{ user_id: 'a', total_points: 2, rank_change: 0, points_change: 0 }]
  );
});
