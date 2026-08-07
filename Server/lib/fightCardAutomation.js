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
  assessLineupChange,
  countFilledFightCardValues,
  hasEventStarted,
  mergeScrapedRowsWithStoredValues,
  selectDueEvents,
  summarizeMissingFightCardData,
};
