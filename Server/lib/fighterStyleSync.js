const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 250;
const FIGHTER_PROFILE_TABLE = 'fighters';

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

function normalizeName(firstName, lastName) {
  return [firstName, lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') || null;
}

function compactRow(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null && value !== undefined)
  );
}

function chooseBetterSourceRow(currentRow, candidateRow) {
  if (!currentRow) {
    return candidateRow;
  }

  const currentHasStyle = Boolean(currentRow.style);
  const candidateHasStyle = Boolean(candidateRow.style);
  if (currentHasStyle !== candidateHasStyle) {
    return candidateHasStyle ? candidateRow : currentRow;
  }

  const currentHasTapologyUrl = Boolean(currentRow.tapology_fighter_url);
  const candidateHasTapologyUrl = Boolean(candidateRow.tapology_fighter_url);
  if (currentHasTapologyUrl !== candidateHasTapologyUrl) {
    return candidateHasTapologyUrl ? candidateRow : currentRow;
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
      tapology_fighter_url: normalizeText(row.TapologyFighterURL ?? row.tapology_fighter_url),
      EventId: row.EventId ?? row.event_id ?? null,
      FightId: row.FightId ?? row.fight_id ?? null,
      id: row.id ?? null,
    };

    normalizedRow.normalized_name = normalizeName(normalizedRow.first_name, normalizedRow.last_name);

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
      'mma_id',
      'first_name',
      'last_name',
      'normalized_name',
      'style',
      'tapology_fighter_url',
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
        tapology_fighter_url: candidate.tapology_fighter_url,
      });
      continue;
    }

    const update = { fighter_id: candidate.fighter_id };
    const existingStyle = normalizeText(existing.style);
    if (!existingStyle && candidate.style) {
      update.style = candidate.style;
    }

    if (!normalizeText(existing.tapology_fighter_url) && candidate.tapology_fighter_url) {
      update.tapology_fighter_url = candidate.tapology_fighter_url;
    }

    if (Object.keys(update).length > 1) {
      updates.push(compactRow({
        ...update,
        mma_id: existing.mma_id ?? candidate.mma_id,
        first_name: existing.first_name ?? candidate.first_name,
        last_name: existing.last_name ?? candidate.last_name,
        normalized_name: existing.normalized_name ?? candidate.normalized_name,
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
    filledMissingStatFields: 0,
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
      'FighterId',
      'MMAId',
      'FirstName',
      'LastName',
      'style',
      'TapologyFighterURL',
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
      'FighterId',
      'MMAId',
      'FirstName',
      'LastName',
      'style',
      'TapologyFighterURL',
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
