export function shouldPollEventLeaderboard({ selectedLeaderboard, isEventComplete, visibilityState }) {
  return selectedLeaderboard === 'event'
    && !isEventComplete
    && visibilityState === 'visible';
}

export function shouldPollFightCard({ isEventComplete, allFightsResolved, visibilityState }) {
  return !isEventComplete
    && !allFightsResolved
    && visibilityState === 'visible';
}

function normalizeFightCardForComparison(fights) {
  return (Array.isArray(fights) ? fights : []).map((fight) => ({
    ...fight,
    id: fight?.id == null ? null : String(fight.id),
    event_id: fight?.event_id == null ? null : String(fight.event_id),
    fighter1_id: fight?.fighter1_id == null ? null : String(fight.fighter1_id),
    fighter2_id: fight?.fighter2_id == null ? null : String(fight.fighter2_id),
    winner: fight?.winner == null ? null : String(fight.winner),
  }));
}

export function haveFightCardsChanged(currentFights, incomingFights) {
  return JSON.stringify(normalizeFightCardForComparison(currentFights))
    !== JSON.stringify(normalizeFightCardForComparison(incomingFights));
}

export function haveFightResultsChanged(currentFights, incomingFights) {
  const resultState = (fights) => (Array.isArray(fights) ? fights : []).map((fight) => ({
    id: String(fight?.id ?? ''),
    winner: fight?.winner == null ? null : String(fight.winner),
    is_completed: Boolean(fight?.is_completed),
    is_canceled: Boolean(fight?.is_canceled),
  }));

  return JSON.stringify(resultState(currentFights)) !== JSON.stringify(resultState(incomingFights));
}
