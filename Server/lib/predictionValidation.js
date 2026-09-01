function normalizeFightStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function validatePredictionTarget({ fightRows, fighterId, fightResult = null }) {
  const rows = Array.isArray(fightRows) ? fightRows : [];
  const participantRows = rows.filter(
    (row) => row?.FighterId !== null && row?.FighterId !== undefined
  );
  const participantIds = new Set(
    participantRows.map((row) => String(row.FighterId))
  );

  if (participantIds.size !== 2) {
    return {
      valid: false,
      status: 404,
      error: 'Fight not found or missing fighter data',
    };
  }

  if (participantRows.some((row) => ['canceled', 'cancelled'].includes(normalizeFightStatus(row.FightStatus)))) {
    return {
      valid: false,
      status: 409,
      error: 'Predictions are closed for a cancelled fight',
    };
  }

  if (fightResult?.is_completed) {
    return {
      valid: false,
      status: 409,
      error: 'Predictions are closed for a completed fight',
    };
  }

  const selectedFighter = participantRows.find(
    (row) => String(row.FighterId) === String(fighterId)
  );
  if (!selectedFighter) {
    return {
      valid: false,
      status: 400,
      error: 'Selected fighter is not part of this fight',
    };
  }

  return {
    valid: true,
    selectedFighter,
  };
}

function validatePredictionUndo({ fightRows, fightResult = null }) {
  const rows = Array.isArray(fightRows) ? fightRows : [];
  if (rows.length === 0) {
    return { valid: false, status: 404, error: 'Fight not found' };
  }

  if (rows.some((row) => ['canceled', 'cancelled'].includes(normalizeFightStatus(row?.FightStatus)))) {
    return {
      valid: false,
      status: 409,
      error: 'Canceled fight predictions cannot be removed',
    };
  }

  if (fightResult?.is_completed) {
    return {
      valid: false,
      status: 409,
      error: 'Completed fight predictions cannot be removed',
    };
  }

  return { valid: true };
}

module.exports = {
  validatePredictionTarget,
  validatePredictionUndo,
};
