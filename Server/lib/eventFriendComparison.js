function normalizeId(value) {
  return value === null || value === undefined ? null : String(value);
}

function normalizeNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function formatFighterName(row) {
  return [row?.FirstName, row?.LastName].filter(Boolean).join(' ').trim() || 'Unknown fighter';
}

function buildUserLookups(users = []) {
  const byId = new Map();
  const byUsername = new Map();

  users.forEach((user) => {
    const userId = normalizeId(user?.user_id);
    if (userId) byId.set(userId, user);
    if (user?.username) byUsername.set(String(user.username), user);
  });

  return { byId, byUsername };
}

function resolveUser(record, lookups) {
  const userId = normalizeId(record?.user_id);
  if (userId && lookups.byId.has(userId)) return lookups.byId.get(userId);
  if (record?.username && lookups.byUsername.has(String(record.username))) {
    return lookups.byUsername.get(String(record.username));
  }
  return null;
}

function toPerson(user, pickCount = 0) {
  if (!user) return null;
  return {
    user_id: normalizeId(user.user_id),
    username: user.username || 'Unknown',
    avatar_config: user.avatar_config || null,
    playercard: user.playercards || user.playercard || null,
    pick_count: pickCount,
  };
}

function buildFightList(fightRows = []) {
  const fights = new Map();

  fightRows.forEach((row) => {
    const fightId = normalizeId(row?.FightId ?? row?.fight_id);
    if (!fightId) return;

    const fight = fights.get(fightId) || {
      fight_id: fightId,
      fight_order: normalizeNumber(row?.FightOrder ?? row?.bout_order, Number.MAX_SAFE_INTEGER),
      card_segment: row?.CardSegment ?? row?.card_segment ?? '',
      is_canceled: false,
      fighters: new Map(),
    };
    const fighterId = normalizeId(row?.FighterId ?? row?.fighter_id);
    if (fighterId) {
      fight.fighters.set(fighterId, {
        fighter_id: fighterId,
        fighter_name: formatFighterName(row),
        corner: String(row?.Corner || row?.corner || '').toLowerCase() || null,
      });
    }
    if (String(row?.FightStatus || row?.fight_status || '').toLowerCase() === 'canceled') {
      fight.is_canceled = true;
    }
    fights.set(fightId, fight);
  });

  return [...fights.values()].sort((a, b) => (
    a.fight_order - b.fight_order || normalizeNumber(a.fight_id) - normalizeNumber(b.fight_id)
  ));
}

