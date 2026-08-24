const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyManualFightCardPreviewUpdates,
  buildImportedFightCardEditorPreview,
  buildFightCardPreview,
  markFightCardPreviewImported,
  saveFightCardPreviewProgress,
  storeFightCardPreview,
} = require('../lib/fightCardImport');
const {
  syncFighterStyleFromFightCardRows,
} = require('../lib/fighterStyleSync');

test('applyManualFightCardPreviewUpdates edits complete or missing preview values', () => {
  const preview = {
    rows: [
      {
        FightId: 10,
        FighterId: 100,
        Corner: 'Red',
        odds: null,
        style: null,
        Streak: null,
        TapologyFighterURL: null,
        KO_TKO_Wins: null,
        KO_TKO_Losses: null,
        Submission_Wins: null,
        Submission_Losses: null,
        Decision_Wins: null,
        Decision_Losses: null,
      },
      {
        FightId: 10,
        FighterId: 101,
        Corner: 'Blue',
        odds: '-125',
        style: 'Kickboxing',
        KO_TKO_Wins: 3,
      },
    ],
  };

  const result = applyManualFightCardPreviewUpdates(preview, {
    '10|100|Red': {
      odds: ' +105 ',
      style: ' Wrestling ',
      Streak: '-2',
      TapologyFighterURL: 'https://www.tapology.com/fightcenter/fighters/100-test',
      KO_TKO_Wins: ' 7 ',
      KO_TKO_Losses: '0',
      Submission_Wins: '2',
      Submission_Losses: '1',
      Decision_Wins: '4',
      Decision_Losses: '3',
    },
    '10|101|Blue': {
      odds: '+130',
      style: 'Grappling',
      KO_TKO_Wins: '10',
    },
  });

  assert.equal(result.appliedManualUpdateCount, 13);
  assert.equal(result.preview.rows[0].odds, '+105');
  assert.equal(result.preview.rows[0].style, 'Wrestling');
  assert.equal(result.preview.rows[0].Streak, '-2');
  assert.equal(result.preview.rows[0].TapologyFighterURL, 'https://www.tapology.com/fightcenter/fighters/100-test');
  assert.equal(result.preview.rows[0].KO_TKO_Wins, '7');
  assert.equal(result.preview.rows[0].KO_TKO_Losses, '0');
  assert.equal(result.preview.rows[0].Submission_Wins, '2');
  assert.equal(result.preview.rows[0].Submission_Losses, '1');
  assert.equal(result.preview.rows[0].Decision_Wins, '4');
  assert.equal(result.preview.rows[0].Decision_Losses, '3');
  assert.equal(result.preview.rows[1].odds, '+130');
  assert.equal(result.preview.rows[1].style, 'Grappling');
  assert.equal(result.preview.rows[1].KO_TKO_Wins, '10');
});

test('saveFightCardPreviewProgress updates the active preview and keeps all rows editable', () => {
  const stored = storeFightCardPreview({
    eventId: 1313,
    rows: [{
      FightId: 10,
      FighterId: 100,
      Corner: 'Red',
      FirstName: 'Preview',
      LastName: 'Fighter',
      odds: '-110',
      style: 'Wrestling',
      Streak: 2,
    }],
  });

  const result = saveFightCardPreviewProgress(stored.previewToken, 1313, {
    '10|100|Red': { odds: '+125', Streak: '-1' },
  });

  assert.equal(result.appliedManualUpdateCount, 2);
  assert.equal(result.preview.rows[0].odds, '+125');
  assert.equal(result.preview.rows[0].Streak, '-1');
  assert.equal(result.preview.editableRows.length, 1);
  assert.equal(result.preview.editableRows[0].odds, '+125');
});

test('markFightCardPreviewImported retains an editable preview for post-import saves', () => {
  const stored = storeFightCardPreview({
    eventId: 1318,
    rows: [{
      FightId: 20,
      FighterId: 200,
      Corner: 'Blue',
      FirstName: 'Imported',
      LastName: 'Fighter',
      odds: '-115',
      style: 'Boxing',
      Streak: -1,
    }],
  });

  const importedPreview = markFightCardPreviewImported(stored.previewToken, 1318);
  assert.equal(importedPreview.isImported, true);
  assert.equal(importedPreview.existingFightCardRowCount, 1);
  assert.equal(importedPreview.editableRows.length, 1);

  const saved = saveFightCardPreviewProgress(stored.previewToken, 1318, {
    '20|200|Blue': { odds: '+105' },
  });
  assert.equal(saved.preview.isImported, true);
  assert.equal(saved.preview.rows[0].odds, '+105');
});

