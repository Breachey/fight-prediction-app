function normalizeId(value) {
  return value === null || value === undefined ? null : String(value);
}

function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function compareStandings(a, b) {
  return (
    normalizeNumber(b.total_points) - normalizeNumber(a.total_points) ||
    normalizeNumber(b.correct_predictions) - normalizeNumber(a.correct_predictions) ||
    normalizeNumber(b.accuracy) - normalizeNumber(a.accuracy) ||
    String(a.username || '').localeCompare(String(b.username || ''))
  );
}

function buildUserLookups(users = []) {
  return {
    byId: new Map(users.map((user) => [normalizeId(user.user_id), user])),
    byUsername: new Map(
      users
        .filter((user) => user?.username)
        .map((user) => [String(user.username), user])
    ),
  };
}

function resolveUser(record, lookups) {
  const userId = normalizeId(record?.user_id);
  if (userId && lookups.byId.has(userId)) return lookups.byId.get(userId);
  if (record?.username && lookups.byUsername.has(String(record.username))) {
    return lookups.byUsername.get(String(record.username));
  }
  return null;
}

function formatFighterName(row) {
  return [row?.FirstName, row?.LastName].filter(Boolean).join(' ').trim() || 'Unknown fighter';
}

function buildFightLookup(fightRows = []) {
  const fights = new Map();

  fightRows.forEach((row) => {
    const fightId = normalizeId(row?.FightId ?? row?.fight_id);
    if (!fightId) return;
    const fight = fights.get(fightId) || {
      fight_id: fightId,
      fight_order: normalizeNumber(row?.FightOrder ?? row?.bout_order, Number.MAX_SAFE_INTEGER),
      card_segment: row?.CardSegment ?? row?.card_segment ?? '',
      fighters: new Map(),
    };
    const fighterId = normalizeId(row?.FighterId ?? row?.fighter_id);
    if (fighterId) fight.fighters.set(fighterId, formatFighterName(row));
    fights.set(fightId, fight);
  });

  return fights;
}

function getOpponentName(fight, fighterId) {
  const selectedId = normalizeId(fighterId);
  for (const [candidateId, fighterName] of fight?.fighters || []) {
    if (candidateId !== selectedId) return fighterName;
  }
  return 'their opponent';
}