function buildEventFriendComparison({
  event = {},
  viewerUserId,
  friendUserId = null,
  users = [],
  fightRows = [],
  predictions = [],
  predictionResults = [],
  fightResults = [],
} = {}) {
  const viewerId = normalizeId(viewerUserId);
  const requestedFriendId = normalizeId(friendUserId);
  const userLookups = buildUserLookups(users);
  const viewerUser = userLookups.byId.get(viewerId) || null;
  const fights = buildFightList(fightRows);
  const fightIds = new Set(fights.map((fight) => fight.fight_id));

  const predictionsByUserFight = new Map();
  const pickCountByUser = new Map();
  (predictions || []).forEach((prediction) => {
    const user = resolveUser(prediction, userLookups);
    const userId = normalizeId(user?.user_id);
    const fightId = normalizeId(prediction?.fight_id);
    if (!userId || !fightId || !fightIds.has(fightId)) return;

    predictionsByUserFight.set(`${userId}:${fightId}`, prediction);
    pickCountByUser.set(userId, (pickCountByUser.get(userId) || 0) + 1);
  });

  const friends = (users || [])
    .filter((user) => {
      const userId = normalizeId(user?.user_id);
      return userId && userId !== viewerId && !user?.is_bot && (pickCountByUser.get(userId) || 0) > 0;
    })
    .map((user) => toPerson(user, pickCountByUser.get(normalizeId(user.user_id)) || 0))
    .sort((a, b) => String(a.username).localeCompare(String(b.username)));
  const selectedFriend = requestedFriendId
    ? friends.find((friend) => friend.user_id === requestedFriendId) || null
    : friends[0] || null;

  const basePayload = {
    event: {
      event_id: normalizeId(event?.id ?? event?.event_id),
      name: event?.name || 'Event',
      date: event?.date || null,
      is_completed: Boolean(event?.is_completed),
    },
    viewer: toPerson(viewerUser, pickCountByUser.get(viewerId) || 0),
    friends,
    selected_friend: selectedFriend,
    summary: {
      agreements: 0,
      disagreements: 0,
      shared_picks: 0,
      visible_fights: 0,
      locked_fights: fights.length,
      remaining_sweats: 0,
      viewer_points: 0,
      friend_points: 0,
      points_edge: 0,
    },
    fights: [],
  };

  if (!viewerUser || !selectedFriend) return basePayload;

  const selectedFriendId = selectedFriend.user_id;
  const resultsByFight = new Map(
    (fightResults || []).map((result) => [normalizeId(result?.fight_id), result])
  );
  const pointsByUserFight = new Map();
  const totalsByUser = new Map();
  (predictionResults || []).forEach((result) => {
    const user = resolveUser(result, userLookups);
    const userId = normalizeId(user?.user_id);
    const fightId = normalizeId(result?.fight_id);
    if (!userId || !fightId || !fightIds.has(fightId)) return;
    const points = normalizeNumber(result?.points);
    pointsByUserFight.set(`${userId}:${fightId}`, {
      points,
      predicted_correctly: Boolean(result?.predicted_correctly),
    });
    totalsByUser.set(userId, (totalsByUser.get(userId) || 0) + points);
  });

  const toPick = (prediction, fight, userId, isCompleted, winnerId) => {
    if (!prediction) return null;
    const fighterId = normalizeId(prediction.fighter_id);
    const fighter = fight.fighters.get(fighterId);
    const result = pointsByUserFight.get(`${userId}:${fight.fight_id}`);
    return {
      fighter_id: fighterId,
      fighter_name: fighter?.fighter_name || 'Unknown fighter',
      corner: fighter?.corner || null,
      points: result?.points || 0,
      is_correct: isCompleted && winnerId
        ? fighterId === winnerId
        : null,
    };
  };

  const comparedFights = fights.map((fight) => {
    const viewerPrediction = predictionsByUserFight.get(`${viewerId}:${fight.fight_id}`) || null;
    const friendPrediction = predictionsByUserFight.get(`${selectedFriendId}:${fight.fight_id}`) || null;
    const result = resultsByFight.get(fight.fight_id) || null;
    const isCompleted = Boolean(result?.is_completed);
    const winnerId = isCompleted ? normalizeId(result?.fighter_id) : null;
    const isVisible = Boolean(viewerPrediction) || isCompleted;
    const viewerPick = toPick(viewerPrediction, fight, viewerId, isCompleted, winnerId);
    const friendPick = isVisible
      ? toPick(friendPrediction, fight, selectedFriendId, isCompleted, winnerId)
      : null;

    let comparisonState = 'locked';
    if (fight.is_canceled) comparisonState = 'canceled';
    else if (isVisible && viewerPick && friendPick) {
      comparisonState = viewerPick.fighter_id === friendPick.fighter_id ? 'agreement' : 'disagreement';
    } else if (isVisible && viewerPick && !friendPick) comparisonState = 'friend_missing';
    else if (isVisible && !viewerPick && friendPick) comparisonState = 'viewer_missing';
    else if (isVisible) comparisonState = 'no_picks';

    const winner = winnerId ? fight.fighters.get(winnerId) || null : null;
    return {
      fight_id: fight.fight_id,
      fight_order: fight.fight_order,
      card_segment: fight.card_segment,
      matchup: [...fight.fighters.values()],
      is_completed: isCompleted,
      is_canceled: fight.is_canceled,
      is_visible: isVisible,
      comparison_state: comparisonState,
      is_sweat: comparisonState === 'disagreement' && !isCompleted && !fight.is_canceled,
      winner,
      viewer_pick: viewerPick,
      friend_pick: friendPick,
    };
  });

  const agreements = comparedFights.filter((fight) => fight.comparison_state === 'agreement').length;
  const disagreements = comparedFights.filter((fight) => fight.comparison_state === 'disagreement').length;
  const visibleFights = comparedFights.filter((fight) => fight.is_visible).length;
  const viewerPoints = totalsByUser.get(viewerId) || 0;
  const friendPoints = totalsByUser.get(selectedFriendId) || 0;

  return {
    ...basePayload,
    summary: {
      agreements,
      disagreements,
      shared_picks: agreements + disagreements,
      visible_fights: visibleFights,
      locked_fights: Math.max(fights.length - visibleFights, 0),
      remaining_sweats: comparedFights.filter((fight) => fight.is_sweat).length,
      viewer_points: viewerPoints,
      friend_points: friendPoints,
      points_edge: viewerPoints - friendPoints,
    },
    fights: comparedFights,
  };
}

module.exports = {
  buildEventFriendComparison,
  buildFightList,
  normalizeId,
};