test('buildImportedFightCardEditorPreview rebuilds the full editor from stored rows', () => {
  const preview = buildImportedFightCardEditorPreview({
    eventId: 1318,
    eventRecord: {
      id: 1318,
      name: 'UFC Test Event',
      date: '2026-07-25',
      venue: 'Test Arena',
    },
    rows: [{
      id: 900,
      EventId: 1318,
      FightId: 20,
      FighterId: 200,
      Corner: 'Red',
      FirstName: 'Stored',
      LastName: 'Fighter',
      odds: '+110',
      TapologyFighterURL: 'https://www.tapology.com/fightcenter/fighters/200-stored',
      style: 'Wrestling',
      Streak: 3,
      KO_TKO_Wins: 5,
    }],
  });

  assert.equal(preview.rowCount, 1);
  assert.equal(preview.fightCount, 1);
  assert.equal(preview.previewEvent.name, 'UFC Test Event');
  assert.equal(preview.editableRows[0].odds, '+110');
  assert.equal(preview.rows[0].id, undefined);
  assert.equal(preview.rows[0].FighterId, 200);
});

test('buildFightCardPreview distinguishes cached Tapology data from no Tapology matches', async () => {
  const rows = [
    {
      __rowNumber: 2,
      Event: 'UFC Test',
      EventId: '1313',
      FightId: '9001',
      FighterId: '101',
      Corner: 'Red',
      FirstName: 'Red',
      LastName: 'Fighter',
      TapologyFighterURL: 'https://www.tapology.com/fightcenter/fighters/red',
      TapologyMatchConfidence: 'cache:event-page-exact',
    },
    {
      __rowNumber: 3,
      Event: 'UFC Test',
      EventId: '1313',
      FightId: '9001',
      FighterId: '102',
      Corner: 'Blue',
      FirstName: 'Blue',
      LastName: 'Fighter',
      TapologyFighterURL: 'https://www.tapology.com/fightcenter/fighters/blue',
      TapologyMatchConfidence: 'cache:event-page-exact',
    },
  ];

  const preview = await buildFightCardPreview({
    eventId: 1313,
    csvPath: '/tmp/test.csv',
    headers: [],
    rows,
    headerErrors: [],
    eventRecord: { id: 1313, name: 'UFC Test' },
    existingFightCardRows: [],
    existingFightResults: [],
    scraperOutput: {
      stdout: 'Unable to fetch Tapology event page https://www.tapology.com/example',
    },
  });

  assert(preview.warnings.includes('Using cached Tapology data for 2/2 row(s).'));
  assert(preview.warnings.includes('Tapology fallback was unavailable; validated primary fighter sources were used.'));
  assert(
    !preview.warnings.some((warning) => warning.startsWith('No Tapology fighter profiles were matched')),
    'cache-backed previews should not use the no Tapology matches warning'
  );
});

test('buildFightCardPreview accepts mononymous fighters but still blocks a fully blank name', async () => {
  const baseRow = {
    Event: 'UFC Test',
    EventId: '1326',
    FightId: '12959',
    Corner: 'Red',
  };
  const mononymRows = [
    {
      ...baseRow,
      __rowNumber: 2,
      FighterId: '3634',
      FirstName: '',
      LastName: 'Aoriqileng',
    },
    {
      ...baseRow,
      __rowNumber: 3,
      FighterId: '4270',
      Corner: 'Blue',
      FirstName: 'Kai',
      LastName: 'Asakura',
    },
  ];

  const mononymPreview = await buildFightCardPreview({
    eventId: 1326,
    csvPath: '/tmp/mononym.csv',
    headers: [],
    rows: mononymRows,
    headerErrors: [],
    eventRecord: { id: 1326, name: 'UFC Test' },
    existingFightCardRows: [],
    existingFightResults: [],
    scraperOutput: {},
  });

  assert.equal(
    mononymPreview.blockers.some((blocker) => blocker.includes('missing the fighter name')),
    false
  );
  assert.equal(mononymPreview.rows[0].FirstName, null);
  assert.equal(mononymPreview.rows[0].LastName, 'Aoriqileng');

  const blankNamePreview = await buildFightCardPreview({
    eventId: 1326,
    csvPath: '/tmp/blank-name.csv',
    headers: [],
    rows: [
      { ...mononymRows[0], FirstName: '', LastName: '' },
      mononymRows[1],
    ],
    headerErrors: [],
    eventRecord: { id: 1326, name: 'UFC Test' },
    existingFightCardRows: [],
    existingFightResults: [],
    scraperOutput: {},
  });

  assert(
    blankNamePreview.blockers.includes('Row 2 is missing the fighter name.')
  );
});

