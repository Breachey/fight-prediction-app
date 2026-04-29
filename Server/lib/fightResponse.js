const STANDARD_WEIGHT_LIMITS = {
  flyweight: 125,
  bantamweight: 135,
  featherweight: 145,
  lightweight: 155,
  welterweight: 170,
  middleweight: 185,
  lightheavyweight: 205,
  heavyweight: 265,
  womensatomweight: 105,
  womensstrawweight: 115,
  womensflyweight: 125,
  womensbantamweight: 135,
  womensfeatherweight: 145,
};

function normalizeWeightclass(value) {
  return (value || '').toString().toLowerCase().replace(/[^a-z]/g, '');
}

function buildWeightclassMap(weightclasses = []) {
  const weightclassMap = new Map();

  weightclasses.forEach((weightclass) => {
    const normalizedKey = normalizeWeightclass(weightclass?.official_weightclass);
    if (!normalizedKey) {
      return;
    }

    weightclassMap.set(normalizedKey, {
      gay_weightclass: weightclass.gay_weightclass,
      official_weightclass: weightclass.official_weightclass,
      weight_lbs: weightclass.weight_lbs || STANDARD_WEIGHT_LIMITS[normalizedKey] || null,
    });
  });

  return weightclassMap;
}

function normalizeCardTier(cardTier) {
  if (cardTier === 'Prelims1') {
    return 'Prelims';
  }

  if (cardTier === 'Prelims2') {
    return 'Early Prelims';
  }

  return cardTier;
}

function resolveWeightclass(weightclassMap, rawWeightclass, rawWeightLbs) {
  const mapped = weightclassMap?.get(normalizeWeightclass(rawWeightclass));

  if (!mapped || typeof mapped !== 'object') {
    return {
      weightclass: rawWeightclass,
      weightclass_official: rawWeightclass,
      weightclass_lbs: rawWeightLbs || null,
    };
  }

  return {
    weightclass: mapped.gay_weightclass || mapped.official_weightclass || rawWeightclass,
    weightclass_official: mapped.official_weightclass || rawWeightclass,
    weightclass_lbs: mapped.weight_lbs || rawWeightLbs || null,
  };
}

function formatRecord(fighter) {
  const wins = fighter?.Record_Wins ?? 0;
  const losses = fighter?.Record_Losses ?? 0;
  const draws = Number(fighter?.Record_Draws) > 0 ? `-${fighter.Record_Draws}` : '';
  const noContests = Number(fighter?.Record_NoContests) > 0 ? ` (${fighter.Record_NoContests}NC)` : '';
  return `${wins}-${losses}${draws}${noContests}`;
}

function formatOdds(odds) {
  if (odds === null || odds === undefined) {
    return null;
  }

  const oddsNumber = Number.parseInt(odds, 10);
  return oddsNumber > 0 ? `+${odds}` : odds;
}

function transformFighterData(fighter) {
  return {
    id: fighter?.FighterId,
    name: `${fighter?.FirstName || ''} ${fighter?.LastName || ''}`.trim(),
    firstName: fighter?.FirstName,
    lastName: fighter?.LastName,
    nickname: fighter?.Nickname || null,
    record: formatRecord(fighter),
    stance: fighter?.Stance || 'N/A',
    style: fighter?.Style || fighter?.style || 'N/A',
    image: fighter?.ImageURL,
    rank: fighter?.Rank !== undefined && fighter?.Rank !== null ? fighter.Rank : null,
    odds: formatOdds(fighter?.odds),
    country: fighter?.FightingOutOf_Country || 'N/A',
    age: fighter?.Age !== undefined ? fighter.Age : null,
    weight: fighter?.Weight_lbs || null,
    height: fighter?.Height_in || null,
    reach: fighter?.Reach_in || null,
    streak: fighter?.Streak,
    koTkoWins: fighter?.KO_TKO_Wins ?? null,
    koTkoLosses: fighter?.KO_TKO_Losses ?? null,
    submissionWins: fighter?.Submission_Wins ?? null,
    submissionLosses: fighter?.Submission_Losses ?? null,
    decisionWins: fighter?.Decision_Wins ?? null,
    decisionLosses: fighter?.Decision_Losses ?? null,
  };
}

