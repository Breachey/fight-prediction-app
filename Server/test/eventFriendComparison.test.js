const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEventFriendComparison } = require('../lib/eventFriendComparison');

const users = [
  { user_id: 1, username: 'Avery', is_bot: false, avatar_config: { color: 'pink' } },
  { user_id: 2, username: 'Blake', is_bot: false, avatar_config: { color: 'blue' } },
  { user_id: 3, username: 'Casey', is_bot: false },
  { user_id: 4, username: 'Robot', is_bot: true },
];

const fightRows = [
  { FightId: 10, FightOrder: 1, CardSegment: 'Main Card', Corner: 'Red', FighterId: 101, FirstName: 'Red', LastName: 'One' },
  { FightId: 10, FightOrder: 1, CardSegment: 'Main Card', Corner: 'Blue', FighterId: 102, FirstName: 'Blue', LastName: 'One' },
  { FightId: 20, FightOrder: 2, CardSegment: 'Main Card', Corner: 'Red', FighterId: 201, FirstName: 'Red', LastName: 'Two' },
  { FightId: 20, FightOrder: 2, CardSegment: 'Main Card', Corner: 'Blue', FighterId: 202, FirstName: 'Blue', LastName: 'Two' },
  { FightId: 30, FightOrder: 3, CardSegment: 'Prelims', Corner: 'Red', FighterId: 301, FirstName: 'Red', LastName: 'Three' },
  { FightId: 30, FightOrder: 3, CardSegment: 'Prelims', Corner: 'Blue', FighterId: 302, FirstName: 'Blue', LastName: 'Three' },
];

test('buildEventFriendComparison reveals only picks the viewer has unlocked', () => {
  const comparison = buildEventFriendComparison({
    event: { id: 99, name: 'Fight Night', is_completed: false },
    viewerUserId: 1,
    friendUserId: 2,
    users,
    fightRows,
    predictions: [
      { fight_id: 10, fighter_id: 101, user_id: 1 },
      { fight_id: 10, fighter_id: 102, user_id: 2 },
      { fight_id: 20, fighter_id: 201, user_id: 2 },
      { fight_id: 20, fighter_id: 202, user_id: 3 },
      { fight_id: 30, fighter_id: 301, user_id: 1 },
      { fight_id: 30, fighter_id: 301, user_id: 2 },
      { fight_id: 10, fighter_id: 101, user_id: 4 },
    ],
    predictionResults: [
      { fight_id: 30, user_id: 1, predicted_correctly: true, points: 3 },
      { fight_id: 30, user_id: 2, predicted_correctly: true, points: 2 },
    ],
    fightResults: [
      { fight_id: 30, fighter_id: 301, is_completed: true },
    ],
  });

  assert.equal(comparison.selected_friend.username, 'Blake');
  assert.deepEqual(comparison.friends.map((friend) => friend.username), ['Blake', 'Casey']);
  assert.equal(comparison.fights[0].comparison_state, 'disagreement');
  assert.equal(comparison.fights[0].is_sweat, true);
  assert.equal(comparison.fights[1].comparison_state, 'locked');
  assert.equal(comparison.fights[1].friend_pick, null);
  assert.equal(comparison.fights[2].comparison_state, 'agreement');
  assert.equal(comparison.fights[2].viewer_pick.points, 3);
  assert.equal(comparison.summary.agreements, 1);
  assert.equal(comparison.summary.disagreements, 1);
  assert.equal(comparison.summary.remaining_sweats, 1);
  assert.equal(comparison.summary.viewer_points, 3);
  assert.equal(comparison.summary.friend_points, 2);
  assert.equal(comparison.summary.points_edge, 1);
});

test('completed fights reveal a friend pick even when the viewer missed the fight', () => {
  const comparison = buildEventFriendComparison({
    viewerUserId: 1,
    friendUserId: 2,
    users,
    fightRows,
    predictions: [{ fight_id: 20, fighter_id: 201, user_id: 2 }],
    fightResults: [{ fight_id: 20, fighter_id: 201, is_completed: true }],
  });

  const completedFight = comparison.fights.find((fight) => fight.fight_id === '20');
  assert.equal(completedFight.is_visible, true);
  assert.equal(completedFight.comparison_state, 'viewer_missing');
  assert.equal(completedFight.friend_pick.fighter_name, 'Red Two');
});

test('returns a stable empty comparison when no friend has picked the card', () => {
  const comparison = buildEventFriendComparison({
    event: { id: 99, name: 'Fight Night' },
    viewerUserId: 1,
    users,
    fightRows,
    predictions: [{ fight_id: 10, fighter_id: 101, user_id: 1 }],
  });

  assert.equal(comparison.selected_friend, null);
  assert.deepEqual(comparison.friends, []);
  assert.deepEqual(comparison.fights, []);
  assert.equal(comparison.summary.locked_fights, 3);
});
