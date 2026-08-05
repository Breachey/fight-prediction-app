const AUTOMATION_FILL_FIELDS = [
  'odds',
  'TapologyFighterURL',
  'TapologyMatchConfidence',
  'Rank',
  'Streak',
  'style',
  'KO_TKO_Wins',
  'KO_TKO_Losses',
  'Submission_Wins',
  'Submission_Losses',
  'Decision_Wins',
  'Decision_Losses',
];

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function dateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(dateKey, days) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function selectDueEvents({
  events,
  now = new Date(),
  timeZone = 'America/Denver',
  explicitEventId = null,
  maxEvents = 2,
}) {
  const today = dateKeyInTimeZone(now, timeZone);
  const tomorrow = addCalendarDays(today, 1);
  const explicitId = explicitEventId === null || explicitEventId === undefined || explicitEventId === ''
    ? null
    : Number(explicitEventId);

  return (events || [])
    .filter((event) => {
      if (event?.is_completed === true) {
        return false;
      }

      if (Number.isFinite(explicitId)) {
        return Number(event?.id) === explicitId;
      }

      return event?.date === today || event?.date === tomorrow;
    })
    .sort((left, right) => (
      String(left.date || '').localeCompare(String(right.date || ''))
      || Number(left.id) - Number(right.id)
    ))
    .slice(0, Math.max(1, Number(maxEvents) || 1));
}

function fightCardRowKey(row) {
  return [row?.FightId, row?.FighterId, row?.Corner].join('|');
}

function mergeScrapedRowsWithStoredValues(scrapedRows, existingRows) {
  const existingByKey = new Map(
    (existingRows || []).map((row) => [fightCardRowKey(row), row])
  );

  return (scrapedRows || []).map((row) => {
    const existing = existingByKey.get(fightCardRowKey(row));
    if (!existing) {
      return row;
    }

    const merged = { ...row };
    for (const field of AUTOMATION_FILL_FIELDS) {
      if (hasValue(existing[field])) {
        merged[field] = existing[field];
      }
    }
    return merged;
  });
}

function summarizeMissingFightCardData(rows) {
  const rawRows = rows || [];
  const byField = Object.fromEntries(
    AUTOMATION_FILL_FIELDS.map((field) => [
      field,
      rawRows.reduce((count, row) => count + (hasValue(row[field]) ? 0 : 1), 0),
    ])
  );

  return {
    rowCount: rawRows.length,
    missingValueCount: Object.values(byField).reduce((sum, count) => sum + count, 0),
    rowsWithMissingValues: rawRows.reduce(
      (count, row) => count + (AUTOMATION_FILL_FIELDS.some((field) => !hasValue(row[field])) ? 1 : 0),
      0
    ),
    byField,
  };
}

function countFilledFightCardValues(existingRows, nextRows) {
  const nextByKey = new Map((nextRows || []).map((row) => [fightCardRowKey(row), row]));

  return (existingRows || []).reduce((count, existing) => {
    const next = nextByKey.get(fightCardRowKey(existing));
    if (!next) {
      return count;
    }

    return count + AUTOMATION_FILL_FIELDS.reduce(
      (fieldCount, field) => fieldCount + (!hasValue(existing[field]) && hasValue(next[field]) ? 1 : 0),
      0
    );
  }, 0);
}

function hasEventStarted(rows, now = new Date()) {
  const startTimes = (rows || [])
    .map((row) => Date.parse(row?.StartTime))
    .filter(Number.isFinite);

  return startTimes.length > 0 && Math.min(...startTimes) <= now.getTime();
}

module.exports = {
  AUTOMATION_FILL_FIELDS,
  countFilledFightCardValues,
  hasEventStarted,
  mergeScrapedRowsWithStoredValues,
  selectDueEvents,
  summarizeMissingFightCardData,
};