function buildFightStructureData(fighter) {
  const roundsValue = Number(fighter?.PossibleRounds);
  const titleFightName = typeof fighter?.TitleFightName === 'string'
    ? fighter.TitleFightName.trim()
    : '';

  return {
    scheduled_rounds: Number.isFinite(roundsValue) ? roundsValue : null,
    is_title_fight: fighter?.IsTitleFight === true || fighter?.IsTitleFight === 'true',
    title_fight_name: titleFightName || null,
  };
}

function resolveFightResult(result) {
  if (result && typeof result === 'object') {
    const winner = Object.prototype.hasOwnProperty.call(result, 'winner')
      ? result.winner
      : result.fighter_id;

    return {
      winner: winner || null,
      is_completed: result.is_completed ?? Boolean(winner),
    };
  }

  return {
    winner: result || null,
    is_completed: Boolean(result),
  };
}

function buildFightResponse({
  fightId,
  eventId,
  eventDate = null,
  redFighter,
  blueFighter,
  result = null,
  weightclassMap = new Map(),
  overrides = {},
}) {
  const red = transformFighterData(redFighter);
  const blue = transformFighterData(blueFighter);
  const resolvedResult = resolveFightResult(result);
  const weightclass = resolveWeightclass(
    weightclassMap,
    redFighter?.FighterWeightClass,
    redFighter?.Weight_lbs
  );
  const fightStatus = redFighter?.FightStatus || blueFighter?.FightStatus || 'Scheduled';

  const response = {
    id: fightId,
    event_id: eventId,
    fighter1_id: red.id,
    fighter1_name: red.name,
    fighter1_firstName: red.firstName,
    fighter1_lastName: red.lastName,
    fighter1_nickname: red.nickname,
    fighter1_record: red.record,
    fighter1_height: red.height,
    fighter1_weight: red.weight,
    fighter1_reach: red.reach,
    fighter1_stance: red.stance,
    fighter1_style: red.style,
    fighter1_image: red.image,
    fighter1_country: red.country,
    fighter1_age: red.age,
    fighter1_rank: red.rank,
    fighter1_odds: red.odds,
    fighter1_streak: red.streak,
    fighter1_ko_tko_wins: red.koTkoWins,
    fighter1_ko_tko_losses: red.koTkoLosses,
    fighter1_submission_wins: red.submissionWins,
    fighter1_submission_losses: red.submissionLosses,
    fighter1_decision_wins: red.decisionWins,
    fighter1_decision_losses: red.decisionLosses,
    fighter2_id: blue.id,
    fighter2_name: blue.name,
    fighter2_firstName: blue.firstName,
    fighter2_lastName: blue.lastName,
    fighter2_nickname: blue.nickname,
    fighter2_record: blue.record,
    fighter2_height: blue.height,
    fighter2_weight: blue.weight,
    fighter2_reach: blue.reach,
    fighter2_stance: blue.stance,
    fighter2_style: blue.style,
    fighter2_image: blue.image,
    fighter2_country: blue.country,
    fighter2_age: blue.age,
    fighter2_rank: blue.rank,
    fighter2_odds: blue.odds,
    fighter2_streak: blue.streak,
    fighter2_ko_tko_wins: blue.koTkoWins,
    fighter2_ko_tko_losses: blue.koTkoLosses,
    fighter2_submission_wins: blue.submissionWins,
    fighter2_submission_losses: blue.submissionLosses,
    fighter2_decision_wins: blue.decisionWins,
    fighter2_decision_losses: blue.decisionLosses,
    winner: resolvedResult.winner,
    is_completed: resolvedResult.is_completed,
    is_canceled: redFighter?.FightStatus === 'Canceled' || blueFighter?.FightStatus === 'Canceled',
    fight_status: fightStatus,
    card_tier: normalizeCardTier(redFighter?.CardSegment),
    ...weightclass,
    bout_order: redFighter?.FightOrder,
    ...buildFightStructureData(redFighter),
  };

  if (eventDate !== null && eventDate !== undefined) {
    response.event_date = eventDate;
  }

  return {
    ...response,
    ...overrides,
  };
}

module.exports = {
  buildFightResponse,
  buildFightStructureData,
  buildWeightclassMap,
  normalizeCardTier,
  normalizeWeightclass,
  resolveWeightclass,
  transformFighterData,
};
