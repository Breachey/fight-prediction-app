const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEventRecap } = require('../lib/eventRecap');

const users = [
  { user_id: 1, username: 'Avery', is_bot: false, avatar_config: { character: 'squid' } },
  { user_id: 2, username: 'Blake', is_bot: false },
  { user_id: 3, username: 'Casey', is_bot: false },
  { user_id: 4, username: 'Robot', is_bot: true },
];

const fightRows = [
  { FightId: 10, FightOrder: 3, CardSegment: 'Prelims1', FighterId: 101, FirstName: 'Red', LastName: 'One' },
  { FightId: 10, FightOrder: 3, CardSegment: 'Prelims1', FighterId: 102, FirstName: 'Blue', LastName: 'One' },
  { FightId: 11, FightOrder: 2, CardSegment: 'Main', FighterId: 111, FirstName: 'Red', LastName: 'Two' },
  { FightId: 11, FightOrder: 2, CardSegment: 'Main', FighterId: 112, FirstName: 'Blue', LastName: 'Two' },
  { FightId: 12, FightOrder: 1, CardSegment: 'Main', FighterId: 121, FirstName: 'Red', LastName: 'Three' },
  { FightId: 12, FightOrder: 1, CardSegment: 'Main', FighterId: 122, FirstName: 'Blue', LastName: 'Three' },
];

const fightResults = [
  { fight_id: 10, fighter_id: 102, is_completed: true },
  { fight_id: 11, fighter_id: 111, is_completed: true },
  { fight_id: 12, fighter_id: 122, is_completed: true },
];

const predictions = [
  { fight_id: 10, fighter_id: 102, betting_odds: 350, user_id: 1 },
  { fight_id: 10, fighter_id: 101, betting_odds: -450, user_id: 2 },
  { fight_id: 10, fighter_id: 101, betting_odds: -450, user_id: 3 },
  { fight_id: 10, fighter_id: 102, betting_odds: 350, user_id: 4 },
  { fight_id: 11, fighter_id: 111, betting_odds: -120, user_id: 1 },
  { fight_id: 11, fighter_id: 111, betting_odds: -120, user_id: 2 },
  { fight_id: 11, fighter_id: 112, betting_odds: 100, user_id: 3 },
  { fight_id: 12, fighter_id: 122, betting_odds: 150, user_id: 1 },
  { fight_id: 12, fighter_id: 121, betting_odds: -175, user_id: 2 },
  { fight_id: 12, fighter_id: 121, betting_odds: -175, user_id: 3 },
];

const predictionResults = [
  { fight_id: 10, user_id: 1, username: 'Avery', predicted_correctly: true, points: 5 },
  { fight_id: 10, user_id: 2, username: 'Blake', predicted_correctly: false, points: 0 },
  { fight_id: 10, user_id: 3, username: 'Casey', predicted_correctly: false, points: 0 },
  { fight_id: 11, user_id: 1, username: 'Avery', predicted_correctly: true, points: 2 },
  { fight_id: 11, user_id: 2, username: 'Blake', predicted_correctly: true, points: 2 },
  { fight_id: 11, user_id: 3, username: 'Casey', predicted_correctly: false, points: 0 },
  { fight_id: 12, user_id: 1, username: 'Avery', predicted_correctly: true, points: 5 },
  { fight_id: 12, user_id: 2, username: 'Blake', predicted_correctly: false, points: 0 },
  { fight_id: 12, user_id: 3, username: 'Casey', predicted_correctly: false, points: 0 },
];

test('builds a human-only completed-event podium and social awards', () => {
  const recap = buildEventRecap({
    event: { id: 99, name: 'UFC Friends Night', is_completed: true },
    users,
    fightRows,
    fightResults,
    predictions,
    predictionResults,
    leaderboard: [
      { user_id: 4, username: 'Robot', is_bot: true, total_points: 99, correct_predictions: 3, total_predictions: 3, accuracy: 100 },
      { user_id: 1, username: 'Avery', is_bot: false, total_points: 12, correct_predictions: 3, total_predictions: 3, accuracy: 100 },
      { user_id: 2, username: 'Blake', is_bot: false, total_points: 2, correct_predictions: 1, total_predictions: 3, accuracy: 33 },
      { user_id: 3, username: 'Casey', is_bot: false, total_points: 0, correct_predictions: 0, total_predictions: 3, accuracy: 0 },
    ],
  });

  assert.equal(recap.status, 'complete');
  assert.equal(recap.participant_count, 3);
  assert.deepEqual(recap.podium.map((entry) => entry.username), ['Avery', 'Blake', 'Casey']);
  assert.equal(recap.winners[0].username, 'Avery');
  assert.equal(recap.awards.find((award) => award.id === 'biggest_upset').value, '+350');
  assert.equal(recap.awards.find((award) => award.id === 'contrarian_call').value, '33% of picks');
  assert.equal(recap.awards.find((award) => award.id === 'group_bad_beat').value, '2 burned');
  assert.equal(recap.awards.find((award) => award.id === 'hot_hand').value, '3 straight');
  assert.equal(recap.awards.find((award) => award.id === 'perfect_main_card').headline, 'Avery swept the main card');
  assert.match(recap.share_text, /Winner: Avery — 12 pts/);
  assert.doesNotMatch(recap.share_text, /Robot/);
});

test('keeps pending and empty events stable', () => {
  const recap = buildEventRecap({ event: { id: 100, name: 'Future Card', is_completed: false } });

  assert.equal(recap.status, 'pending');
  assert.deepEqual(recap.podium, []);
  assert.deepEqual(recap.awards, []);
  assert.equal(recap.participant_count, 0);
});
