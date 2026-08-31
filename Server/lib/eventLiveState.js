const { createHash } = require('crypto');

function normalizeId(value) {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function createRevision(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildEventLiveState({ cardRows = [], resultRows = [], predictionRows = [] } = {}) {
  const normalizedCardRows = (Array.isArray(cardRows) ? cardRows : [])
    .map((row) => ({
      fight_id: normalizeId(row?.FightId),
      fighter_id: normalizeId(row?.FighterId),
      corner: normalizeStatus(row?.Corner),
      fight_order: Number.isFinite(Number(row?.FightOrder)) ? Number(row.FightOrder) : null,
      fight_status: normalizeStatus(row?.FightStatus),
      odds: row?.odds === null || row?.odds === undefined ? null : String(row.odds),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  const normalizedResultRows = (Array.isArray(resultRows) ? resultRows : [])
    .map((row) => ({
      fight_id: normalizeId(row?.fight_id),
      fighter_id: normalizeId(row?.fighter_id),
      is_completed: Boolean(row?.is_completed),
      result_type: row?.result_type || null,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  const normalizedPredictionRows = (Array.isArray(predictionRows) ? predictionRows : [])
    .map((row) => ({
      fight_id: normalizeId(row?.fight_id),
      fighter_id: normalizeId(row?.fighter_id),
      user_id: normalizeId(row?.user_id),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  const fightIds = new Set(normalizedCardRows.map((row) => row.fight_id).filter(Boolean));
  const cancelledFightIds = new Set(
    normalizedCardRows
      .filter((row) => ['canceled', 'cancelled'].includes(row.fight_status))
      .map((row) => row.fight_id)
  );
  const completedFightIds = new Set(
    normalizedResultRows
      .filter((row) => row.is_completed)
      .map((row) => row.fight_id)
  );
  const resolvedFightIds = new Set([...cancelledFightIds, ...completedFightIds]);

  return {
    card_revision: createRevision(normalizedCardRows),
    result_revision: createRevision(normalizedResultRows),
    prediction_revision: createRevision(normalizedPredictionRows),
    fight_count: fightIds.size,
    completed_fight_count: completedFightIds.size,
    canceled_fight_count: cancelledFightIds.size,
    all_fights_resolved: fightIds.size > 0
      && [...fightIds].every((fightId) => resolvedFightIds.has(fightId)),
  };
}

module.exports = {
  buildEventLiveState,
};
