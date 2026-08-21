import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haveFightCardsChanged,
  haveFightResultsChanged,
  shouldPollEventLeaderboard,
  shouldPollFightCard,
} from '../src/utils/pollingPolicy.js';

test('polls only a visible unfinished event leaderboard', () => {
  assert.equal(shouldPollEventLeaderboard({ selectedLeaderboard: 'event', isEventComplete: false, visibilityState: 'visible' }), true);
  assert.equal(shouldPollEventLeaderboard({ selectedLeaderboard: 'event', isEventComplete: true, visibilityState: 'visible' }), false);
  assert.equal(shouldPollEventLeaderboard({ selectedLeaderboard: 'season', isEventComplete: false, visibilityState: 'visible' }), false);
  assert.equal(shouldPollEventLeaderboard({ selectedLeaderboard: 'event', isEventComplete: false, visibilityState: 'hidden' }), false);
});

test('polls a fight card only while its unfinished event is visible', () => {
  assert.equal(shouldPollFightCard({ isEventComplete: false, allFightsResolved: false, visibilityState: 'visible' }), true);
  assert.equal(shouldPollFightCard({ isEventComplete: true, allFightsResolved: false, visibilityState: 'visible' }), false);
  assert.equal(shouldPollFightCard({ isEventComplete: false, allFightsResolved: true, visibilityState: 'visible' }), false);
  assert.equal(shouldPollFightCard({ isEventComplete: false, allFightsResolved: false, visibilityState: 'hidden' }), false);
});

test('detects card changes while normalizing identifier types', () => {
  const current = [{ id: '10', event_id: 20, fighter1_id: '101', fighter2_id: '102', winner: null, fighter1_name: 'Red' }];
  const equivalent = [{ id: 10, event_id: '20', fighter1_id: 101, fighter2_id: 102, winner: null, fighter1_name: 'Red' }];
  const changed = [{ ...equivalent[0], fighter1_name: 'Updated Red' }];

  assert.equal(haveFightCardsChanged(current, equivalent), false);
  assert.equal(haveFightCardsChanged(current, changed), true);
});

test('detects completed, canceled, and corrected fight results', () => {
  const current = [{ id: 10, winner: null, is_completed: false, is_canceled: false }];
  const completed = [{ id: 10, winner: 101, is_completed: true, is_canceled: false }];
  const equivalent = [{ id: 10, winner: '101', is_completed: true, is_canceled: false }];
  const corrected = [{ id: 10, winner: 102, is_completed: true, is_canceled: false }];

  assert.equal(haveFightResultsChanged(current, completed), true);
  assert.equal(haveFightResultsChanged(completed, equivalent), false);
  assert.equal(haveFightResultsChanged(completed, corrected), true);
});
