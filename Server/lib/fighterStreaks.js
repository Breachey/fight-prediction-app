const VERIFIED_STREAK_SOURCES = new Set(['manual', 'tapology_live', 'sherdog_live', 'fight_results']);
const ANCHOR_STREAK_SOURCES = new Set(['manual', 'tapology_live', 'sherdog_live']);

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = String(value).trim();
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRecordInteger(value) {
  const parsed = normalizeInteger(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toDateOnly(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function previousDate(value) {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) {
    return null;
  }

  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0];
}

function nextStreak(currentStreak, outcome) {
  const baseline = Number.isFinite(currentStreak) ? currentStreak : 0;
  if (outcome === 'win') {
    return baseline > 0 ? baseline + 1 : 1;
  }
  if (outcome === 'loss') {
    return baseline < 0 ? baseline - 1 : -1;
  }
  return baseline;
}

function isVerifiedStreakProfile(profile) {
  const source = String(profile?.streak_source || '').trim().toLowerCase();
  return VERIFIED_STREAK_SOURCES.has(source)
    && Boolean(profile?.streak_verified_at)
    && profile?.streak_needs_review !== true
    && Number.isFinite(normalizeInteger(profile?.streak));
}

function buildStreakAnchorPayload({
  row,
  streak,
  source,
  eventId,
  eventDate,
  fightCompleted = false,
  verifiedAt = new Date().toISOString(),
}) {
  const normalizedSource = String(source || '').trim().toLowerCase();
  if (!ANCHOR_STREAK_SOURCES.has(normalizedSource)) {
    throw new Error(`Unsupported streak anchor source: ${source}`);
  }

  const normalizedStreak = normalizeInteger(streak);
  if (!Number.isFinite(normalizedStreak)) {
    throw new Error('Streak must be a signed whole number');
  }

  const normalizedEventDate = toDateOnly(eventDate || row?.StartTime);
  const throughDate = fightCompleted
    ? normalizedEventDate
    : previousDate(normalizedEventDate);
  const recordWins = normalizeRecordInteger(row?.Record_Wins);
  const recordLosses = normalizeRecordInteger(row?.Record_Losses);

  return {
    streak: normalizedStreak,
    streak_source: normalizedSource,
    streak_anchor_source: normalizedSource,
    streak_verified_at: verifiedAt,
    streak_anchor_value: normalizedStreak,
    streak_anchor_record_wins: recordWins,
    streak_anchor_record_losses: recordLosses,
    streak_anchor_event_id: Number.isFinite(Number(eventId)) ? Number(eventId) : null,
    streak_anchor_through_date: throughDate,
    streak_record_wins: recordWins,
    streak_record_losses: recordLosses,
    streak_verified_through_date: throughDate,
    streak_needs_review: false,
  };
}

function replayStreakFromAnchor(profile, resultRows) {
  const anchorValue = normalizeInteger(profile?.streak_anchor_value);
  if (!Number.isFinite(anchorValue) || !profile?.streak_verified_at) {
    return { ok: false, reason: 'No verified streak anchor' };
  }

  const anchorThroughDate = toDateOnly(profile.streak_anchor_through_date);
  const orderedRows = [...(resultRows || [])]
    .filter((row) => {
      const eventDate = toDateOnly(row?.event_date);
      return eventDate && (!anchorThroughDate || eventDate > anchorThroughDate);
    })
    .sort((left, right) => (
      String(left.event_date).localeCompare(String(right.event_date))
      || Number(left.event_id) - Number(right.event_id)
      || Number(left.fight_id) - Number(right.fight_id)
    ));

  let streak = anchorValue;
  let recordWins = normalizeRecordInteger(profile.streak_anchor_record_wins);
  let recordLosses = normalizeRecordInteger(profile.streak_anchor_record_losses);
  let verifiedThroughDate = anchorThroughDate;

  for (const row of orderedRows) {
    if (!['win', 'loss'].includes(row.outcome)) {
      continue;
    }

    streak = nextStreak(streak, row.outcome);
    if (row.outcome === 'win' && recordWins !== null) {
      recordWins += 1;
    }
    if (row.outcome === 'loss' && recordLosses !== null) {
      recordLosses += 1;
    }
    verifiedThroughDate = toDateOnly(row.event_date) || verifiedThroughDate;
  }

  return {
    ok: true,
    streak,
    recordWins,
    recordLosses,
    verifiedThroughDate,
    appliedResultCount: orderedRows.length,
  };
}

function streakRecordMatches(profile, recordWins, recordLosses) {
  const expectedWins = normalizeRecordInteger(profile?.streak_record_wins);
  const expectedLosses = normalizeRecordInteger(profile?.streak_record_losses);
  const actualWins = normalizeRecordInteger(recordWins);
  const actualLosses = normalizeRecordInteger(recordLosses);

  if ([expectedWins, expectedLosses, actualWins, actualLosses].some((value) => value === null)) {
    return null;
  }

  return expectedWins === actualWins && expectedLosses === actualLosses;
}

module.exports = {
  ANCHOR_STREAK_SOURCES,
  VERIFIED_STREAK_SOURCES,
  buildStreakAnchorPayload,
  isVerifiedStreakProfile,
  nextStreak,
  normalizeInteger,
  replayStreakFromAnchor,
  streakRecordMatches,
  toDateOnly,
};
