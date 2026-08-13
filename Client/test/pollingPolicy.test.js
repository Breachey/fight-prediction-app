import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPollEventLeaderboard } from '../src/utils/pollingPolicy.js';

test('polls only a visible unfinished event leaderboard', () => {
  assert.equal(shouldPollEventLeaderboard({ selectedLeaderboard: 'event', isEventComplete: false, visibilityState: 'visible' }), true);
  assert.equal(shouldPollEventLeaderboard({ selectedLeaderboard: 'event', isEventComplete: true, visibilityState: 'visible' }), false);
  assert.equal(shouldPollEventLeaderboard({ selectedLeaderboard: 'season', isEventComplete: false, visibilityState: 'visible' }), false);
  assert.equal(shouldPollEventLeaderboard({ selectedLeaderboard: 'event', isEventComplete: false, visibilityState: 'hidden' }), false);
});
