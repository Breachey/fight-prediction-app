const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildStreakAnchorPayload,
  isVerifiedStreakProfile,
  replayStreakFromAnchor,
  streakRecordMatches,
} = require('../lib/fighterStreaks');

test('legacy cached streaks are not treated as verified', () => {
  assert.equal(isVerifiedStreakProfile({
    streak: 4,
    stats_source: 'cached_profile_url',
    streak_needs_review: false,
  }), false);
});

test('manual verification creates a pre-event streak anchor', () => {
  const payload = buildStreakAnchorPayload({
    row: {
      Record_Wins: 12,
      Record_Losses: 3,
      StartTime: '2026-08-15T22:00:00Z',
    },
    streak: '-2',
    source: 'manual',
    eventId: 1325,
    verifiedAt: '2026-08-14T12:00:00Z',
  });

  assert.equal(payload.streak, -2);
  assert.equal(payload.streak_source, 'manual');
  assert.equal(payload.streak_anchor_value, -2);
  assert.equal(payload.streak_anchor_record_wins, 12);
  assert.equal(payload.streak_anchor_record_losses, 3);
  assert.equal(payload.streak_anchor_through_date, '2026-08-14');
  assert.equal(payload.streak_needs_review, false);
  assert.equal(isVerifiedStreakProfile(payload), true);
});

test('completed-event verification excludes that event from future replay', () => {
  const payload = buildStreakAnchorPayload({
    row: {
      Record_Wins: 13,
      Record_Losses: 3,
      StartTime: '2026-08-15T22:00:00Z',
    },
    streak: 1,
    source: 'tapology_live',
    eventId: 1325,
    fightCompleted: true,
    verifiedAt: '2026-08-16T12:00:00Z',
  });

  assert.equal(payload.streak_anchor_through_date, '2026-08-15');
  assert.equal(payload.streak_source, 'tapology_live');
});

test('result replay is chronological and idempotent from the anchor', () => {
  const profile = buildStreakAnchorPayload({
    row: { Record_Wins: 10, Record_Losses: 2, StartTime: '2026-08-15' },
    streak: 3,
    source: 'manual',
    eventId: 1325,
    verifiedAt: '2026-08-14T12:00:00Z',
  });
  const results = [
    { fight_id: 2, event_id: 1326, event_date: '2026-09-01', outcome: 'win' },
    { fight_id: 1, event_id: 1325, event_date: '2026-08-15', outcome: 'loss' },
  ];

  const first = replayStreakFromAnchor(profile, results);
  const second = replayStreakFromAnchor(profile, results);
  assert.deepEqual(first, second);
  assert.equal(first.streak, 1);
  assert.equal(first.recordWins, 11);
  assert.equal(first.recordLosses, 3);
  assert.equal(first.appliedResultCount, 2);
});

test('record validation detects an external or missing fight', () => {
  const profile = {
    streak_record_wins: 15,
    streak_record_losses: 4,
  };

  assert.equal(streakRecordMatches(profile, 15, 4), true);
  assert.equal(streakRecordMatches(profile, 16, 4), false);
  assert.equal(streakRecordMatches(profile, null, 4), null);
});
