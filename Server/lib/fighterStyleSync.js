const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 250;
const FIGHTER_PROFILE_TABLE = 'fighters';
const METHOD_STAT_FIELDS = [
  'ko_tko_wins',
  'ko_tko_losses',
  'submission_wins',
  'submission_losses',
  'decision_wins',
  'decision_losses',
];

function normalizeText(value) {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toComparableNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : -1;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeName(firstName, lastName) {
  return [firstName, lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') || null;
}

function hasAnyMethodStats(row) {
  return METHOD_STAT_FIELDS.some((field) => row[field] !== null && row[field] !== undefined);
}

function compactRow(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null && value !== undefined)
  );
}

function shouldRefreshExistingStats(existing, candidate) {
  const existingEventId = normalizeInteger(existing.stats_as_of_event_id);
  const candidateEventId = normalizeInteger(candidate.stats_as_of_event_id);

  if (candidateEventId !== null && existingEventId !== null) {
    return candidateEventId >= existingEventId;
  }

  if (candidateEventId !== null && existingEventId === null) {
    return true;
  }

  return !hasAnyMethodStats(existing);
}

function chooseBetterSourceRow(currentRow, candidateRow) {
  if (!currentRow) {
    return candidateRow;
  }

  const currentHasStyle = Boolean(currentRow.style);
  const candidateHasStyle = Boolean(candidateRow.style);
  const currentHasStats = hasAnyMethodStats(currentRow);
  const candidateHasStats = hasAnyMethodStats(candidateRow);

  if (currentHasStats !== candidateHasStats) {
    return candidateHasStats ? candidateRow : currentRow;
  }

  if (currentHasStyle !== candidateHasStyle) {
    return candidateHasStyle ? candidateRow : currentRow;
  }

  const currentSortKey = [
    toComparableNumber(currentRow.EventId),
    toComparableNumber(currentRow.FightId),
    toComparableNumber(currentRow.id),
  ];

  const candidateSortKey = [
    toComparableNumber(candidateRow.EventId),
    toComparableNumber(candidateRow.FightId),
    toComparableNumber(candidateRow.id),
  ];

  for (let index = 0; index < currentSortKey.length; index += 1) {
    if (candidateSortKey[index] > currentSortKey[index]) {
      return candidateRow;
    }

    if (candidateSortKey[index] < currentSortKey[index]) {
      return currentRow;
    }
  }

  return currentRow;
}

async function fetchAllRows(supabase, tableName, selectClause) {
  let from = 0;
  const allRows = [];

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select(selectClause)
      .range(from, to);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return allRows;
}

async function upsertInBatches(supabase, tableName, rows) {
  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from(tableName)
      .upsert(batch, { onConflict: 'fighter_id' });

    if (error) {
      throw error;
    }
  }
}

function buildSourceByFighterId(fightCardRows) {
  const sourceByFighterId = new Map();

  for (const row of fightCardRows || []) {
    const fighterId = Number(row.FighterId ?? row.fighter_id);
    if (!Number.isFinite(fighterId)) {
      continue;
    }

    const normalizedRow = {
      fighter_id: fighterId,
      mma_id: row.MMAId ?? row.mma_id ?? null,
      first_name: normalizeText(row.FirstName ?? row.first_name),
      last_name: normalizeText(row.LastName ?? row.last_name),
      style: normalizeText(row.style ?? row.Style),
      rank: normalizeInteger(row.Rank ?? row.rank),
      streak: normalizeInteger(row.Streak ?? row.streak),
      ko_tko_wins: normalizeInteger(row.KO_TKO_Wins ?? row.ko_tko_wins),
      ko_tko_losses: normalizeInteger(row.KO_TKO_Losses ?? row.ko_tko_losses),
      submission_wins: normalizeInteger(row.Submission_Wins ?? row.submission_wins),
      submission_losses: normalizeInteger(row.Submission_Losses ?? row.submission_losses),
      decision_wins: normalizeInteger(row.Decision_Wins ?? row.decision_wins),
      decision_losses: normalizeInteger(row.Decision_Losses ?? row.decision_losses),
      tapology_fighter_url: normalizeText(row.TapologyFighterURL ?? row.tapology_fighter_url),
      stats_confidence: normalizeText(row.TapologyMatchConfidence ?? row.stats_confidence),
      EventId: row.EventId ?? row.event_id ?? null,
      StartTime: row.StartTime ?? row.event_date ?? null,
      FightId: row.FightId ?? row.fight_id ?? null,
      id: row.id ?? null,
    };

    normalizedRow.normalized_name = normalizeName(normalizedRow.first_name, normalizedRow.last_name);
    normalizedRow.stats_source = hasAnyMethodStats(normalizedRow) ? 'fight_card_import' : null;
    normalizedRow.stats_as_of_event_id = normalizeInteger(normalizedRow.EventId);
    normalizedRow.stats_as_of_event_date = typeof normalizedRow.StartTime === 'string'
      ? normalizedRow.StartTime.split('T')[0]
      : null;

    sourceByFighterId.set(
      fighterId,
      chooseBetterSourceRow(sourceByFighterId.get(fighterId), normalizedRow)
    );
  }

  return sourceByFighterId;
}

