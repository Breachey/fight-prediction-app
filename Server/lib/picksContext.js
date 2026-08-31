function buildVoteCounts(predictions = [], users = []) {
  const usersById = new Map(users.map((user) => [String(user.user_id), user]));
  const usersByName = new Map(
    users.filter((user) => user?.username).map((user) => [String(user.username), user])
  );
  const counts = {};

  predictions.forEach((prediction) => {
    const predictionUser = usersById.get(String(prediction.user_id))
      || usersByName.get(String(prediction.username));
    if (!predictionUser) return;

    const fightId = String(prediction.fight_id);
    const fighterId = String(prediction.fighter_id);
    counts[fightId] ||= {};
    counts[fightId][fighterId] ||= { total: 0, human: 0 };
    counts[fightId][fighterId].total += 1;
    if (!predictionUser.is_bot) counts[fightId][fighterId].human += 1;
  });

  return counts;
}

function buildSubmittedPicks(predictions = [], currentFightIds = []) {
  const currentIds = new Set(currentFightIds.map(String));
  return predictions.reduce((submitted, prediction) => {
    if (currentIds.has(String(prediction.fight_id))) {
      submitted[String(prediction.fight_id)] = String(prediction.fighter_id);
    }
    return submitted;
  }, {});
}

function buildPriorPickOutcomes({ predictions = [], fightMeta = [], results = [], selectedEventDate = null }) {
  const metaByFight = new Map(fightMeta.map((fight) => [String(fight.FightId), fight]));
  const resultByFight = new Map(results.map((result) => [String(result.fight_id), result]));
  const selectedTime = selectedEventDate ? Date.parse(selectedEventDate) : Number.POSITIVE_INFINITY;

  return predictions
    .map((prediction) => {
      const meta = metaByFight.get(String(prediction.fight_id));
      const result = resultByFight.get(String(prediction.fight_id));
      const eventTime = meta?.event_date ? Date.parse(meta.event_date) : Number.NEGATIVE_INFINITY;
      if (!result?.is_completed || eventTime >= selectedTime) return null;
      return {
        fight_id: prediction.fight_id,
        fighter_id: prediction.fighter_id,
        event_id: meta?.EventId || null,
        event_date: meta?.event_date || null,
        winner: result.fighter_id ?? null,
        result_type: result.result_type || (result.fighter_id != null ? 'winner' : null),
        is_completed: true,
        fighter_won: result.fighter_id == null
          ? null
          : String(result.fighter_id) === String(prediction.fighter_id),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.event_date || 0) - Date.parse(a.event_date || 0));
}

function buildPicksContextPayload({ fights, userPredictions, currentFightIds, publicPredictions, users, reminders, fightMeta, results, selectedEventDate, liveState }) {
  return {
    fights: fights || [],
    submitted_picks: buildSubmittedPicks(userPredictions, currentFightIds),
    vote_counts: buildVoteCounts(publicPredictions, users),
    reminders: reminders || [],
    prior_pick_outcomes: buildPriorPickOutcomes({
      predictions: userPredictions,
      fightMeta,
      results,
      selectedEventDate,
    }),
    live_state: liveState || null,
  };
}

module.exports = {
  buildPicksContextPayload,
  buildPriorPickOutcomes,
  buildSubmittedPicks,
  buildVoteCounts,
};
