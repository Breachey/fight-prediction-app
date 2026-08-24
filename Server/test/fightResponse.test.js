const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildFightResponse,
  buildWeightclassMap,
  normalizeCardTier,
  resolveWeightclass,
  transformFighterData,
} = require('../lib/fightResponse');

const redFighter = {
  FightId: 123,
  EventId: 99,
  Corner: 'Red',
  FighterId: 1,
  FirstName: 'Red',
  LastName: 'Fighter',
  Nickname: 'Ace',
  Record_Wins: 12,
  Record_Losses: 3,
  Record_Draws: 1,
  Record_NoContests: 1,
  Stance: 'Orthodox',
  style: 'Kickboxing',
  ImageURL: 'red.png',
  Rank: 4,
  odds: 150,
  FightingOutOf_Country: 'USA',
  FightingOutOf_City: 'Albuquerque',
  FightingOutOf_State: 'New Mexico',
  Born_City: 'Kingston',
  Born_State: null,
  Born_Country: 'Jamaica',
  Age: 30,
  Weight_lbs: 155,
  Height_in: 70,
  Reach_in: 72,
  KO_TKO_Wins: 4,
  KO_TKO_Losses: 1,
  Submission_Wins: 2,
  Submission_Losses: 0,
  Decision_Wins: 6,
  Decision_Losses: 2,
  SigStrLandedPerMin: 4.41,
  SigStrAbsorbedPerMin: 3.4,
  SigStrikeAccuracyPct: 43,
  SigStrikeDefensePct: 59,
  TakedownAvgPer15: 0.71,
  TakedownAccuracyPct: 10,
  TakedownDefensePct: 80,
  SubmissionAvgPer15: 0,
  KnockdownAvgPer15: 0.53,
  AverageFightTimeSeconds: 811,
  RecentForm: 'W,L,W,W,L',
  LastFightDate: '2026-07-11',
  CardSegment: 'Prelims1',
  FighterWeightClass: 'Lightweight',
  FightOrder: 3,
  FightStatus: 'Upcoming',
  PossibleRounds: '5',
  Referee_FirstName: 'Jason',
  Referee_LastName: 'Herzog',
  IsTitleFight: 'true',
  TitleFightName: 'Interim Belt',
};

const blueFighter = {
  ...redFighter,
  Corner: 'Blue',
  FighterId: 2,
  FirstName: 'Blue',
  LastName: 'Fighter',
  Nickname: '',
  Style: 'Wrestling',
  style: undefined,
  Rank: 16,
  odds: -175,
};

test('normalizeCardTier maps stored prelim segment names', () => {
  assert.equal(normalizeCardTier('Prelims1'), 'Prelims');
  assert.equal(normalizeCardTier('Prelims2'), 'Early Prelims');
  assert.equal(normalizeCardTier('Main'), 'Main');
});

test('resolveWeightclass returns display, official, and fallback weight values', () => {
  const weightclassMap = buildWeightclassMap([
    { official_weightclass: 'Lightweight', gay_weightclass: 'Lightweight Bangers', weight_lbs: null },
  ]);

  assert.deepEqual(resolveWeightclass(weightclassMap, 'Lightweight', 156), {
    weightclass: 'Lightweight Bangers',
    weightclass_official: 'Lightweight',
    weightclass_lbs: 155,
  });

  assert.deepEqual(resolveWeightclass(weightclassMap, 'Catchweight', 160), {
    weightclass: 'Catchweight',
    weightclass_official: 'Catchweight',
    weightclass_lbs: 160,
  });
});

test('transformFighterData supports both style casings and formats positive odds', () => {
  const red = transformFighterData(redFighter);
  const blue = transformFighterData(blueFighter);

  assert.equal(red.style, 'Kickboxing');
  assert.equal(blue.style, 'Wrestling');
  assert.equal(red.odds, '+150');
  assert.equal(blue.odds, -175);
});

test('buildFightResponse keeps fight metadata and title round fields', () => {
  const weightclassMap = buildWeightclassMap([
    { official_weightclass: 'Lightweight', gay_weightclass: 'Lightweight Bangers', weight_lbs: 155 },
  ]);

  const response = buildFightResponse({
    fightId: 123,
    eventId: 99,
    eventDate: '2026-03-28',
    redFighter,
    blueFighter,
    result: { fighter_id: 2, is_completed: true },
    weightclassMap,
  });

  assert.equal(response.id, 123);
  assert.equal(response.event_id, 99);
  assert.equal(response.event_date, '2026-03-28');
  assert.equal(response.fighter1_record, '12-3-1 (1NC)');
  assert.equal(response.fighter1_style, 'Kickboxing');
  assert.equal(response.fighter1_country, 'USA');
  assert.equal(response.fighter1_fighting_out_of_city, 'Albuquerque');
  assert.equal(response.fighter1_fighting_out_of_state, 'New Mexico');
  assert.equal(response.fighter1_fighting_out_of_country, 'USA');
  assert.equal(response.fighter1_born_city, 'Kingston');
  assert.equal(response.fighter1_born_state, null);
  assert.equal(response.fighter1_born_country, 'Jamaica');
  assert.equal(response.fighter1_sig_str_landed_per_min, 4.41);
  assert.equal(response.fighter1_sig_strike_defense_pct, 59);
  assert.equal(response.fighter1_takedown_defense_pct, 80);
  assert.equal(response.fighter1_average_fight_time_seconds, 811);
  assert.equal(response.fighter1_recent_form, 'W,L,W,W,L');
  assert.equal(response.fighter1_last_fight_date, '2026-07-11');
  assert.equal(response.fighter2_style, 'Wrestling');
  assert.equal(response.winner, 2);
  assert.equal(response.is_completed, true);
  assert.equal(response.result_type, 'winner');
  assert.equal(response.card_tier, 'Prelims');
  assert.equal(response.weightclass, 'Lightweight Bangers');
  assert.equal(response.scheduled_rounds, 5);
  assert.equal(response.referee, 'Jason Herzog');
  assert.equal(response.is_title_fight, true);
  assert.equal(response.title_fight_name, 'Interim Belt');
});

test('buildFightResponse omits an unassigned referee and falls back to birth country', () => {
  const fighterWithoutAssignment = {
    ...redFighter,
    FightingOutOf_Country: null,
    Referee_FirstName: null,
    Referee_LastName: null,
  };
  const response = buildFightResponse({
    fightId: 123,
    eventId: 99,
    redFighter: fighterWithoutAssignment,
    blueFighter,
  });

  assert.equal(response.fighter1_country, 'Jamaica');
  assert.equal(response.referee, null);
});

test('buildFightResponse preserves completed neutral outcomes without a winner', () => {
  const response = buildFightResponse({
    fightId: 123,
    eventId: 99,
    redFighter,
    blueFighter,
    result: { fighter_id: null, is_completed: true, result_type: 'no_contest' },
  });

  assert.equal(response.winner, null);
  assert.equal(response.is_completed, true);
  assert.equal(response.result_type, 'no_contest');
});
