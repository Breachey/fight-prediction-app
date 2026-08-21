const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  assessLineupChange,
  countFilledFightCardValues,
  hasEventStarted,
  mergeScrapedRowsWithStoredValues,
  resolveAutomationReportPath,
  selectDueEvents,
  summarizeFilledFightCardData,
  summarizeMissingFightCardData,
  summarizeUfcEventDiscovery,
} = require('../lib/fightCardAutomation');

test('resolveAutomationReportPath anchors relative reports at the repository root', () => {
  const repositoryRoot = path.resolve('/tmp', 'fight-picks-repository');
  const absoluteReportPath = path.resolve('/tmp', 'reports', 'automation.json');

  assert.equal(
    resolveAutomationReportPath('automation-report.json', repositoryRoot),
    path.join(repositoryRoot, 'automation-report.json')
  );
  assert.equal(
    resolveAutomationReportPath(absoluteReportPath, repositoryRoot),
    absoluteReportPath
  );
  assert.equal(resolveAutomationReportPath('  ', repositoryRoot), null);
});

test('summarizeUfcEventDiscovery reports counts and only changed events', () => {
  const summary = summarizeUfcEventDiscovery({
    startedAt: '2026-08-21T12:00:00Z',
    finishedAt: '2026-08-21T12:01:00Z',
    startId: 1300,
    scanned: 80,
    api_events_found: 12,
    eligible_events_found: 10,
    filtered_events: 2,
    insertedCount: 2,
    updatedCount: 1,
    unchangedCount: 7,
    posterCount: 1,
    posterErrors: ['1330: Tapology unavailable'],
    events: [
      { id: 1328, name: 'UFC 332', date: '2026-10-03', action: 'inserted', image_url: 'https://example.com/1328.jpg' },
      { id: 1327, name: 'UFC Fight Night', date: '2026-09-26', action: 'updated' },
      { id: 1326, name: 'UFC Fight Night', date: '2026-09-19', action: 'unchanged' },
    ],
  });

  assert.equal(summary.status, 'complete');
  assert.equal(summary.scanned, 80);
  assert.equal(summary.insertedCount, 2);
  assert.equal(summary.updatedCount, 1);
  assert.deepEqual(summary.changedEvents.map((event) => event.id), [1328, 1327]);
  assert.equal(summary.endId, null);
  assert.deepEqual(summary.posterErrors, ['1330: Tapology unavailable']);
});

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
