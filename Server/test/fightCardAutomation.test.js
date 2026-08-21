const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assessLineupChange,
  countFilledFightCardValues,
  hasEventStarted,
  mergeScrapedRowsWithStoredValues,
  selectDueEvents,
  summarizeFilledFightCardData,
  summarizeMissingFightCardData,
} = require('../lib/fightCardAutomation');

function fightRows(fightId, redId, redName, blueId, blueName) {
  return [
    { FightId: fightId, FighterId: redId, FirstName: redName, LastName: 'Red', Corner: 'Red' },
    { FightId: fightId, FighterId: blueId, FirstName: blueName, LastName: 'Blue', Corner: 'Blue' },
  ];
}

test('selectDueEvents selects the nearest incomplete events regardless of how far away they are', () => {
  const events = [
    { id: 3, date: '2026-09-12', is_completed: false },
    { id: 1, date: '2026-08-04', is_completed: false },
    { id: 2, date: '2026-08-29', is_completed: false },
    { id: 4, date: '2026-08-22', is_completed: true },
    { id: 5, date: 'TBD', is_completed: false },
  ];

  const selected = selectDueEvents({
    events,
    now: new Date('2026-08-05T18:00:00Z'),
    timeZone: 'America/Denver',
  });

  assert.deepEqual(selected.map((event) => event.id), [2, 3]);
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

test('summarizeFilledFightCardData reports new values by field and new fighter rows', () => {
  const existing = [{
    FightId: 10,
    FighterId: 100,
    Corner: 'Red',
    odds: null,
    Streak: '3',
  }];
  const next = [{
    FightId: 10,
    FighterId: 100,
    Corner: 'Red',
    odds: '-110',
    Streak: '3',
  }, {
    FightId: 10,
    FighterId: 101,
    Corner: 'Blue',
    odds: '+105',
    style: 'Wrestling',
  }];

  const summary = summarizeFilledFightCardData(existing, next);

  assert.equal(summary.filledValueCount, 3);
  assert.equal(summary.newRowCount, 1);
  assert.equal(summary.byField.odds, 2);
  assert.equal(summary.byField.style, 1);
  assert.equal(summary.byField.Streak, 0);
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

test('assessLineupChange allows added and removed fights when affected fights have no picks', () => {
  const existingRows = [
    ...fightRows(10, 100, 'Kept', 101, 'Matchup'),
    ...fightRows(11, 102, 'Removed', 103, 'Fight'),
  ];
  const nextRows = [
    ...fightRows(10, 100, 'Kept', 101, 'Matchup'),
    ...fightRows(12, 104, 'Added', 105, 'Fight'),
  ];
  const assessment = assessLineupChange({
    existingRows,
    nextRows,
    predictions: [{ fight_id: 10, fighter_id: 100 }],
  });

  assert.equal(assessment.canAutoApply, true);
  assert.equal(assessment.lineupChanges.unchangedFightCount, 1);
  assert.deepEqual(assessment.lineupChanges.affectedExistingFightIds, [11]);
  assert.equal(assessment.lineupChanges.addedFights[0].fightId, 12);
  assert.equal(assessment.predictionImpact.preservedPredictionCount, 1);
  assert.equal(assessment.predictionImpact.affectedPredictionCount, 0);
});

test('assessLineupChange blocks removal or opponent changes with affected picks', () => {
  const existingRows = [
    ...fightRows(20, 200, 'Original', 201, 'Opponent'),
    ...fightRows(21, 202, 'Removed', 203, 'Fight'),
  ];
  const nextRows = [
    ...fightRows(20, 200, 'Original', 204, 'Replacement'),
  ];
  const assessment = assessLineupChange({
    existingRows,
    nextRows,
    predictions: [
      { fight_id: 20, fighter_id: 200 },
      { fight_id: 21, fighter_id: 203 },
    ],
  });

  assert.equal(assessment.canAutoApply, false);
  assert.equal(assessment.lineupChanges.changedFights.length, 1);
  assert.equal(assessment.lineupChanges.removedFights.length, 1);
  assert.equal(assessment.predictionImpact.affectedPredictionCount, 2);
  assert.equal(assessment.predictionImpact.preservedPredictionCount, 0);
});