async function syncFighterStyleFromFightCardRows({ supabase, fightCardRows }) {
  const sourceByFighterId = buildSourceByFighterId(fightCardRows);
  const existingRows = await fetchAllRows(
    supabase,
    FIGHTER_PROFILE_TABLE,
    [
      'fighter_id',
      'style',
      'ko_tko_wins',
      'ko_tko_losses',
      'submission_wins',
      'submission_losses',
      'decision_wins',
      'decision_losses',
      'stats_as_of_event_id',
      'stats_as_of_event_date',
    ].join(',')
  );
  const existingByFighterId = new Map(
    existingRows.map((row) => [Number(row.fighter_id), row])
  );

  const inserts = [];
  const updates = [];

  for (const [fighterId, candidate] of sourceByFighterId.entries()) {
    const existing = existingByFighterId.get(fighterId);

    if (!existing) {
      inserts.push({
        fighter_id: candidate.fighter_id,
        mma_id: candidate.mma_id,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        normalized_name: candidate.normalized_name,
        style: candidate.style,
        rank: candidate.rank,
        streak: candidate.streak,
        ko_tko_wins: candidate.ko_tko_wins,
        ko_tko_losses: candidate.ko_tko_losses,
        submission_wins: candidate.submission_wins,
        submission_losses: candidate.submission_losses,
        decision_wins: candidate.decision_wins,
        decision_losses: candidate.decision_losses,
        tapology_fighter_url: candidate.tapology_fighter_url,
        stats_source: hasAnyMethodStats(candidate) ? candidate.stats_source : null,
        stats_confidence: candidate.stats_confidence,
        stats_as_of_event_id: candidate.stats_as_of_event_id,
        stats_as_of_event_date: candidate.stats_as_of_event_date,
        last_success_at: hasAnyMethodStats(candidate) ? new Date().toISOString() : null,
      });
      continue;
    }

    const update = { fighter_id: candidate.fighter_id };
    const existingStyle = normalizeText(existing.style);
    if (!existingStyle && candidate.style) {
      update.style = candidate.style;
    }

    for (const field of METHOD_STAT_FIELDS) {
      if (candidate[field] === null || candidate[field] === undefined) {
        continue;
      }

      if (
        existing[field] === null
        || existing[field] === undefined
        || (shouldRefreshExistingStats(existing, candidate) && Number(existing[field]) !== candidate[field])
      ) {
        update[field] = candidate[field];
      }
    }

    if (Object.keys(update).length > 1) {
      updates.push(compactRow({
        ...update,
        mma_id: candidate.mma_id,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        normalized_name: candidate.normalized_name,
        rank: candidate.rank,
        streak: candidate.streak,
        tapology_fighter_url: candidate.tapology_fighter_url,
        stats_source: hasAnyMethodStats(candidate) ? candidate.stats_source : null,
        stats_confidence: candidate.stats_confidence,
        stats_as_of_event_id: candidate.stats_as_of_event_id,
        stats_as_of_event_date: candidate.stats_as_of_event_date,
        last_success_at: hasAnyMethodStats(candidate) ? new Date().toISOString() : null,
      }));
    }
  }

  if (inserts.length > 0) {
    await upsertInBatches(supabase, FIGHTER_PROFILE_TABLE, inserts);
  }

  if (updates.length > 0) {
    await upsertInBatches(supabase, FIGHTER_PROFILE_TABLE, updates);
  }

  return {
    scannedFightCardRows: (fightCardRows || []).length,
    distinctFightersFound: sourceByFighterId.size,
    insertedFighters: inserts.length,
    updatedFighters: updates.length,
    filledMissingStyles: updates.filter((row) => Boolean(row.style)).length,
    filledMissingStatFields: updates.reduce(
      (count, row) => count + METHOD_STAT_FIELDS.reduce(
        (fieldCount, field) => fieldCount + (row[field] !== undefined ? 1 : 0),
        0
      ),
      0
    ),
  };
}

async function syncFighterStyleFromAllFightCards(supabase) {
  const fightCardRows = await fetchAllRows(
    supabase,
    'ufc_full_fight_card',
    [
      'id',
      'FightId',
      'EventId',
      'StartTime',
      'FighterId',
      'MMAId',
      'FirstName',
      'LastName',
      'style',
      'Rank',
      'Streak',
      'KO_TKO_Wins',
      'KO_TKO_Losses',
      'Submission_Wins',
      'Submission_Losses',
      'Decision_Wins',
      'Decision_Losses',
      'TapologyFighterURL',
      'TapologyMatchConfidence',
    ].join(',')
  );

  return syncFighterStyleFromFightCardRows({
    supabase,
    fightCardRows,
  });
}

async function syncFighterStyleFromEvent(supabase, eventId) {
  const { data, error } = await supabase
    .from('ufc_full_fight_card')
    .select([
      'id',
      'FightId',
      'EventId',
      'StartTime',
      'FighterId',
      'MMAId',
      'FirstName',
      'LastName',
      'style',
      'Rank',
      'Streak',
      'KO_TKO_Wins',
      'KO_TKO_Losses',
      'Submission_Wins',
      'Submission_Losses',
      'Decision_Wins',
      'Decision_Losses',
      'TapologyFighterURL',
      'TapologyMatchConfidence',
    ].join(','))
    .eq('EventId', eventId);

  if (error) {
    throw error;
  }

  return syncFighterStyleFromFightCardRows({
    supabase,
    fightCardRows: data || [],
  });
}

module.exports = {
  syncFighterStyleFromAllFightCards,
  syncFighterStyleFromEvent,
  syncFighterStyleFromFightCardRows,
};
