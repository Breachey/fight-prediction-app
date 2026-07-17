const PROP_PIX_RESPONSE_TYPES = new Set(['options', 'manual']);
const PROP_PIX_MAX_OPTIONS = 12;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePropPixInput(body = {}) {
  const question = cleanText(body.question);
  const responseType = cleanText(body.response_type || body.responseType).toLowerCase();
  const wagerLabel = cleanText(body.wager_label || body.wagerLabel);
  const rawOptions = Array.isArray(body.options) ? body.options : [];
  const options = rawOptions
    .map(cleanText)
    .filter(Boolean)
    .filter((option, index, values) => values.findIndex((candidate) => candidate.toLowerCase() === option.toLowerCase()) === index);

  if (question.length < 3 || question.length > 240) {
    return { error: 'Question must be between 3 and 240 characters' };
  }
  if (!PROP_PIX_RESPONSE_TYPES.has(responseType)) {
    return { error: 'Response type must be options or manual' };
  }
  if (wagerLabel.length < 1 || wagerLabel.length > 80) {
    return { error: 'Wager must be between 1 and 80 characters' };
  }
  if (responseType === 'options' && (options.length < 2 || options.length > PROP_PIX_MAX_OPTIONS)) {
    return { error: `Dropdown bets need between 2 and ${PROP_PIX_MAX_OPTIONS} options` };
  }
  if (options.some((option) => option.length > 120)) {
    return { error: 'Each option must be 120 characters or fewer' };
  }

  return { value: { question, responseType, wagerLabel, options } };
}

function normalizePropPixVote(body = {}, responseType) {
  const optionId = Number.parseInt(String(body.option_id ?? body.optionId ?? ''), 10);
  const responseText = cleanText(body.response_text || body.responseText);

  if (responseType === 'options') {
    if (!Number.isFinite(optionId)) {
      return { error: 'Choose one of the available options' };
    }
    return { value: { optionId, responseText: null } };
  }

  if (!responseText || responseText.length > 240) {
    return { error: 'Manual responses must be between 1 and 240 characters' };
  }

  return { value: { optionId: null, responseText } };
}

function normalizeOutcome(value) {
  const outcomeText = cleanText(value);
  if (!outcomeText || outcomeText.length > 240) {
    return { error: 'Outcome must be between 1 and 240 characters' };
  }
  return { value: outcomeText };
}

function uniqueUserIds(values) {
  return [...new Set(values
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value)))];
}

function buildPropPixNotificationRecipients({ creatorUserId, claimantUserId, voterUserIds = [] }) {
  return uniqueUserIds([creatorUserId, claimantUserId, ...voterUserIds]);
}

module.exports = {
  PROP_PIX_MAX_OPTIONS,
  PROP_PIX_RESPONSE_TYPES,
  buildPropPixNotificationRecipients,
  normalizeOutcome,
  normalizePropPixInput,
  normalizePropPixVote,
};
