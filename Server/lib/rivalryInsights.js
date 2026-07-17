const DEFAULT_CONFIDENCE_Z = 1.96;
const MINIMUM_GLOBAL_SAMPLE = 3;
const MINIMUM_MATURE_SAMPLE = 6;
const MAXIMUM_DYNAMIC_SAMPLE = 25;
const DYNAMIC_SAMPLE_RATIO = 0.1;

function roundTo(value, decimals = 2) {
  return Number((Number(value || 0)).toFixed(decimals));
}

function normalizeCount(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.floor(numberValue)
    : 0;
}

function calculateDynamicMinimumSample(totalComparableFights) {
  const total = normalizeCount(totalComparableFights);
  if (total === 0) {
    return MINIMUM_GLOBAL_SAMPLE;
  }
  if (total < MINIMUM_GLOBAL_SAMPLE) {
    return MINIMUM_GLOBAL_SAMPLE;
  }

  const dynamicMinimum = Math.max(
    MINIMUM_MATURE_SAMPLE,
    Math.ceil(total * DYNAMIC_SAMPLE_RATIO)
  );

  return Math.min(total, MAXIMUM_DYNAMIC_SAMPLE, dynamicMinimum);
}

function wilsonLowerBound(successes, trials, z = DEFAULT_CONFIDENCE_Z) {
  const successCount = normalizeCount(successes);
  const trialCount = normalizeCount(trials);
  if (trialCount === 0 || successCount === 0) {
    return 0;
  }

  const cappedSuccesses = Math.min(successCount, trialCount);
  const proportion = cappedSuccesses / trialCount;
  const zSquared = z * z;
  const denominator = 1 + (zSquared / trialCount);
  const centre = proportion + (zSquared / (2 * trialCount));
  const margin = z * Math.sqrt(
    ((proportion * (1 - proportion)) + (zSquared / (4 * trialCount))) / trialCount
  );

  return Math.max(0, (centre - margin) / denominator);
}

function compareByUsername(a, b) {
  return String(a?.username || '').localeCompare(String(b?.username || ''));
}

function buildRivalryRankings(rivalryRows, {
  totalUserPickFights = 0,
  totalUserResultFights = 0,
} = {}) {
  const pickTwinMinimumSharedPicks = calculateDynamicMinimumSample(totalUserPickFights);
  const nemesisMinimumSharedFights = calculateDynamicMinimumSample(totalUserResultFights);
  const nemesisMinimumSwingFights = Math.max(3, Math.ceil(nemesisMinimumSharedFights * 0.25));

  const enrichedRows = (rivalryRows || [])
    .map((item) => {
      const sharedFights = normalizeCount(item.shared_fights);
      const sharedPickFights = normalizeCount(item.shared_pick_fights);
      const samePicks = Math.min(normalizeCount(item.same_picks), sharedPickFights);
      const theyRightYouWrong = normalizeCount(item.they_right_you_wrong);
      const youRightTheyWrong = normalizeCount(item.you_right_they_wrong);
      const decisiveSwingFights = theyRightYouWrong + youRightTheyWrong;
      const nemesisEdge = theyRightYouWrong - youRightTheyWrong;
      const pickOverlapPct = sharedPickFights > 0
        ? roundTo((samePicks / sharedPickFights) * 100, 2)
        : 0;
      const pickTwinScore = sharedPickFights >= pickTwinMinimumSharedPicks
        ? roundTo(wilsonLowerBound(samePicks, sharedPickFights) * 100, 2)
        : 0;
      const nemesisScore = (
        sharedFights >= nemesisMinimumSharedFights &&
        decisiveSwingFights >= nemesisMinimumSwingFights &&
        nemesisEdge > 0
      )
        ? roundTo(wilsonLowerBound(theyRightYouWrong, decisiveSwingFights) * 100, 2)
        : 0;

      return {
        ...item,
        shared_fights: sharedFights,
        they_right_you_wrong: theyRightYouWrong,
        you_right_they_wrong: youRightTheyWrong,
        same_picks: samePicks,
        shared_pick_fights: sharedPickFights,
        net_edge: youRightTheyWrong - theyRightYouWrong,
        pick_overlap_pct: pickOverlapPct,
        pick_twin_score: pickTwinScore,
        nemesis_score: nemesisScore,
        nemesis_edge: nemesisEdge,
        decisive_swing_fights: decisiveSwingFights,
        nemesis_swing_pct: decisiveSwingFights > 0
          ? roundTo((theyRightYouWrong / decisiveSwingFights) * 100, 2)
          : 0,
      };
    })
    .filter(item => item.shared_fights > 0 || item.shared_pick_fights > 0);

  const biggestNemesis = [...enrichedRows]
    .filter(item =>
      item.shared_fights >= nemesisMinimumSharedFights &&
      item.decisive_swing_fights >= nemesisMinimumSwingFights &&
      item.nemesis_edge > 0
    )
    .sort((a, b) =>
      b.nemesis_score - a.nemesis_score ||
      b.nemesis_edge - a.nemesis_edge ||
      b.nemesis_swing_pct - a.nemesis_swing_pct ||
      b.decisive_swing_fights - a.decisive_swing_fights ||
      b.shared_fights - a.shared_fights ||
      compareByUsername(a, b)
    )[0] || null;

  const headToHead = [...enrichedRows].sort((a, b) =>
    b.shared_fights - a.shared_fights ||
    Math.abs(b.net_edge) - Math.abs(a.net_edge) ||
    compareByUsername(a, b)
  )[0] || null;

  const pickTwin = [...enrichedRows]
    .filter(item => item.shared_pick_fights >= pickTwinMinimumSharedPicks)
    .sort((a, b) =>
      b.pick_twin_score - a.pick_twin_score ||
      b.pick_overlap_pct - a.pick_overlap_pct ||
      b.shared_pick_fights - a.shared_pick_fights ||
      b.same_picks - a.same_picks ||
      compareByUsername(a, b)
    )[0] || null;

  return {
    biggestNemesis,
    headToHead,
    pickTwin,
    rivalryRows: enrichedRows,
    sampleRequirements: {
      pick_twin_min_shared_picks: pickTwinMinimumSharedPicks,
      nemesis_min_shared_fights: nemesisMinimumSharedFights,
      nemesis_min_swing_fights: nemesisMinimumSwingFights,
    },
  };
}

module.exports = {
  buildRivalryRankings,
  calculateDynamicMinimumSample,
  wilsonLowerBound,
};
