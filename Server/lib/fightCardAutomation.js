const path = require('path');

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

function resolveAutomationReportPath(value, repoRoot) {
  const reportPath = String(value || '').trim();
  if (!reportPath) {
    return null;
  }

  return path.isAbsolute(reportPath) ? reportPath : path.resolve(repoRoot, reportPath);
}

function summarizeUfcEventDiscovery(result) {
  const optionalNumber = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const changedEvents = (result?.events || [])
    .filter((event) => ['inserted', 'updated'].includes(event?.action))
    .map((event) => ({
      id: Number(event.id),
      name: event.name || null,
      date: event.date || null,
      action: event.action,
    }));

  return {
    status: 'complete',
    startedAt: result?.startedAt || null,
    finishedAt: result?.finishedAt || null,
    startId: optionalNumber(result?.startId),
    endId: optionalNumber(result?.endId),
    scanned: Number(result?.scanned) || 0,
    apiEventsFound: Number(result?.api_events_found) || 0,
    eligibleEventsFound: Number(result?.eligible_events_found) || 0,
    filteredEvents: Number(result?.filtered_events) || 0,
    insertedCount: Number(result?.insertedCount) || 0,
    updatedCount: Number(result?.updatedCount) || 0,
    unchangedCount: Number(result?.unchangedCount) || 0,
    posterCount: Number(result?.posterCount) || 0,
    posterAttemptCount: Number(result?.posterAttemptCount) || 0,
    posterSkippedCount: Number(result?.posterSkippedCount) || 0,
    posterErrors: Array.isArray(result?.posterErrors) ? result.posterErrors : [],
    changedEvents,
  };
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

function eventDateKey(value) {
  const dateKey = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : null;
}

function selectDueEvents({
  events,
  now = new Date(),
  timeZone = 'America/Denver',
  explicitEventId = null,
  maxEvents = 2,
}) {
  const today = dateKeyInTimeZone(now, timeZone);
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

      const dateKey = eventDateKey(event?.date);
      return dateKey !== null && dateKey >= today;
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

function fightSummary(row) {
  const firstName = String(row?.FirstName || '').trim();
  const lastName = String(row?.LastName || '').trim();
  return {
    fighterId: Number(row?.FighterId),
    name: [firstName, lastName].filter(Boolean).join(' ') || `Fighter ${row?.FighterId}`,
    corner: row?.Corner || null,
  };
}

function buildFightsById(rows) {
  const fights = new Map();
  for (const row of rows || []) {
    const fightId = Number(row?.FightId);
    if (!Number.isFinite(fightId)) {
      continue;
    }

    if (!fights.has(fightId)) {
      fights.set(fightId, []);
    }
    fights.get(fightId).push(fightSummary(row));
  }

  for (const fighters of fights.values()) {
    fighters.sort((left, right) => left.fighterId - right.fighterId);
  }
  return fights;
}

function sameFighterSet(left, right) {
  return left.length === right.length
    && left.every((fighter, index) => fighter.fighterId === right[index].fighterId);
}

function summarizeLineupChanges(existingRows, nextRows) {
  const existingFights = buildFightsById(existingRows);
  const nextFights = buildFightsById(nextRows);
  const addedFights = [];
  const removedFights = [];
  const changedFights = [];
  let unchangedFightCount = 0;

  for (const [fightId, fighters] of existingFights.entries()) {
    const nextFighters = nextFights.get(fightId);
    if (!nextFighters) {
      removedFights.push({ fightId, fighters });
    } else if (!sameFighterSet(fighters, nextFighters)) {
      changedFights.push({ fightId, before: fighters, after: nextFighters });
    } else {
      unchangedFightCount += 1;
    }
  }

  for (const [fightId, fighters] of nextFights.entries()) {
    if (!existingFights.has(fightId)) {
      addedFights.push({ fightId, fighters });
    }
  }

  const affectedExistingFightIds = [
    ...removedFights.map((fight) => fight.fightId),
    ...changedFights.map((fight) => fight.fightId),
  ];

  return {
    changed: addedFights.length > 0 || removedFights.length > 0 || changedFights.length > 0,
    unchangedFightCount,
    addedFights,
    removedFights,
    changedFights,
    affectedExistingFightIds,
  };
}

function assessLineupChange({ existingRows, nextRows, predictions }) {
  const lineupChanges = summarizeLineupChanges(existingRows, nextRows);
  const affectedFightIds = new Set(lineupChanges.affectedExistingFightIds);
  const existingPredictions = predictions || [];
  const affectedPredictionCount = existingPredictions.reduce(
    (count, prediction) => count + (affectedFightIds.has(Number(prediction?.fight_id)) ? 1 : 0),
    0
  );

  return {
    lineupChanges,
    predictionImpact: {
      totalPredictionCount: existingPredictions.length,
      affectedPredictionCount,
      preservedPredictionCount: existingPredictions.length - affectedPredictionCount,
    },
    canAutoApply: lineupChanges.changed && affectedPredictionCount === 0,
  };
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
  return summarizeFilledFightCardData(existingRows, nextRows).filledValueCount;
}

function summarizeFilledFightCardData(existingRows, nextRows) {
  const existingByKey = new Map(
    (existingRows || []).map((row) => [fightCardRowKey(row), row])
  );
  const nextByKey = new Map((nextRows || []).map((row) => [fightCardRowKey(row), row]));
  const byField = Object.fromEntries(AUTOMATION_FILL_FIELDS.map((field) => [field, 0]));
  let newRowCount = 0;

  for (const [key, next] of nextByKey.entries()) {
    const existing = existingByKey.get(key);
    if (!existing) {
      newRowCount += 1;
    }

    for (const field of AUTOMATION_FILL_FIELDS) {
      if ((!existing || !hasValue(existing[field])) && hasValue(next[field])) {
        byField[field] += 1;
      }
    }
  }

  return {
    filledValueCount: Object.values(byField).reduce((sum, count) => sum + count, 0),
    newRowCount,
    byField,
  };
}

function hasEventStarted(rows, now = new Date()) {
  const startTimes = (rows || [])
    .map((row) => Date.parse(row?.StartTime))
    .filter(Number.isFinite);

  return startTimes.length > 0 && Math.min(...startTimes) <= now.getTime();
}

module.exports = {
  AUTOMATION_FILL_FIELDS,
  assessLineupChange,
  countFilledFightCardValues,
  hasEventStarted,
  mergeScrapedRowsWithStoredValues,
  resolveAutomationReportPath,
  selectDueEvents,
  summarizeFilledFightCardData,
  summarizeMissingFightCardData,
  summarizeUfcEventDiscovery,
};
