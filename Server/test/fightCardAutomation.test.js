const assert = require('node:assert/strict');
const test = require('node:test');
const {
  countFilledFightCardValues,
  hasEventStarted,
  mergeScrapedRowsWithStoredValues,
  selectDueEvents,
  summarizeMissingFightCardData,
} = require('../lib/fightCardAutomation');

test('selectDueEvents selects incomplete events due today or tomorrow', () => {
  const events = [
    { id: 3, date: '2026-08-07', is_completed: false },
    { id: 1, date: '2026-08-05', is_completed: false },
    { id: 2, date: '2026-08-06', is_completed: false },
    { id: 4, date: '2026-08-06', is_completed: true },
  ];

  const selected = selectDueEvents({
    events,
    now: new Date('2026-08-05T18:00:00Z'),
    timeZone: 'America/Denver',
  });

  assert.deepEqual(selected.map((event) => event.id), [1, 2]);
});

test('selectDueEvents allows an explicit future event but never a completed event', () => {
  const events = [
    { id: 1318, date: '2026-09-12', is_completed: false },
    { id: 1319, date: '2026-09-19', is_completed: true },
  ];

  assert.deepEqual(selectDueEvents({ events, explicitEventId: 1318 }), [events[0]]);
  assert.deepEqual(selectDueEvents({ events, explicitEventId: 1319 }), []);
});

test('mergeScrapedRowsWithStoredValues only fills blanks on an existing card', () => {
  const existing = [{
    FightId: 10,
    FighterId: 100,
    Corner: 'Red',
    odds: '+120',
    Streak: '-1',
    style: null,
    KO_TKO_Wins: null,
  }];
  const scraped = [{
    FightId: '10',
    FighterId: '100',
    Corner: 'Red',
    odds: '-150',
    Streak: '4',
    style: 'Boxing',
    KO_TKO_Wins: '8',
  }];

  const [merged] = mergeScrapedRowsWithStoredValues(scraped, existing);

  assert.equal(merged.odds, '+120');
  assert.equal(merged.Streak, '-1');
  assert.equal(merged.style, 'Boxing');
  assert.equal(merged.KO_TKO_Wins, '8');
  assert.equal(countFilledFightCardValues(existing, [merged]), 2);
});

test('summarizeMissingFightCardData counts zero as a populated stat', () => {
  const summary = summarizeMissingFightCardData([{
    odds: '-110',
    TapologyFighterURL: 'https://www.tapology.com/fightcenter/fighters/test',
    TapologyMatchConfidence: 'cache',
    Rank: 'NR',
    Streak: 0,
    style: 'Wrestling',
    KO_TKO_Wins: 0,
    KO_TKO_Losses: 0,
    Submission_Wins: 0,
    Submission_Losses: 0,
    Decision_Wins: 0,
    Decision_Losses: 0,
  }]);

  assert.equal(summary.missingValueCount, 0);
  assert.equal(summary.rowsWithMissingValues, 0);
});

test('hasEventStarted uses the earliest stored start time', () => {
  const rows = [
    { StartTime: '2026-08-06T23:00:00Z' },
    { StartTime: '2026-08-06T21:00:00Z' },
  ];

  assert.equal(hasEventStarted(rows, new Date('2026-08-06T20:59:00Z')), false);
  assert.equal(hasEventStarted(rows, new Date('2026-08-06T21:01:00Z')), true);
});