function joinNames(recipients = []) {
  const names = recipients.map((recipient) => recipient.username).filter(Boolean);
  if (names.length === 0) return 'Nobody';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

function buildEventRecap({
  event = {},
  leaderboard = [],
  predictions = [],
  predictionResults = [],
  fightRows = [],
  fightResults = [],
  users = [],
} = {}) {
  const userLookups = buildUserLookups(users);
  const humanLeaderboard = leaderboard
    .filter((entry) => {
      const user = resolveUser(entry, userLookups);
      return entry?.is_bot !== true && user?.is_bot !== true;
    })
    .sort(compareStandings);
  const leaderboardByUserId = new Map(
    humanLeaderboard.map((entry) => [normalizeId(entry.user_id), entry])
  );

  const toRecipient = (userId) => {
    const normalizedUserId = normalizeId(userId);
    const leaderboardEntry = leaderboardByUserId.get(normalizedUserId);
    const user = userLookups.byId.get(normalizedUserId);
    if (!leaderboardEntry && !user) return null;
    return {
      user_id: normalizedUserId,
      username: leaderboardEntry?.username || user?.username || 'Unknown',
      avatar_config: leaderboardEntry?.avatar_config || user?.avatar_config || null,
      playercard: leaderboardEntry?.playercard || user?.playercards || null,
    };
  };
  const recipientsFor = (userIds) => [...new Set(userIds.map(normalizeId).filter(Boolean))]
    .map(toRecipient)
    .filter(Boolean);

  const podium = humanLeaderboard.slice(0, 3).map((entry, index) => ({
    place: index + 1,
    ...toRecipient(entry.user_id),
    total_points: normalizeNumber(entry.total_points),
    correct_predictions: normalizeNumber(entry.correct_predictions),
    total_predictions: normalizeNumber(entry.total_predictions),
  }));
  const topPoints = podium[0]?.total_points ?? null;
  const winners = topPoints === null
    ? []
    : recipientsFor(
        humanLeaderboard
          .filter((entry) => normalizeNumber(entry.total_points) === topPoints)
          .map((entry) => entry.user_id)
      );

  const fights = buildFightLookup(fightRows);
  const completedWinnerByFightId = new Map(
    fightResults
      .filter((result) => result?.is_completed && result?.fighter_id !== null && result?.fighter_id !== undefined)
      .map((result) => [normalizeId(result.fight_id), normalizeId(result.fighter_id)])
  );
  const completedFights = [...fights.values()]
    .filter((fight) => completedWinnerByFightId.has(fight.fight_id))
    .sort((a, b) => b.fight_order - a.fight_order || normalizeNumber(a.fight_id) - normalizeNumber(b.fight_id));

  const humanPredictions = predictions.flatMap((prediction) => {
    const user = resolveUser(prediction, userLookups);
    const fightId = normalizeId(prediction?.fight_id);
    const fighterId = normalizeId(prediction?.fighter_id);
    const winnerId = completedWinnerByFightId.get(fightId);
    if (!user || user.is_bot || !fightId || !fighterId || !winnerId || !fights.has(fightId)) return [];
    const fight = fights.get(fightId);
    return [{
      ...prediction,
      user_id: normalizeId(user.user_id),
      username: user.username,
      fight_id: fightId,
      fighter_id: fighterId,
      winner_id: winnerId,
      is_correct: fighterId === winnerId,
      betting_odds: Number.isFinite(Number(prediction.betting_odds)) ? Number(prediction.betting_odds) : null,
      fighter_name: fight.fighters.get(fighterId) || 'Unknown fighter',
      opponent_name: getOpponentName(fight, fighterId),
    }];
  });

  const humanResultRows = predictionResults.flatMap((result) => {
    const user = resolveUser(result, userLookups);
    if (!user || user.is_bot) return [];
    return [{
      ...result,
      user_id: normalizeId(user.user_id),
      fight_id: normalizeId(result.fight_id),
      predicted_correctly: Boolean(result.predicted_correctly),
      points: normalizeNumber(result.points),
    }];
  });
  const resultByUserFight = new Map(
    humanResultRows.map((result) => [`${result.user_id}:${result.fight_id}`, result])
  );

  const awardList = [];
  const addAward = (award) => {
    if (award) awardList.push(award);
  };

  const upsetPick = humanPredictions
    .filter((prediction) => prediction.is_correct && prediction.betting_odds > 0)
    .sort((a, b) => b.betting_odds - a.betting_odds || a.fight_id.localeCompare(b.fight_id))[0];
  if (upsetPick) {
    const upsetRecipients = recipientsFor(
      humanPredictions
        .filter((prediction) => (
          prediction.fight_id === upsetPick.fight_id &&
          prediction.fighter_id === upsetPick.fighter_id &&
          prediction.betting_odds === upsetPick.betting_odds
        ))
        .map((prediction) => prediction.user_id)
    );
    addAward({
      id: 'biggest_upset',
      title: 'Upset Call',
      headline: `${joinNames(upsetRecipients)} called ${upsetPick.fighter_name}`,
      value: `+${upsetPick.betting_odds}`,
      detail: `The biggest underdog pick that hit, over ${upsetPick.opponent_name}.`,
      recipients: upsetRecipients,
      fight_id: upsetPick.fight_id,
    });
  }

  const predictionsByFight = new Map();
  humanPredictions.forEach((prediction) => {
    if (!predictionsByFight.has(prediction.fight_id)) predictionsByFight.set(prediction.fight_id, []);
    predictionsByFight.get(prediction.fight_id).push(prediction);
  });
  const contrarianCandidates = [];
  const badBeatCandidates = [];
  predictionsByFight.forEach((fightPredictions, fightId) => {
    const totalPicks = fightPredictions.length;
    if (totalPicks < 2) return;
    const winnerId = completedWinnerByFightId.get(fightId);
    const winnerPicks = fightPredictions.filter((prediction) => prediction.fighter_id === winnerId);
    if (winnerPicks.length > 0 && winnerPicks.length < totalPicks) {
      contrarianCandidates.push({
        picks: winnerPicks,
        share: winnerPicks.length / totalPicks,
        totalPicks,
        bestOdds: Math.max(...winnerPicks.map((prediction) => prediction.betting_odds ?? Number.NEGATIVE_INFINITY)),
      });
    }

    const losingGroups = new Map();
    fightPredictions.filter((prediction) => !prediction.is_correct).forEach((prediction) => {
      if (!losingGroups.has(prediction.fighter_id)) losingGroups.set(prediction.fighter_id, []);
      losingGroups.get(prediction.fighter_id).push(prediction);
    });
    losingGroups.forEach((picks) => {
      badBeatCandidates.push({ picks, share: picks.length / totalPicks, totalPicks });
    });
  });

  const contrarian = contrarianCandidates.sort((a, b) => (
    a.share - b.share || b.bestOdds - a.bestOdds || b.totalPicks - a.totalPicks
  ))[0];
  if (contrarian) {
    const pick = contrarian.picks[0];
    const contrarianRecipients = recipientsFor(contrarian.picks.map((prediction) => prediction.user_id));
    addAward({
      id: 'contrarian_call',
      title: 'Against the Room',
      headline: `${joinNames(contrarianRecipients)} backed ${pick.fighter_name}`,
      value: `${Math.round(contrarian.share * 100)}% of picks`,
      detail: `${contrarian.picks.length} of ${contrarian.totalPicks} friends got this one right.`,
      recipients: contrarianRecipients,
      fight_id: pick.fight_id,
    });
  }

  const badBeat = badBeatCandidates.sort((a, b) => (
    b.picks.length - a.picks.length || b.share - a.share
  ))[0];
  if (badBeat) {
    const pick = badBeat.picks[0];
    const badBeatRecipients = recipientsFor(badBeat.picks.map((prediction) => prediction.user_id));
    addAward({
      id: 'group_bad_beat',
      title: 'Group Bad Beat',
      headline: `${joinNames(badBeatRecipients)} backed ${pick.fighter_name}`,
      value: `${badBeat.picks.length} burned`,
      detail: `${Math.round(badBeat.share * 100)}% of the room was on the losing side.`,
      recipients: badBeatRecipients,
      fight_id: pick.fight_id,
    });
  }

  let longestStreak = 0;
  const streakByUserId = new Map();
  humanLeaderboard.forEach((entry) => {
    const userId = normalizeId(entry.user_id);
    let current = 0;
    let longest = 0;
    completedFights.forEach((fight) => {
      const result = resultByUserFight.get(`${userId}:${fight.fight_id}`);
      if (result?.predicted_correctly) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    });
    streakByUserId.set(userId, longest);
    longestStreak = Math.max(longestStreak, longest);
  });
  if (longestStreak >= 2) {
    const hotHandRecipients = recipientsFor(
      [...streakByUserId.entries()]
        .filter(([, streak]) => streak === longestStreak)
        .map(([userId]) => userId)
    );
    addAward({
      id: 'hot_hand',
      title: 'Hot Hand',
      headline: `${joinNames(hotHandRecipients)} ran hot`,
      value: `${longestStreak} straight`,
      detail: 'The longest correct-pick run on the card.',
      recipients: hotHandRecipients,
    });
  }

  const mainCardFightIds = completedFights
    .filter((fight) => String(fight.card_segment).trim().toLowerCase() === 'main')
    .map((fight) => fight.fight_id);
  if (mainCardFightIds.length > 0) {
    const perfectMainCardUserIds = humanLeaderboard
      .map((entry) => normalizeId(entry.user_id))
      .filter((userId) => mainCardFightIds.every((fightId) => (
        resultByUserFight.get(`${userId}:${fightId}`)?.predicted_correctly === true
      )));
    if (perfectMainCardUserIds.length > 0) {
      const perfectRecipients = recipientsFor(perfectMainCardUserIds);
      addAward({
        id: 'perfect_main_card',
        title: 'Perfect Main Card',
        headline: `${joinNames(perfectRecipients)} swept the main card`,
        value: `${mainCardFightIds.length}/${mainCardFightIds.length}`,
        detail: 'Every main-card winner picked correctly.',
        recipients: perfectRecipients,
      });
    }
  }

  const latestFightId = completedFights[completedFights.length - 1]?.fight_id || null;
  if (latestFightId && humanLeaderboard.length > 1) {
    const baselineByUserId = new Map(
      humanLeaderboard.map((entry) => [normalizeId(entry.user_id), {
        user_id: normalizeId(entry.user_id),
        username: entry.username,
        total_points: 0,
        correct_predictions: 0,
        total_predictions: 0,
        accuracy: 0,
      }])
    );
    humanResultRows.filter((result) => result.fight_id !== latestFightId).forEach((result) => {
      const baseline = baselineByUserId.get(result.user_id);
      if (!baseline) return;
      baseline.total_predictions += 1;
      baseline.total_points += result.points;
      if (result.predicted_correctly) baseline.correct_predictions += 1;
      baseline.accuracy = baseline.total_predictions > 0
        ? (baseline.correct_predictions / baseline.total_predictions) * 100
        : 0;
    });
    const baseline = [...baselineByUserId.values()].sort(compareStandings);
    const baselineRankByUserId = new Map(baseline.map((entry, index) => [entry.user_id, index + 1]));
    const finalRankByUserId = new Map(humanLeaderboard.map((entry, index) => [normalizeId(entry.user_id), index + 1]));
    const moves = humanLeaderboard.map((entry) => {
      const userId = normalizeId(entry.user_id);
      return {
        userId,
        places: (baselineRankByUserId.get(userId) || 0) - (finalRankByUserId.get(userId) || 0),
      };
    });
    const biggestMove = Math.max(...moves.map((move) => move.places));
    if (biggestMove > 0) {
      const leapRecipients = recipientsFor(
        moves.filter((move) => move.places === biggestMove).map((move) => move.userId)
      );
      addAward({
        id: 'final_fight_leap',
        title: 'Final-Fight Leap',
        headline: `${joinNames(leapRecipients)} made the late move`,
        value: `+${biggestMove} ${biggestMove === 1 ? 'place' : 'places'}`,
        detail: 'Leaderboard movement after the final result.',
        recipients: leapRecipients,
        fight_id: latestFightId,
      });
    }
  }

  const winnerNames = joinNames(winners);
  const shareLines = [
    `Fight Picks — ${event.name || 'Event'} Recap`,
    ...(winners.length > 0 ? [`Winner${winners.length > 1 ? 's' : ''}: ${winnerNames} — ${topPoints} pts`] : []),
    ...podium.map((entry) => `${entry.place}. ${entry.username} — ${entry.total_points} pts`),
    ...awardList.slice(0, 4).map((award) => `${award.title}: ${award.headline} (${award.value})`),
  ];

  return {
    status: event.is_completed ? 'complete' : 'pending',
    event: {
      id: event.id ?? null,
      name: event.name || 'Fight Picks Event',
      date: event.date || null,
      image_url: event.image_url || null,
    },
    participant_count: humanLeaderboard.length,
    completed_fight_count: completedFights.length,
    winners,
    podium,
    awards: awardList,
    share_text: shareLines.join('\n'),
  };
}

module.exports = {
  buildEventRecap,
  compareStandings,
  joinNames,
};
