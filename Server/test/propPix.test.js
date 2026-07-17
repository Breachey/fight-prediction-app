const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPropPixNotificationRecipients,
  normalizeOutcome,
  normalizePropPixInput,
  normalizePropPixVote,
} = require('../lib/propPix');

test('normalizes dropdown Prop Pix input and removes duplicate options', () => {
  const result = normalizePropPixInput({
    question: 'Who gets here first?',
    response_type: 'options',
    wager_label: '2 Shots',
    options: ['Gavin', 'Sara', 'Gavin'],
  });

  assert.deepEqual(result.value.options, ['Gavin', 'Sara']);
});

test('rejects invalid Prop Pix response modes and option counts', () => {
  assert.match(
    normalizePropPixInput({
      question: 'Who?',
      response_type: 'options',
      wager_label: '1 Shot',
      options: ['Only one'],
    }).error,
    /between 2 and/,
  );
  assert.match(
    normalizePropPixInput({
      question: 'Who?',
      response_type: 'text',
      wager_label: '1 Shot',
    }).error,
    /options or manual/,
  );
});

test('normalizes option and manual votes independently', () => {
  assert.deepEqual(normalizePropPixVote({ option_id: '4' }, 'options').value, {
    optionId: 4,
    responseText: null,
  });
  assert.deepEqual(normalizePropPixVote({ response_text: 'After 7 PM' }, 'manual').value, {
    optionId: null,
    responseText: 'After 7 PM',
  });
});

test('requires a non-empty outcome and deduplicates notification recipients', () => {
  assert.match(normalizeOutcome(' ').error, /Outcome/);
  assert.deepEqual(
    buildPropPixNotificationRecipients({ creatorUserId: 1, claimantUserId: 2, voterUserIds: [1, 2, 3] }),
    [1, 2, 3],
  );
});
