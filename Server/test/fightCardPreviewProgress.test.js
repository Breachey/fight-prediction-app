const assert = require('node:assert/strict');
const test = require('node:test');
const {
  completeFightCardPreviewProgress,
  createFightCardPreviewProgress,
  getFightCardPreviewProgress,
  parseScraperProgressLine,
  updateFightCardPreviewProgress,
} = require('../lib/fightCardPreviewProgress');

test('preview progress is event-scoped and never moves backward', () => {
  const token = 'preview_progress_token_1234';
  createFightCardPreviewProgress({ token, eventId: 1326 });
  updateFightCardPreviewProgress(token, { phase: 'fighters', percent: 55, current: 12, total: 26 });
  updateFightCardPreviewProgress(token, { percent: 40 });

  assert.equal(getFightCardPreviewProgress(token, 1326).percent, 55);
  assert.equal(getFightCardPreviewProgress(token, 1326).current, 12);
  assert.equal(getFightCardPreviewProgress(token, 9999), null);

  completeFightCardPreviewProgress(token, { detail: '26 fighter rows are ready.' });
  assert.equal(getFightCardPreviewProgress(token, 1326).status, 'complete');
  assert.equal(getFightCardPreviewProgress(token, 1326).percent, 100);
});

test('structured scraper progress lines parse without accepting ordinary logs', () => {
  assert.deepEqual(
    parseScraperProgressLine('FIGHT_PICKER_PROGRESS {"phase":"fighters","percent":42}'),
    { phase: 'fighters', percent: 42 }
  );
  assert.equal(parseScraperProgressLine('Pulled odds from fightodds.io'), null);
  assert.equal(parseScraperProgressLine('FIGHT_PICKER_PROGRESS nope'), null);
});
