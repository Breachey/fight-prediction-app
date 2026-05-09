const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyManualFightCardPreviewUpdates,
} = require('../lib/fightCardImport');

test('applyManualFightCardPreviewUpdates fills blank odds and style without overwriting scraped values', () => {
  const preview = {
    rows: [
      {
        FightId: 10,
        FighterId: 100,
        Corner: 'Red',
        odds: null,
        style: null,
      },
      {
        FightId: 10,
        FighterId: 101,
        Corner: 'Blue',
        odds: '-125',
        style: 'Kickboxing',
      },
    ],
  };

  const result = applyManualFightCardPreviewUpdates(preview, {
    '10|100|Red': {
      odds: ' +105 ',
      style: ' Wrestling ',
    },
    '10|101|Blue': {
      odds: '+130',
      style: 'Grappling',
    },
  });

  assert.equal(result.appliedManualUpdateCount, 2);
  assert.equal(result.preview.rows[0].odds, '+105');
  assert.equal(result.preview.rows[0].style, 'Wrestling');
  assert.equal(result.preview.rows[1].odds, '-125');
  assert.equal(result.preview.rows[1].style, 'Kickboxing');
});
