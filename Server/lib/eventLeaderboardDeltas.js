function normalizeFightId(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function findLatestCompletedFightId(eventResults, fightRows) {
  const completedFightIds = new Set(
    (eventResults || [])
      .map((result) => normalizeFightId(result?.fight_id))
      .filter(Boolean)
  );

  let latestFightId = null;
  let latestFightOrder = Number.POSITIVE_INFINITY;

  (fightRows || []).forEach((fight) => {
    const fightId = normalizeFightId(fight?.FightId ?? fight?.fight_id);
    const fightOrder = Number(fight?.FightOrder ?? fight?.bout_order);
    if (!fightId || !completedFightIds.has(fightId) || !Number.isFinite(fightOrder)) return;

    // FightOrder counts down toward the main event, so the lowest completed
    // order is the most recently completed bout.
    if (fightOrder < latestFightOrder) {
      latestFightId = fightId;
      latestFightOrder = fightOrder;
    }
  });

  return latestFightId;
}

function addFightToFightRankChanges(leaderboard, baselineLeaderboard) {
  if (!Array.isArray(leaderboard) || leaderboard.length === 0) return leaderboard || [];
  if (!Array.isArray(baselineLeaderboard) || baselineLeaderboard.length === 0) {
    return leaderboard.map((entry) => ({ ...entry, rank_change: 0, points_change: 0 }));
  }

  const baselineRankByUser = new Map(
    baselineLeaderboard.map((entry, index) => [String(entry.user_id), index + 1])
  );

  return leaderboard.map((entry, index) => {
    const currentRank = index + 1;
    const baselineRank = baselineRankByUser.get(String(entry.user_id));
    return {
      ...entry,
      rank_change: baselineRank ? baselineRank - currentRank : 0,
      points_change: 0,
    };
  });
}

module.exports = {
  addFightToFightRankChanges,
  findLatestCompletedFightId,
};
