const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyManualFightCardPreviewUpdates,
  buildFightCardPreview,
} = require('../lib/fightCardImport');
const {
  syncFighterStyleFromFightCardRows,
} = require('../lib/fighterStyleSync');

test('applyManualFightCardPreviewUpdates fills blank odds, style, and stats without overwriting scraped values', () => {
  const preview = {
    rows: [
      {
        FightId: 10,
        FighterId: 100,
        Corner: 'Red',
        odds: null,
        style: null,
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

  assert.equal(result.appliedManualUpdateCount, 8);
  assert.equal(result.preview.rows[0].odds, '+105');
  assert.equal(result.preview.rows[0].style, 'Wrestling');
  assert.equal(result.preview.rows[0].KO_TKO_Wins, '7');
  assert.equal(result.preview.rows[0].KO_TKO_Losses, '0');
  assert.equal(result.preview.rows[0].Submission_Wins, '2');
  assert.equal(result.preview.rows[0].Submission_Losses, '1');
  assert.equal(result.preview.rows[0].Decision_Wins, '4');
  assert.equal(result.preview.rows[0].Decision_Losses, '3');
  assert.equal(result.preview.rows[1].odds, '-125');
  assert.equal(result.preview.rows[1].style, 'Kickboxing');
  assert.equal(result.preview.rows[1].KO_TKO_Wins, 3);
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
  assert(preview.warnings.includes('Live Tapology refresh failed; preview is using cached or partial Tapology data.'));
  assert(
    !preview.warnings.some((warning) => warning.startsWith('No Tapology fighter profiles were matched')),
    'cache-backed previews should not use the no Tapology matches warning'
  );
});

test('syncFighterStyleFromFightCardRows inserts manual style and stat values into fighters', async () => {
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
  assert.equal(fighterRows[0].ko_tko_wins, 4);
  assert.equal(fighterRows[0].submission_wins, 2);
  assert.equal(fighterRows[0].decision_losses, 2);
});
