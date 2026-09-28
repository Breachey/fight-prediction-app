const SEGMENT_KEYS = new Map([
  ['main', 'main_card'],
  ['maincard', 'main_card'],
  ['prelims1', 'prelims'],
  ['prelims', 'prelims'],
  ['prelims2', 'early_prelims'],
  ['earlyprelims', 'early_prelims'],
]);

function normalizeCardSegment(value) {
  const segment = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  return SEGMENT_KEYS.get(segment) || null;
}

function setEarliest(target, key, value) {
  const time = typeof value === 'string' ? value.trim() : '';
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(time) || !Number.isFinite(Date.parse(time))) return;
  if (!target[key] || Date.parse(time) < Date.parse(target[key])) target[key] = time;
}

function buildEventStartTimes(rows = []) {
  const timing = {
    start_time: null,
    card_start_times: { early_prelims: null, prelims: null, main_card: null },
  };
  for (const row of rows) {
    setEarliest(timing, 'start_time', row?.StartTime);
    const key = normalizeCardSegment(row?.CardSegment);
    if (key) setEarliest(timing.card_start_times, key, row?.CardSegmentStartTime);
  }
  if (!timing.start_time) {
    for (const time of Object.values(timing.card_start_times)) setEarliest(timing, 'start_time', time);
  }
  return timing;
}

module.exports = { buildEventStartTimes, normalizeCardSegment };
