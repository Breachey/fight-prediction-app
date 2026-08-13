export function shouldPollEventLeaderboard({ selectedLeaderboard, isEventComplete, visibilityState }) {
  return selectedLeaderboard === 'event'
    && !isEventComplete
    && visibilityState === 'visible';
}
