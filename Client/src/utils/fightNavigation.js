function isOpenFight(fight) {
  return Boolean(fight) && !fight.is_canceled && !fight.is_completed;
}

function hasSubmittedPick(submittedPicks, fightId) {
  return Boolean(submittedPicks?.[fightId] || submittedPicks?.[String(fightId)]);
}

export function getNextUnvotedFightId(fights, submittedPicks = {}) {
  const nextFight = [...(fights || [])]
    .reverse()
    .find((fight) => isOpenFight(fight) && !hasSubmittedPick(submittedPicks, fight.id));

  return nextFight?.id ?? null;
}

export function getInitialFightTargetId(fights, submittedPicks = {}) {
  const nextUnvotedFightId = getNextUnvotedFightId(fights, submittedPicks);
  if (nextUnvotedFightId !== null) {
    return nextUnvotedFightId;
  }

  const hasCompletedFight = (fights || []).some((fight) => !fight.is_canceled && fight.is_completed);
  if (!hasCompletedFight) {
    return null;
  }

  const nextOpenFight = [...(fights || [])].reverse().find(isOpenFight);
  return nextOpenFight?.id ?? null;
}