test('buildFightCardPreview preserves existing profile data while refreshing odds', async () => {
  const existingFightCardRows = [
    {
      FightId: 9001,
      FighterId: 101,
      Corner: 'Red',
      odds: '+120',
      Streak: '5',
      style: 'Wrestling',
      Height_in: '72',
      KO_TKO_Wins: '6',
    },
    {
      FightId: 9001,
      FighterId: 102,
      Corner: 'Blue',
      odds: '-140',
      Streak: '-1',
      style: 'Boxing',
    },
  ];
  const rows = [
    {
      __rowNumber: 2,
      Event: 'UFC Test',
      EventId: '1313',
      FightId: '9001',
      FighterId: '101',
      Corner: 'Red',
      FirstName: 'Red',
      LastName: 'Fighter',
      odds: '-125',
      Streak: '2',
      style: 'Kickboxing',
      Height_in: '73',
      KO_TKO_Wins: '9',
    },
    {
      __rowNumber: 3,
      Event: 'UFC Test',
      EventId: '1313',
      FightId: '9001',
      FighterId: '102',
      Corner: 'Blue',
      FirstName: 'Blue',
      LastName: 'Fighter',
      odds: '',
      Streak: '3',
      style: 'Karate',
    },
  ];

  const preview = await buildFightCardPreview({
    eventId: 1313,
    csvPath: '/tmp/preserve-existing.csv',
    headers: [],
    rows,
    headerErrors: [],
    eventRecord: { id: 1313, name: 'UFC Test' },
    existingFightCardRows,
    existingFightResults: [],
    scraperOutput: {},
  });

  assert.equal(preview.changedFightCard, false);
  assert.equal(preview.rows[0].odds, '-125');
  assert.equal(preview.rows[0].Streak, '5');
  assert.equal(preview.rows[0].style, 'Wrestling');
  assert.equal(preview.rows[0].Height_in, '72');
  assert.equal(preview.rows[0].KO_TKO_Wins, '6');
  assert.equal(preview.rows[1].odds, '-140');
  assert.equal(preview.rows[1].Streak, '-1');
  assert.equal(preview.rows[1].style, 'Boxing');
});

test('syncFighterStyleFromFightCardRows does not recycle fight-card stats into fighters', async () => {
  const fighterRows = [];
  const fakeSupabase = {
    from(tableName) {
      assert.equal(tableName, 'fighters');
      return {
        select() {
          return {
            range() {
              return Promise.resolve({ data: fighterRows, error: null });
            },
          };
        },
        upsert(rows) {
          fighterRows.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const result = await syncFighterStyleFromFightCardRows({
    supabase: fakeSupabase,
    fightCardRows: [
      {
        FighterId: 101,
        MMAId: 202,
        FirstName: 'Manual',
        LastName: 'Style',
        style: 'Wrestling',
        Streak: '5',
        KO_TKO_Wins: '4',
        KO_TKO_Losses: '1',
        Submission_Wins: '2',
        Submission_Losses: '0',
        Decision_Wins: '3',
        Decision_Losses: '2',
      },
    ],
  });

  assert.equal(result.insertedFighters, 1);
  assert.equal(fighterRows[0].fighter_id, 101);
  assert.equal(fighterRows[0].mma_id, 202);
  assert.equal(fighterRows[0].first_name, 'Manual');
  assert.equal(fighterRows[0].last_name, 'Style');
  assert.equal(fighterRows[0].style, 'Wrestling');
  assert.equal(fighterRows[0].streak, undefined);
  assert.equal(fighterRows[0].ko_tko_wins, undefined);
  assert.equal(fighterRows[0].submission_wins, undefined);
  assert.equal(fighterRows[0].decision_losses, undefined);
});

test('syncFighterStyleFromFightCardRows leaves existing dynamic fighter stats unchanged', async () => {
  const upserts = [];
  const existingRows = [{
    fighter_id: 101,
    mma_id: 202,
    first_name: 'Existing',
    last_name: 'Fighter',
    normalized_name: 'existing fighter',
    style: 'Wrestling',
    tapology_fighter_url: 'https://example.com/existing-fighter',
  }];
  const fakeSupabase = {
    from(tableName) {
      assert.equal(tableName, 'fighters');
      return {
        select() {
          return {
            range() {
              return Promise.resolve({ data: existingRows, error: null });
            },
          };
        },
        upsert(rows) {
          upserts.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const result = await syncFighterStyleFromFightCardRows({
    supabase: fakeSupabase,
    fightCardRows: [{
      FighterId: 101,
      MMAId: 202,
      FirstName: 'Existing',
      LastName: 'Fighter',
      style: 'Wrestling',
      TapologyFighterURL: 'https://example.com/existing-fighter',
      Streak: '-4',
      KO_TKO_Wins: '99',
    }],
  });

  assert.equal(result.updatedFighters, 0);
  assert.deepEqual(upserts, []);
});
