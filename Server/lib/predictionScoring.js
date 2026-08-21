function calculatePredictionPointsFromOdds(odds) {
  if (odds === undefined || odds === null) return 1;

  const numericOdds = Number(odds);
  if (!Number.isFinite(numericOdds) || numericOdds === 0) return 1;

  return numericOdds > 0
    ? Math.ceil((numericOdds / 100) + 1)
    : Math.ceil((100 / Math.abs(numericOdds)) + 1);
}

function scorePredictionOutcome({ resultType, winnerId, predictionFighterId, bettingOdds }) {
  const predictedCorrectly = resultType === 'winner'
    && winnerId !== null
    && winnerId !== undefined
    && String(predictionFighterId) === String(winnerId);

  return {
    predictedCorrectly,
    points: predictedCorrectly ? calculatePredictionPointsFromOdds(bettingOdds) : 0,
  };
}

module.exports = {
  calculatePredictionPointsFromOdds,
  scorePredictionOutcome,
};
