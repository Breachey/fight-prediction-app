const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildRivalryRankings,
  calculateDynamicMinimumSample,
  wilsonLowerBound,
} = require('../lib/rivalryInsights');

test('calculateDynamicMinimumSample scales with user activity and caps mature samples', () => {
  assert.equal(calculateDynamicMinimumSample(2), 3);
  assert.equal(calculateDynamicMinimumSample(30), 6);
  assert.equal(calculateDynamicMinimumSample(120), 12);
  assert.equal(calculateDynamicMinimumSample(300), 25);
});

test('pick twin ranking favors confidence-weighted overlap over tiny perfect-looking samples', () => {
  const { pickTwin, sampleRequirements } = buildRivalryRankings([
    {
      user_id: 'low-sample',
      username: 'lowSample',
      shared_pick_fights: 12,
      same_picks: 10,
    },
    {
      user_id: 'deeper-sample',
      username: 'deeperSample',
      shared_pick_fights: 100,
      same_picks: 70,
    },
  ], {
    totalUserPickFights: 120,
  });

  assert.equal(sampleRequirements.pick_twin_min_shared_picks, 12);
  assert.equal(pickTwin.user_id, 'deeper-sample');
  assert.equal(pickTwin.pick_overlap_pct, 70);
  assert.ok(pickTwin.pick_twin_score > 0);
});

test('pick twin ranking excludes samples below the activity-scaled minimum', () => {
  const { pickTwin, sampleRequirements } = buildRivalryRankings([
    {
      user_id: 'tiny-overlap',
      username: 'tinyOverlap',
      shared_pick_fights: 12,
      same_picks: 10,
    },
    {
      user_id: 'qualified-overlap',
      username: 'qualifiedOverlap',
      shared_pick_fights: 40,
      same_picks: 26,
    },
  ], {
    totalUserPickFights: 300,
  });

  assert.equal(sampleRequirements.pick_twin_min_shared_picks, 25);
  assert.equal(pickTwin.user_id, 'qualified-overlap');
});

test('nemesis ranking uses decisive edge quality instead of raw swing-fight volume', () => {
  const { biggestNemesis, sampleRequirements } = buildRivalryRankings([
    {
      user_id: 'volume',
      username: 'volume',
      shared_fights: 200,
      they_right_you_wrong: 60,
      you_right_they_wrong: 55,
    },
    {
      user_id: 'strong-edge',
      username: 'strongEdge',
      shared_fights: 80,
      they_right_you_wrong: 30,
      you_right_they_wrong: 10,
    },
  ], {
    totalUserResultFights: 220,
  });

  assert.equal(sampleRequirements.nemesis_min_shared_fights, 22);
  assert.equal(biggestNemesis.user_id, 'strong-edge');
  assert.equal(biggestNemesis.nemesis_edge, 20);
  assert.ok(biggestNemesis.nemesis_score > 0);
});

test('nemesis requires a real positive edge', () => {
  const { biggestNemesis } = buildRivalryRankings([
    {
      user_id: 'busy-opponent',
      username: 'busyOpponent',
      shared_fights: 80,
      they_right_you_wrong: 20,
      you_right_they_wrong: 25,
    },
  ], {
    totalUserResultFights: 80,
  });

  assert.equal(biggestNemesis, null);
});

test('wilsonLowerBound rewards larger samples with comparable proportions', () => {
  assert.ok(wilsonLowerBound(70, 100) > wilsonLowerBound(10, 12));
});
