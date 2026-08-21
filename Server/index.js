const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();
const {
  createRequireAdminSession,
  issueAdminSession,
  readBearerToken,
  revokeAdminSession,
  revokeAdminSessionsForUser,
} = require('./lib/adminSessionAuth');
const {
  createRequireUserSession,
  issueUserSession,
  readBearerToken: readUserBearerToken,
  requireOwnUserParam,
  revokeUserSession,
} = require('./lib/userSessionAuth');
const {
  writeAdminAuditLog,
} = require('./lib/adminAuditLog');
const {
  syncFighterStyleFromFightCardRows,
} = require('./lib/fighterStyleSync');
const {
  buildStreakAnchorPayload,
  isVerifiedStreakProfile,
  replayStreakFromAnchor,
  streakRecordMatches,
  toDateOnly,
} = require('./lib/fighterStreaks');
const {
  buildFightResponse,
  buildWeightclassMap,
  normalizeWeightclass,
} = require('./lib/fightResponse');
const {
  buildRivalryRankings,
} = require('./lib/rivalryInsights');
const {
  buildPropPixNotificationRecipients,
  normalizeOutcome,
  normalizePropPixInput,
  normalizePropPixVote,
} = require('./lib/propPix');
const { createNotifications } = require('./lib/notifications');
const { buildPicksContextPayload } = require('./lib/picksContext');
const { buildEventRecap } = require('./lib/eventRecap');
const { buildEventFriendComparison } = require('./lib/eventFriendComparison');
const { randomAvatarConfig, validateAvatarConfig } = require('./lib/avatarConfig');
const {
  addFightToFightRankChanges,
  findLatestCompletedFightId,
} = require('./lib/eventLeaderboardDeltas');
const { scorePredictionOutcome } = require('./lib/predictionScoring');
const {
  runUfcEventDiscovery,
} = require('./lib/ufcEventDiscovery');
const {
  backfillEventImageIfMissing,
  buildImportedFightCardEditorPreview,
  buildFightCardPreviewRowKey,
  buildOddsRefreshPlan,
  buildFightCardPreview,
  cleanupExpiredFightCardPreviews,
  getFightCardPreview,
  applyManualFightCardPreviewUpdates,
  markFightCardPreviewImported,
  parseFightCardCsvFile,
  replaceFightCardPreview,
  removePreviewAssets,
  refreshTapologyCacheForEvent,
  runFightCardScraper,
  runEventOddsScraper,
  saveFightCardPreviewProgress,
} = require('./lib/fightCardImport');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing required Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

// All server-side queries use service-role credentials.
const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);
const requireAdminSession = createRequireAdminSession(supabase);
const requireUserSession = createRequireUserSession(supabase);
const requireOwnUserId = requireOwnUserParam('user_id');

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const app = express();
const PORT = process.env.PORT || 3001;
const REPO_ROOT = path.resolve(__dirname, '..');
const RATE_LIMIT_STORE = new Map();
const SHOULD_RUN_STARTUP_SUPABASE_CHECK = process.env.STARTUP_SUPABASE_CHECK
  ? normalizeBooleanFlag(process.env.STARTUP_SUPABASE_CHECK)
  : process.env.NODE_ENV === 'production';
const SHOULD_LOG_VERBOSE_STARTUP_SUPABASE_CHECK = normalizeBooleanFlag(
  process.env.STARTUP_SUPABASE_CHECK_VERBOSE
);
const SHOULD_LOG_DEBUG = normalizeBooleanFlag(process.env.DEBUG_SERVER_LOGS);
const ENABLE_LEGACY_ADMIN_MIGRATION_ROUTES = normalizeBooleanFlag(
  process.env.ENABLE_LEGACY_ADMIN_MIGRATION_ROUTES
);

// Enable gzip compression
app.use(compression());
app.set('trust proxy', 1);
app.disable('x-powered-by');

function parsePositiveIntegerEnv(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function debugLog(...args) {
  if (SHOULD_LOG_DEBUG) {
    console.log(...args);
  }
}

function requireLegacyAdminMigrationRoutes(req, res, next) {
  if (!ENABLE_LEGACY_ADMIN_MIGRATION_ROUTES) {
    return res.status(404).json({ error: 'Not found' });
  }

  return next();
}

function getClientIp(req) {
  if (typeof req?.ip === 'string' && req.ip.trim()) {
    return req.ip.trim();
  }

  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return 'unknown';
}

function pruneRateLimitStore(now = Date.now()) {
  for (const [key, entry] of RATE_LIMIT_STORE.entries()) {
    if (!entry || entry.expiresAt <= now) {
      RATE_LIMIT_STORE.delete(key);
    }
  }
}

function createRateLimitMiddleware({
  windowMs,
  max,
  keyPrefix,
  message,
  resolveKey,
}) {
  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();

    if (RATE_LIMIT_STORE.size >= 10000) {
      pruneRateLimitStore(now);
    }

    const resolvedKey = typeof resolveKey === 'function'
      ? resolveKey(req)
      : getClientIp(req);
    const cacheKey = `${keyPrefix}:${resolvedKey || 'unknown'}`;
    const existingEntry = RATE_LIMIT_STORE.get(cacheKey);

    if (!existingEntry || existingEntry.expiresAt <= now) {
      RATE_LIMIT_STORE.set(cacheKey, {
        count: 1,
        expiresAt: now + windowMs,
      });
      return next();
    }

    if (existingEntry.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existingEntry.expiresAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: message });
    }

    existingEntry.count += 1;
    RATE_LIMIT_STORE.set(cacheKey, existingEntry);
    return next();
  };
}

function setSecurityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

  const forwardedProto = req.get('x-forwarded-proto');
  if (req.secure || forwardedProto === 'https') {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

app.use(setSecurityHeaders);

// Enable CORS for all routes
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://fytpix.com',
      'https://www.fytpix.com',
      'https://fight-prediction-app.vercel.app',
      'https://fight-prediction-app-git-breachey-brandons-projects-a1d75233.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173'
    ];
    const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const allAllowedOrigins = [...new Set([...allowedOrigins, ...configuredOrigins])];

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow any localhost port for local dev (Vite can pick random ports)
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }

    if (allAllowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      debugLog('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(express.json({
  limit: process.env.JSON_BODY_LIMIT || '16kb',
}));
app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }

  return next(error);
});

const DEFAULT_IMAGE_PROXY_ALLOWED_HOSTS = ['images.tapology.com'];
const IMAGE_PROXY_ALLOWED_HOSTS = (process.env.IMAGE_PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
const IMAGE_PROXY_MAX_BYTES = parsePositiveIntegerEnv(
  process.env.IMAGE_PROXY_MAX_BYTES,
  5 * 1024 * 1024
);
const IMAGE_PROXY_MAX_REDIRECTS = parsePositiveIntegerEnv(
  process.env.IMAGE_PROXY_MAX_REDIRECTS,
  3
);
const ALL_IMAGE_PROXY_ALLOWED_HOSTS = [...new Set([
  ...DEFAULT_IMAGE_PROXY_ALLOWED_HOSTS,
  ...IMAGE_PROXY_ALLOWED_HOSTS
])];

function isImageProxyHostAllowed(hostname) {
  const normalizedHost = (hostname || '').toLowerCase();
  return ALL_IMAGE_PROXY_ALLOWED_HOSTS.some(
    (allowedHost) => normalizedHost === allowedHost || normalizedHost.endsWith(`.${allowedHost}`)
  );
}

async function fetchAllowedImage(url, { signal }) {
  let currentUrl = new URL(url);

  for (let redirectCount = 0; redirectCount <= IMAGE_PROXY_MAX_REDIRECTS; redirectCount += 1) {
    const upstreamResponse = await fetch(currentUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': 'FightPickerImageProxy/1.0'
      }
    });

    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      const location = upstreamResponse.headers.get('location');
      if (!location) {
        throw new Error('Image host returned a redirect without a location header');
      }

      const redirectedUrl = new URL(location, currentUrl);
      if (!['http:', 'https:'].includes(redirectedUrl.protocol)) {
        throw new Error('Image host redirected to a disallowed protocol');
      }

      if (!isImageProxyHostAllowed(redirectedUrl.hostname)) {
        throw new Error('Image host redirected to a disallowed host');
      }

      if (redirectCount === IMAGE_PROXY_MAX_REDIRECTS) {
        throw new Error('Image host redirected too many times');
      }

      currentUrl = redirectedUrl;
      continue;
    }

    return upstreamResponse;
  }

  throw new Error('Image host redirected too many times');
}

const authRateLimit = createRateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please wait a few minutes and try again.',
});

const adminActionRateLimit = createRateLimitMiddleware({
  windowMs: 10 * 60 * 1000,
  max: 30,
  keyPrefix: 'admin-action',
  message: 'Too many admin requests. Please wait a few minutes and try again.',
});

const imageProxyRateLimit = createRateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: 'image-proxy',
  message: 'Too many image requests. Please slow down and try again.',
});

// Cache headers for frequently accessed, mostly-read endpoints
const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const LEADERBOARD_CACHE_CONTROL = 'no-store';
app.use((req, res, next) => {
  const path = req.path;
  const isEvents = path === '/events';
  const isLeaderboard = path.startsWith('/leaderboard');
  const isEventLeaderboard = /^\/events\/[^/]+\/leaderboard$/.test(path);
  const isEventFights = /^\/events\/[^/]+\/fights$/.test(path);
  const isEventRecap = /^\/events\/[^/]+\/recap$/.test(path);
  const isEventComparison = /^\/events\/[^/]+\/friend-comparison$/.test(path);
  const isPlayercards = path === '/playercards';
  const isHighlights = /^\/user\/[^/]+\/highlights\/(\d{4}|all-time)$/.test(path);

  if (isLeaderboard || isEventLeaderboard || isEventFights || isEventRecap || isEventComparison) {
    res.set('Cache-Control', LEADERBOARD_CACHE_CONTROL);
  } else if (isEvents || isPlayercards || isHighlights) {
    res.set('Cache-Control', CACHE_CONTROL);
  }
  next();
});

// Add global error handlers to prevent server crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process, just log the error
});

// Helper function to fetch all records from a Supabase query with pagination
async function fetchAllFromSupabase(query) {
  let allData = [];
  let page = 0;
  const pageSize = 1000; // Supabase's default page size limit
  let keepFetching = true;

  while (keepFetching) {
    const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching paginated data:', error);
      throw error; // Propagate the error up
    }

    if (data && data.length > 0) {
      allData = allData.concat(data);
      page++;
    } else {
      keepFetching = false;
    }

    // Stop if we receive fewer records than the page size, indicating it's the last page
    if (data && data.length < pageSize) {
      keepFetching = false;
    }
  }

  return allData;
}

function normalizeBooleanFlag(value) {
  if (value === true || value === 1) {
    return true;
  }

  const normalized = (value || '').toString().trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function normalizeUserId(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const EVENT_STREAK_BONUS_THRESHOLDS = [
  { streak: 3, bonus: 1 },
  { streak: 5, bonus: 1 },
];
const PERFECT_MAIN_CARD_BONUS = 2;
const PREDICTION_RESULTS_INSERT_CHUNK_SIZE = 500;
const FIGHT_CARD_FIGHT_SELECT = 'FightId, EventId, Corner, FighterId, FirstName, LastName, Nickname, Record_Wins, Record_Losses, Record_Draws, Record_NoContests, Stance, style, ImageURL, Rank, odds, FightingOutOf_Country, Age, Weight_lbs, Height_in, Reach_in, Streak, KO_TKO_Wins, KO_TKO_Losses, Submission_Wins, Submission_Losses, Decision_Wins, Decision_Losses, CardSegment, FighterWeightClass, FightOrder, FightStatus, PossibleRounds, IsTitleFight, TitleFightName';
const ADMIN_FIGHTER_STAT_FIELDS = [
  'odds',
  'TapologyFighterURL',
  'style',
  'Streak',
  'KO_TKO_Wins',
  'KO_TKO_Losses',
  'Submission_Wins',
  'Submission_Losses',
  'Decision_Wins',
  'Decision_Losses',
];
const ADMIN_INTEGER_FIGHTER_STAT_FIELDS = new Set(
  ADMIN_FIGHTER_STAT_FIELDS.filter((field) => !['odds', 'style', 'TapologyFighterURL', 'Streak'].includes(field))
);
const ADMIN_SIGNED_INTEGER_FIGHTER_STAT_FIELDS = new Set(['Streak']);
const FIGHTER_PROFILE_EDIT_COLUMNS = new Set(
  ADMIN_FIGHTER_STAT_FIELDS.map(toFighterProfileColumn).filter(Boolean)
);
const FIGHT_CARD_STAT_SELECT = [
  'id',
  'FightId',
  'FightOrder',
  'EventId',
  'StartTime',
  'Corner',
  'FighterId',
  'MMAId',
  'FirstName',
  'LastName',
  'Nickname',
  'Record_Wins',
  'Record_Losses',
  'odds',
  'Streak',
  'style',
  'KO_TKO_Wins',
  'KO_TKO_Losses',
  'Submission_Wins',
  'Submission_Losses',
  'Decision_Wins',
  'Decision_Losses',
  'TapologyFighterURL',
  'TapologyMatchConfidence',
].join(',');

function normalizeAdminStatValue(field, value) {
  if (!ADMIN_FIGHTER_STAT_FIELDS.includes(field)) {
    return { ok: false, error: `Unsupported field: ${field}` };
  }

  if (value === null || value === undefined || value === '') {
    return { ok: true, value: null };
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  if (ADMIN_SIGNED_INTEGER_FIGHTER_STAT_FIELDS.has(field)) {
    if (!/^-?\d+$/.test(trimmed)) {
      return { ok: false, error: `${field} must be a whole number` };
    }

    return { ok: true, value: Number.parseInt(trimmed, 10) };
  }

  if (field === 'odds') {
    if (!/^[+-]?\d+$/.test(trimmed)) {
      return { ok: false, error: 'odds must be a signed whole number' };
    }

    return { ok: true, value: trimmed };
  }

  if (!ADMIN_INTEGER_FIGHTER_STAT_FIELDS.has(field)) {
    if (field === 'TapologyFighterURL' && trimmed && !/^https:\/\/www\.tapology\.com\/fightcenter\/fighters\//i.test(trimmed)) {
      return { ok: false, error: 'TapologyFighterURL must be a Tapology fighter profile URL' };
    }

    return { ok: true, value: trimmed };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: `${field} must be a non-negative whole number` };
  }

  return { ok: true, value: Number.parseInt(trimmed, 10) };
}

function toFighterProfileColumn(field) {
  return {
    TapologyFighterURL: 'tapology_fighter_url',
    style: 'style',
    Streak: 'streak',
    KO_TKO_Wins: 'ko_tko_wins',
    KO_TKO_Losses: 'ko_tko_losses',
    Submission_Wins: 'submission_wins',
    Submission_Losses: 'submission_losses',
    Decision_Wins: 'decision_wins',
    Decision_Losses: 'decision_losses',
  }[field];
}

function compactFighterProfilePayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => (
      value !== null
      && value !== undefined
    ) || FIGHTER_PROFILE_EDIT_COLUMNS.has(key))
  );
}

function compactNonNullPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined)
  );
}

function parseTapologyProfileScraperOutput(stdout) {
  const lines = String(stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch (error) {
      // Ignore non-JSON logging from proxy fallbacks.
    }
  }

  throw new Error('Tapology scraper did not return JSON.');
}

function runTapologyFighterProfileScraper({
  tapologyFighterUrl,
  fighterName = '',
  recordWins = null,
  recordLosses = null,
  timeoutMs = 120000,
}) {
  const scriptPath = path.join(REPO_ROOT, 'Server', 'scraper', 'scrape_tapology_fighter_profile.py');
  const args = [
    scriptPath,
    tapologyFighterUrl,
    '--timeout',
    String(Math.ceil(timeoutMs / 1000)),
  ];

  if (fighterName) {
    args.push('--fighter-name', fighterName);
  }

  if (recordWins !== null && recordWins !== undefined) {
    args.push('--record-wins', String(recordWins));
  }

  if (recordLosses !== null && recordLosses !== undefined) {
    args.push('--record-losses', String(recordLosses));
  }

  return new Promise((resolve, reject) => {
    const child = spawn('python3', args, {
      cwd: path.join(REPO_ROOT, 'Server', 'scraper'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error('Tapology fighter profile scrape timed out.'));
        return;
      }

      if (code !== 0) {
        let parsedError = null;
        try {
          parsedError = parseTapologyProfileScraperOutput(stderr);
        } catch (error) {
          parsedError = null;
        }

        const scrapeError = new Error(
          parsedError?.error || stderr.trim() || `Tapology scraper exited with code ${code}.`
        );
        scrapeError.scrapeDiagnostics = parsedError?.diagnostics || null;
        reject(scrapeError);
        return;
      }

      try {
        resolve(parseTapologyProfileScraperOutput(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeFighterNameForLookup(firstName, lastName) {
  return [firstName, lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeFiniteInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const FIGHTER_STREAK_PROFILE_SELECT = [
  'fighter_id',
  'streak',
  'streak_source',
  'streak_anchor_source',
  'streak_verified_at',
  'streak_anchor_value',
  'streak_anchor_record_wins',
  'streak_anchor_record_losses',
  'streak_anchor_event_id',
  'streak_anchor_through_date',
  'streak_record_wins',
  'streak_record_losses',
  'streak_verified_through_date',
  'streak_needs_review',
].join(',');

function buildStreakVerificationSummary(profile, row = null) {
  const recordMatches = row
    ? streakRecordMatches(profile, row.Record_Wins, row.Record_Losses)
    : null;
  const verified = isVerifiedStreakProfile(profile) && recordMatches !== false;

  return {
    verified,
    needsReview: Boolean(profile?.streak_needs_review) || recordMatches === false,
    source: profile?.streak_source || null,
    anchorSource: profile?.streak_anchor_source || null,
    verifiedAt: profile?.streak_verified_at || null,
    verifiedThroughDate: profile?.streak_verified_through_date || null,
    recordMatches,
  };
}

async function loadStreakVerificationByFighterId(rows) {
  const fighterIds = Array.from(new Set(
    (rows || [])
      .map((row) => Number(row?.FighterId ?? row?.fighterId))
      .filter(Number.isFinite)
  ));
  if (fighterIds.length === 0) {
    return {};
  }

  const fightIds = Array.from(new Set(
    (rows || []).map((row) => Number(row?.FightId ?? row?.fightId)).filter(Number.isFinite)
  ));
  const [profileResponse, resultResponse] = await Promise.all([
    supabase
      .from('fighters')
      .select(FIGHTER_STREAK_PROFILE_SELECT)
      .in('fighter_id', fighterIds),
    fightIds.length > 0
      ? supabase
          .from('fight_results')
          .select('fight_id,fighter_id,is_completed,result_type')
          .in('fight_id', fightIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const { data, error } = profileResponse;
  if (error) {
    throw new Error(`Failed to load fighter streak verification: ${error.message}`);
  }
  if (resultResponse.error) {
    throw new Error(`Failed to load fight results for streak verification: ${resultResponse.error.message}`);
  }

  const profilesById = new Map((data || []).map((profile) => [Number(profile.fighter_id), profile]));
  const resultsByFightId = new Map(
    (resultResponse.data || []).map((result) => [Number(result.fight_id), result])
  );
  return Object.fromEntries(fighterIds.map((fighterId) => {
    const row = (rows || []).find(
      (candidate) => Number(candidate?.FighterId ?? candidate?.fighterId) === fighterId
    );
    const result = resultsByFightId.get(Number(row?.FightId ?? row?.fightId));
    let comparisonRow = row;
    const hasWinnerResult = result?.is_completed === true
      && (result.result_type === 'winner' || (!result.result_type && result.fighter_id != null));
    if (hasWinnerResult && row) {
      const won = Number(result.fighter_id) === fighterId;
      const wins = normalizeFiniteInteger(row.Record_Wins);
      const losses = normalizeFiniteInteger(row.Record_Losses);
      comparisonRow = {
        ...row,
        Record_Wins: Number.isFinite(wins) ? wins + (won ? 1 : 0) : row.Record_Wins,
        Record_Losses: Number.isFinite(losses) ? losses + (won ? 0 : 1) : row.Record_Losses,
      };
    }
    return [fighterId, buildStreakVerificationSummary(profilesById.get(fighterId), comparisonRow)];
  }));
}

async function decorateRowsWithStreakVerification(rows) {
  const verificationByFighterId = await loadStreakVerificationByFighterId(rows);
  return (rows || []).map((row) => ({
    ...row,
    StreakVerification: verificationByFighterId[Number(row.FighterId)] || {
      verified: false,
      needsReview: true,
      source: null,
      anchorSource: null,
      verifiedAt: null,
      verifiedThroughDate: null,
      recordMatches: null,
    },
  }));
}

async function persistVerifiedStreakAnchor({ row, eventId, streak, source }) {
  const fighterId = Number(row?.FighterId);
  if (!Number.isFinite(fighterId)) {
    throw new Error('A fighter id is required to verify streak');
  }

  const fightId = Number(row?.FightId);
  let fightCompleted = false;
  let anchorRow = row;
  if (Number.isFinite(fightId)) {
    const { data: result, error: resultError } = await supabase
      .from('fight_results')
      .select('fighter_id,is_completed,result_type')
      .eq('fight_id', fightId)
      .maybeSingle();
    if (resultError) {
      throw new Error(`Failed to check the fight result before verifying streak: ${resultError.message}`);
    }
    fightCompleted = result?.is_completed === true;
    const hasWinnerResult = fightCompleted
      && (result.result_type === 'winner' || (!result.result_type && result.fighter_id != null));
    if (hasWinnerResult) {
      const won = Number(result.fighter_id) === fighterId;
      const recordWins = normalizeFiniteInteger(row?.Record_Wins);
      const recordLosses = normalizeFiniteInteger(row?.Record_Losses);
      anchorRow = {
        ...row,
        Record_Wins: Number.isFinite(recordWins) ? recordWins + (won ? 1 : 0) : row?.Record_Wins,
        Record_Losses: Number.isFinite(recordLosses) ? recordLosses + (won ? 0 : 1) : row?.Record_Losses,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const anchor = buildStreakAnchorPayload({
    row: anchorRow,
    streak,
    source,
    eventId,
    eventDate: row?.StartTime,
    fightCompleted,
    verifiedAt: nowIso,
  });
  const payload = compactNonNullPayload({
    fighter_id: fighterId,
    mma_id: row.MMAId ?? null,
    first_name: row.FirstName ?? null,
    last_name: row.LastName ?? null,
    normalized_name: normalizeFighterNameForLookup(row.FirstName, row.LastName) || null,
    ...anchor,
    stats_source: source === 'manual' ? 'manual_streak' : 'tapology_live',
    stats_confidence: source === 'manual' ? 'manual_streak' : 'live-profile-streak',
    stats_as_of_event_id: Number.isFinite(Number(eventId)) ? Number(eventId) : null,
    stats_as_of_event_date: toDateOnly(row?.StartTime),
    last_success_at: nowIso,
  });

  const { error } = await supabase
    .from('fighters')
    .upsert([payload], { onConflict: 'fighter_id' });
  if (error) {
    throw new Error(`Failed to save verified fighter streak: ${error.message}`);
  }

  return buildStreakVerificationSummary(payload, anchorRow);
}

async function persistManualStreakAnchors({ eventId, preview, manualRowUpdates }) {
  const rowsByKey = new Map(
    (preview?.rows || []).map((row) => [buildFightCardPreviewRowKey(row), row])
  );
  const verified = {};

  for (const [rowKey, values] of Object.entries(manualRowUpdates || {})) {
    if (!values || !Object.prototype.hasOwnProperty.call(values, 'Streak')) {
      continue;
    }
    const row = rowsByKey.get(rowKey);
    if (!row || values.Streak === null || values.Streak === '') {
      continue;
    }
    verified[Number(row.FighterId)] = await persistVerifiedStreakAnchor({
      row: { ...row, Streak: values.Streak },
      eventId,
      streak: values.Streak,
      source: 'manual',
    });
  }

  return verified;
}

async function updateFighterStreaksForFightResult({
  fightId,
  winnerId,
}) {
  const normalizedFightId = Number(fightId);
  const normalizedWinnerId = winnerId === null || winnerId === undefined
    ? null
    : Number(winnerId);

  if (!Number.isFinite(normalizedFightId) || (normalizedWinnerId !== null && !Number.isFinite(normalizedWinnerId))) {
    return { skipped: true, reason: 'Invalid fight or winner id', updates: [] };
  }

  const { data: fightRows, error: fightRowsError } = await supabase
    .from('ufc_full_fight_card')
    .select('id,FightId,EventId,StartTime,Corner,FighterId,MMAId,FirstName,LastName,Record_Wins,Record_Losses,Streak')
    .eq('FightId', normalizedFightId);

  if (fightRowsError) {
    throw new Error(`Failed to load fight-card rows for streak update: ${fightRowsError.message}`);
  }

  const eligibleRows = (fightRows || []).filter((row) => Number.isFinite(Number(row.FighterId)));
  if (eligibleRows.length === 0) {
    return { skipped: true, reason: 'No fight-card fighter rows found', updates: [] };
  }

  const fighterIds = eligibleRows.map((row) => Number(row.FighterId));
  const eventDate = toDateOnly(eligibleRows[0]?.StartTime);
  const eventId = Number(eligibleRows[0]?.EventId);
  if (!eventDate || !Number.isFinite(eventId)) {
    return { skipped: true, reason: 'Fight-card event date is unavailable', updates: [] };
  }

  if (normalizedWinnerId === null) {
    const { error: deleteLedgerError } = await supabase
      .from('fighter_streak_results')
      .delete()
      .eq('fight_id', normalizedFightId);
    if (deleteLedgerError) {
      throw new Error(`Failed to remove fighter streak result ledger rows: ${deleteLedgerError.message}`);
    }
  } else {
    const ledgerRows = eligibleRows.map((row) => ({
      fighter_id: Number(row.FighterId),
      fight_id: normalizedFightId,
      event_id: eventId,
      event_date: eventDate,
      outcome: Number(row.FighterId) === normalizedWinnerId ? 'win' : 'loss',
    }));
    const { error: ledgerError } = await supabase
      .from('fighter_streak_results')
      .upsert(ledgerRows, { onConflict: 'fighter_id,fight_id' });
    if (ledgerError) {
      throw new Error(`Failed to save fighter streak result ledger rows: ${ledgerError.message}`);
    }
  }

  const { data: fighterProfiles, error: fighterProfilesError } = await supabase
    .from('fighters')
    .select(FIGHTER_STREAK_PROFILE_SELECT)
    .in('fighter_id', fighterIds);

  if (fighterProfilesError) {
    throw new Error(`Failed to load fighter profiles for streak update: ${fighterProfilesError.message}`);
  }

  const fighterProfileById = new Map(
    (fighterProfiles || []).map((row) => [Number(row.fighter_id), row])
  );
  const nowIso = new Date().toISOString();
  const fighterProfilePayloads = [];
  const updates = [];

  for (const row of eligibleRows) {
    const fighterId = Number(row.FighterId);
    const profile = fighterProfileById.get(fighterId);
    if (!isVerifiedStreakProfile(profile)) {
      updates.push({
        fighterId,
        skipped: true,
        reason: 'Fighter does not have a verified streak anchor',
      });
      continue;
    }

    const { data: resultRows, error: resultRowsError } = await supabase
      .from('fighter_streak_results')
      .select('fighter_id,fight_id,event_id,event_date,outcome')
      .eq('fighter_id', fighterId)
      .order('event_date', { ascending: true })
      .order('event_id', { ascending: true })
      .order('fight_id', { ascending: true });
    if (resultRowsError) {
      throw new Error(`Failed to replay fighter streak results: ${resultRowsError.message}`);
    }

    const rowsBeforeFight = (resultRows || []).filter((resultRow) => (
      String(resultRow.event_date).localeCompare(eventDate) < 0
      || (
        String(resultRow.event_date) === eventDate
        && (
          Number(resultRow.event_id) < eventId
          || (
            Number(resultRow.event_id) === eventId
            && Number(resultRow.fight_id) < normalizedFightId
          )
        )
      )
    ));
    const preFightReplay = replayStreakFromAnchor(profile, rowsBeforeFight);
    const preFightRecordMatches = preFightReplay.ok
      ? streakRecordMatches({
          streak_record_wins: preFightReplay.recordWins,
          streak_record_losses: preFightReplay.recordLosses,
        }, row.Record_Wins, row.Record_Losses)
      : null;
    if (preFightRecordMatches === false) {
      const { error: reviewError } = await supabase
        .from('fighters')
        .update({ streak_needs_review: true })
        .eq('fighter_id', fighterId);
      if (reviewError) {
        throw new Error(`Failed to flag fighter streak for review: ${reviewError.message}`);
      }
      updates.push({
        fighterId,
        skipped: true,
        reason: 'Fight-card record does not match the verified streak record',
      });
      continue;
    }

    const replay = replayStreakFromAnchor(profile, resultRows || []);
    if (!replay.ok) {
      updates.push({ fighterId, skipped: true, reason: replay.reason });
      continue;
    }

    fighterProfilePayloads.push(compactNonNullPayload({
      fighter_id: fighterId,
      mma_id: row.MMAId ?? null,
      first_name: row.FirstName ?? null,
      last_name: row.LastName ?? null,
      normalized_name: normalizeFighterNameForLookup(row.FirstName, row.LastName) || null,
      streak: replay.streak,
      streak_source: 'fight_results',
      streak_record_wins: replay.recordWins,
      streak_record_losses: replay.recordLosses,
      streak_verified_through_date: replay.verifiedThroughDate,
      streak_needs_review: false,
      stats_source: 'fight_result',
      stats_confidence: 'fight_result',
      stats_as_of_event_id: Number.isFinite(eventId) ? eventId : null,
      stats_as_of_event_date: typeof row.StartTime === 'string'
        ? row.StartTime.split('T')[0]
        : null,
      last_success_at: nowIso,
    }));

    updates.push({
      fighterId,
      skipped: false,
      previousStreak: normalizeFiniteInteger(profile.streak),
      nextStreak: replay.streak,
      appliedResultCount: replay.appliedResultCount,
    });
  }

  if (fighterProfilePayloads.length > 0) {
    const { error: fightersUpdateError } = await supabase
      .from('fighters')
      .upsert(fighterProfilePayloads, { onConflict: 'fighter_id' });

    if (fightersUpdateError) {
      throw new Error(`Failed to update fighters streaks: ${fightersUpdateError.message}`);
    }
  }

  return {
    skipped: false,
    updatedFightCardRows: 0,
    updatedFighters: fighterProfilePayloads.length,
    updates,
  };
}

async function resolveTapologyFighterUrlForStatRow(row, overrideUrl = '') {
  if (overrideUrl) {
    return overrideUrl;
  }

  if (row?.TapologyFighterURL) {
    return row.TapologyFighterURL;
  }

  const fighterId = Number(row?.FighterId);
  const normalizedName = normalizeFighterNameForLookup(row?.FirstName, row?.LastName);

  let fighterProfileQuery = supabase
    .from('fighters')
    .select('tapology_fighter_url')
    .limit(1);

  if (Number.isFinite(fighterId)) {
    fighterProfileQuery = fighterProfileQuery.eq('fighter_id', fighterId);
  } else if (normalizedName) {
    fighterProfileQuery = fighterProfileQuery.eq('normalized_name', normalizedName);
  } else {
    fighterProfileQuery = null;
  }

  const { data: fighterProfiles } = fighterProfileQuery
    ? await fighterProfileQuery
    : { data: [] };
  const fighterProfile = Array.isArray(fighterProfiles) ? fighterProfiles[0] : fighterProfiles;

  if (fighterProfile?.tapology_fighter_url) {
    return fighterProfile.tapology_fighter_url;
  }

  let tapologyCacheQuery = supabase
    .from('tapology_fighter_cache')
    .select('tapology_fighter_url')
    .limit(1);

  if (Number.isFinite(fighterId)) {
    tapologyCacheQuery = tapologyCacheQuery.eq('fighter_id', fighterId);
  } else if (normalizedName) {
    tapologyCacheQuery = tapologyCacheQuery.eq('normalized_name', normalizedName);
  } else {
    tapologyCacheQuery = null;
  }

  const { data: tapologyCacheRows } = tapologyCacheQuery
    ? await tapologyCacheQuery
    : { data: [] };
  const tapologyCache = Array.isArray(tapologyCacheRows) ? tapologyCacheRows[0] : tapologyCacheRows;

  return tapologyCache?.tapology_fighter_url || '';
}

function buildFightCardPatchFromTapologyProfile(row, profile) {
  const patch = {};

  for (const field of ADMIN_FIGHTER_STAT_FIELDS) {
    const normalized = normalizeAdminStatValue(field, profile?.[field]);
    if (!normalized.ok || normalized.value === null) {
      continue;
    }

    const existingValue = normalizeAdminStatValue(field, row?.[field]);
    if (!existingValue.ok || existingValue.value !== normalized.value) {
      patch[field] = normalized.value;
    }
  }

  return patch;
}

function tapologyStatsConfidence(source) {
  return {
    tapology_single_profile: 'single-profile-scrape',
    tapology_wikipedia_merged: 'partial-profile-merged',
    tapology_partial_profile: 'partial-profile-scrape',
    wikipedia_record_breakdown: 'validated-wikipedia-fallback',
  }[source] || 'profile-scrape';
}

function buildTapologyScrapeDiagnostics(scrapeResult, profile, updatedFields) {
  const rawDiagnostics = scrapeResult?.diagnostics || {};
  const profileFields = [
    'Streak',
    'style',
    'KO_TKO_Wins',
    'KO_TKO_Losses',
    'Submission_Wins',
    'Submission_Losses',
    'Decision_Wins',
    'Decision_Losses',
  ];
  const fieldsFound = rawDiagnostics.fields_found || profileFields.filter(
    (field) => profile?.[field] !== null && profile?.[field] !== undefined && profile?.[field] !== ''
  );
  const fieldsMissing = rawDiagnostics.fields_missing || profileFields.filter(
    (field) => !fieldsFound.includes(field)
  );
  const source = scrapeResult?.source || 'unknown';
  const tapologyFetchStatus = rawDiagnostics.tapology_fetch_status
    || (scrapeResult?.tapology_error ? 'failed' : 'success');
  let streakDetail = rawDiagnostics.streak_detail;
  if (!streakDetail && fieldsMissing.includes('Streak')) {
    streakDetail = tapologyFetchStatus === 'failed'
      ? 'Streak is missing because Tapology could not be fetched; the fallback source does not expose current MMA streak.'
      : 'Tapology did not expose a recognized Current MMA Streak value.';
  }

  return {
    status: rawDiagnostics.status || (fieldsMissing.length > 0 ? 'partial' : 'complete'),
    source,
    tapologyFetchStatus,
    tapologyError: rawDiagnostics.tapology_error || scrapeResult?.tapology_error || null,
    fallbackError: rawDiagnostics.fallback_error || null,
    fieldsFound,
    fieldsMissing,
    updatedFields,
    streakDetail: streakDetail || null,
    warnings: rawDiagnostics.warnings || scrapeResult?.validation_warnings || [],
  };
}

function buildFailedTapologyScrapeDiagnostics(error) {
  const rawDiagnostics = error.scrapeDiagnostics || {};
  return {
    status: 'failed',
    source: rawDiagnostics.source || 'none',
    tapologyFetchStatus: rawDiagnostics.tapology_fetch_status || 'failed',
    tapologyError: rawDiagnostics.tapology_error || error.message,
    fallbackError: rawDiagnostics.fallback_error || null,
    fieldsFound: rawDiagnostics.fields_found || [],
    fieldsMissing: rawDiagnostics.fields_missing || ['Streak', 'style', 'KO_TKO_Wins', 'KO_TKO_Losses', 'Submission_Wins', 'Submission_Losses', 'Decision_Wins', 'Decision_Losses'],
    updatedFields: [],
    streakDetail: rawDiagnostics.streak_detail || 'Streak was not updated because the fighter scrape failed.',
    warnings: [...(rawDiagnostics.warnings || []), error.message],
  };
}

async function persistScrapedTapologyFighterProfile({
  row,
  eventId,
  tapologyFighterUrl,
  profile,
  statsSource,
  statsConfidence,
  verifyLiveStreak = false,
}) {
  const fighterId = Number(row?.FighterId);
  if (!Number.isFinite(fighterId)) {
    return { updatedFighters: 0, updatedTapologyCacheRows: 0 };
  }

  const nowIso = new Date().toISOString();
  const scrapedStreak = parseOptionalInteger(profile.Streak);
  const baseProfilePayload = {
    fighter_id: fighterId,
    mma_id: row.MMAId ?? null,
    first_name: row.FirstName ?? null,
    last_name: row.LastName ?? null,
    normalized_name: normalizeFighterNameForLookup(row.FirstName, row.LastName) || null,
    tapology_fighter_url: tapologyFighterUrl,
    rank: parseOptionalInteger(profile.Rank),
    style: normalizeAdminStatValue('style', profile.style).value,
    ko_tko_wins: normalizeAdminStatValue('KO_TKO_Wins', profile.KO_TKO_Wins).value,
    ko_tko_losses: normalizeAdminStatValue('KO_TKO_Losses', profile.KO_TKO_Losses).value,
    submission_wins: normalizeAdminStatValue('Submission_Wins', profile.Submission_Wins).value,
    submission_losses: normalizeAdminStatValue('Submission_Losses', profile.Submission_Losses).value,
    decision_wins: normalizeAdminStatValue('Decision_Wins', profile.Decision_Wins).value,
    decision_losses: normalizeAdminStatValue('Decision_Losses', profile.Decision_Losses).value,
    last_success_at: nowIso,
    last_failure_at: null,
    last_error: null,
  };
  const fightersPayload = compactNonNullPayload(baseProfilePayload);

  const { error: fightersError } = await supabase
    .from('fighters')
    .upsert([fightersPayload], { onConflict: 'fighter_id' });

  if (fightersError) {
    throw new Error(`Failed to update fighters table: ${fightersError.message}`);
  }

  const tapologyCachePayload = compactNonNullPayload({
    ...baseProfilePayload,
    streak: scrapedStreak,
    source: statsSource,
    match_confidence: statsConfidence,
  });
  const { error: tapologyCacheError } = await supabase
    .from('tapology_fighter_cache')
    .upsert([tapologyCachePayload], { onConflict: 'fighter_id' });

  if (tapologyCacheError) {
    console.error('Tapology fighter cache update skipped:', tapologyCacheError);
  }

  const streakVerification = verifyLiveStreak && scrapedStreak !== null
    ? await persistVerifiedStreakAnchor({
        row: { ...row, Streak: scrapedStreak },
        eventId,
        streak: scrapedStreak,
        source: 'tapology_live',
      })
    : null;

  return {
    updatedFighters: 1,
    updatedTapologyCacheRows: tapologyCacheError ? 0 : 1,
    streakVerification,
  };
}

async function persistImportedFightCardPreviewUpdates({
  eventId,
  preview,
  manualRowUpdates,
  updateFighterProfiles = true,
}) {
  if (!preview?.isImported) {
    return { updatedFightCardRows: 0, updatedFighters: 0 };
  }

  if (!manualRowUpdates || typeof manualRowUpdates !== 'object' || Array.isArray(manualRowUpdates)) {
    return { updatedFightCardRows: 0, updatedFighters: 0 };
  }

  const requestedEntries = Object.entries(manualRowUpdates)
    .filter(([, values]) => values && typeof values === 'object' && !Array.isArray(values));
  if (requestedEntries.length === 0) {
    return { updatedFightCardRows: 0, updatedFighters: 0 };
  }

  const { data: importedRows, error: importedRowsError } = await supabase
    .from('ufc_full_fight_card')
    .select(FIGHT_CARD_STAT_SELECT)
    .eq('EventId', eventId);

  if (importedRowsError) {
    throw new Error(`Failed to load imported fight-card rows: ${importedRowsError.message}`);
  }

  const previewRowsByKey = new Map(
    (preview.rows || []).map((row) => [buildFightCardPreviewRowKey(row), row])
  );
  const importedRowsByKey = new Map(
    (importedRows || []).map((row) => [buildFightCardPreviewRowKey(row), row])
  );
  const normalizedUpdates = [];

  for (const [rowKey, requestedValues] of requestedEntries) {
    const previewRow = previewRowsByKey.get(rowKey);
    const importedRow = importedRowsByKey.get(rowKey);
    if (!previewRow || !importedRow) {
      throw new Error(`Imported fight-card row ${rowKey} was not found for event ${eventId}`);
    }

    const patch = {};
    for (const [field, rawValue] of Object.entries(requestedValues)) {
      const normalized = normalizeAdminStatValue(field, rawValue);
      if (!normalized.ok) {
        throw new Error(normalized.error);
      }
      patch[field] = normalized.value;
    }

    if (Object.keys(patch).length > 0) {
      normalizedUpdates.push({ importedRow, patch });
    }
  }

  let updatedFightCardRows = 0;
  const fighterProfilePayloadById = new Map();

  for (const { importedRow, patch } of normalizedUpdates) {
    const { error: updateError } = await supabase
      .from('ufc_full_fight_card')
      .update(patch)
      .eq('EventId', eventId)
      .eq('id', importedRow.id);

    if (updateError) {
      throw new Error(`Failed to update fight-card row ${importedRow.id}: ${updateError.message}`);
    }

    updatedFightCardRows += 1;
    if (!updateFighterProfiles) {
      continue;
    }

    const fighterId = Number(importedRow.FighterId);
    if (!Number.isFinite(fighterId)) {
      continue;
    }

    const fighterProfileEntries = Object.entries(patch)
      .map(([field, value]) => [toFighterProfileColumn(field), field, value])
      .filter(([profileColumn, field]) => Boolean(profileColumn) && field !== 'Streak');
    if (fighterProfileEntries.length === 0) {
      continue;
    }

    const payload = fighterProfilePayloadById.get(fighterId) || {
      fighter_id: fighterId,
      mma_id: importedRow.MMAId ?? null,
      first_name: importedRow.FirstName ?? null,
      last_name: importedRow.LastName ?? null,
      normalized_name: normalizeFighterNameForLookup(importedRow.FirstName, importedRow.LastName) || null,
    };

    for (const [profileColumn, , value] of fighterProfileEntries) {
      payload[profileColumn] = value;
    }

    fighterProfilePayloadById.set(fighterId, payload);
  }

  const fighterProfilePayloads = Array.from(fighterProfilePayloadById.values())
    .map(compactFighterProfilePayload);
  if (fighterProfilePayloads.length > 0) {
    const { error: fighterUpdateError } = await supabase
      .from('fighters')
      .upsert(fighterProfilePayloads, { onConflict: 'fighter_id' });

    if (fighterUpdateError) {
      throw new Error(`Failed to update fighters table: ${fighterUpdateError.message}`);
    }
  }

  return {
    updatedFightCardRows,
    updatedFighters: fighterProfilePayloads.length,
  };
}

function parseOptionalInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMainCardSegment(segment) {
  return String(segment || '').trim().toLowerCase() === 'main';
}

function buildPredictionOwnerKey(record) {
  const normalizedUserId = normalizeUserId(record?.user_id);
  if (normalizedUserId !== null) {
    return `user:${normalizedUserId}`;
  }

  const username = typeof record?.username === 'string'
    ? record.username.trim().toLowerCase()
    : '';
  return username ? `username:${username}` : null;
}

function compareFightSequence(a, b) {
  const orderA = Number.isFinite(Number(a?.bout_order)) ? Number(a.bout_order) : Number.MAX_SAFE_INTEGER;
  const orderB = Number.isFinite(Number(b?.bout_order)) ? Number(b.bout_order) : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return (Number(a?.fight_id) || 0) - (Number(b?.fight_id) || 0);
}

async function recalculatePredictionResultsForEvent(eventId) {
  const normalizedEventId = Number(eventId);
  if (!Number.isFinite(normalizedEventId)) {
    throw new Error('eventId is required to recalculate prediction results');
  }

  const fightRows = await fetchAllFromSupabase(
    supabase
      .from('ufc_full_fight_card')
      .select('FightId, EventId, CardSegment, FightOrder')
      .eq('EventId', normalizedEventId)
  );

  const fightMetaById = new Map();
  (fightRows || []).forEach((row) => {
    const fightId = Number(row?.FightId);
    if (!Number.isFinite(fightId)) {
      return;
    }

    const existing = fightMetaById.get(fightId);
    const nextMeta = {
      fight_id: fightId,
      event_id: Number(row?.EventId) || normalizedEventId,
      card_segment: typeof row?.CardSegment === 'string' ? row.CardSegment.trim() : '',
      bout_order: Number.isFinite(Number(row?.FightOrder)) ? Number(row.FightOrder) : null,
    };

    if (!existing) {
      fightMetaById.set(fightId, nextMeta);
      return;
    }

    if (existing.bout_order === null && nextMeta.bout_order !== null) {
      existing.bout_order = nextMeta.bout_order;
    }
    if (!existing.card_segment && nextMeta.card_segment) {
      existing.card_segment = nextMeta.card_segment;
    }
  });

  const existingRows = await fetchAllFromSupabase(
    supabase
      .from('prediction_results')
      .select('fight_id, user_id, username, created_at')
      .eq('event_id', normalizedEventId)
  );

  const existingCreatedAtByKey = new Map();
  (existingRows || []).forEach((row) => {
    const ownerKey = buildPredictionOwnerKey(row);
    const fightId = Number(row?.fight_id);
    if (!ownerKey || !Number.isFinite(fightId) || !row?.created_at) {
      return;
    }
    existingCreatedAtByKey.set(`${ownerKey}:${fightId}`, row.created_at);
  });

  const fightIds = [...fightMetaById.keys()];

  if (fightIds.length === 0) {
    const { error: deleteExistingError } = await supabase
      .from('prediction_results')
      .delete()
      .eq('event_id', normalizedEventId);

    if (deleteExistingError) {
      throw deleteExistingError;
    }

    return { rowCount: 0 };
  }

  const [fightResults, predictions] = await Promise.all([
    fetchAllFromSupabase(
      supabase
        .from('fight_results')
        .select('fight_id, fighter_id, is_completed, result_type')
        .in('fight_id', fightIds)
    ),
    fetchAllFromSupabase(
      supabase
        .from('predictions')
        .select('fight_id, fighter_id, betting_odds, user_id, username')
        .in('fight_id', fightIds)
    ),
  ]);

  const completedOutcomeByFightId = new Map();
  (fightResults || []).forEach((row) => {
    const fightId = Number(row?.fight_id);
    if (!Number.isFinite(fightId) || !row?.is_completed) {
      return;
    }
    const resultType = row.result_type
      || (row.fighter_id !== null && row.fighter_id !== undefined ? 'winner' : null);
    if (!['winner', 'draw', 'no_contest'].includes(resultType)) {
      return;
    }
    completedOutcomeByFightId.set(fightId, {
      resultType,
      winnerId: resultType === 'winner' ? row.fighter_id : null,
    });
  });

  const completedFights = [...fightMetaById.values()]
    .filter((fight) => completedOutcomeByFightId.has(fight.fight_id))
    .sort(compareFightSequence);
  const allMainCardFightIds = [...fightMetaById.values()]
    .filter((fight) => isMainCardSegment(fight.card_segment))
    .sort(compareFightSequence)
    .map((fight) => fight.fight_id);
  const completedMainCardFightIds = completedFights
    .filter((fight) => isMainCardSegment(fight.card_segment))
    .map((fight) => fight.fight_id);
  const allMainCardCompleted = allMainCardFightIds.length > 0
    && completedMainCardFightIds.length === allMainCardFightIds.length;

  const predictionsByOwner = new Map();
  (predictions || []).forEach((prediction) => {
    const ownerKey = buildPredictionOwnerKey(prediction);
    const fightId = Number(prediction?.fight_id);
    if (!ownerKey || !Number.isFinite(fightId)) {
      return;
    }

    if (!predictionsByOwner.has(ownerKey)) {
      predictionsByOwner.set(ownerKey, {
        user_id: normalizeUserId(prediction?.user_id),
        username: typeof prediction?.username === 'string' ? prediction.username : null,
        byFightId: new Map(),
      });
    }

    predictionsByOwner.get(ownerKey).byFightId.set(fightId, prediction);
  });

  const recalculatedRows = [];
  const nowIso = new Date().toISOString();

  predictionsByOwner.forEach((owner, ownerKey) => {
    let runningCorrectStreak = 0;
    const awardedStreakThresholds = new Set();
    const userRows = [];

    completedFights.forEach((fight) => {
      const prediction = owner.byFightId.get(fight.fight_id);
      if (!prediction) {
        runningCorrectStreak = 0;
        return;
      }

      const outcome = completedOutcomeByFightId.get(fight.fight_id);
      const baseScore = scorePredictionOutcome({
        resultType: outcome.resultType,
        winnerId: outcome.winnerId,
        predictionFighterId: prediction.fighter_id,
        bettingOdds: prediction.betting_odds,
      });
      const predictedCorrectly = baseScore.predictedCorrectly;
      let points = baseScore.points;

      if (predictedCorrectly) {
        runningCorrectStreak += 1;

        EVENT_STREAK_BONUS_THRESHOLDS.forEach(({ streak, bonus }) => {
          if (runningCorrectStreak === streak && !awardedStreakThresholds.has(streak)) {
            points += bonus;
            awardedStreakThresholds.add(streak);
          }
        });
      } else {
        runningCorrectStreak = 0;
      }

      userRows.push({
        fight_id: fight.fight_id,
        user_id: owner.user_id,
        username: owner.username,
        event_id: normalizedEventId,
        predicted_correctly: predictedCorrectly,
        points,
        created_at: existingCreatedAtByKey.get(`${ownerKey}:${fight.fight_id}`) || nowIso,
        card_segment: fight.card_segment,
      });
    });

    if (allMainCardCompleted) {
      const mainCardRows = userRows.filter((row) => isMainCardSegment(row.card_segment));
      const hasPerfectMainCard = mainCardRows.length === allMainCardFightIds.length
        && mainCardRows.every((row) => row.predicted_correctly);

      if (hasPerfectMainCard && mainCardRows.length > 0) {
        mainCardRows[mainCardRows.length - 1].points += PERFECT_MAIN_CARD_BONUS;
      }
    }

    userRows.forEach(({ card_segment, ...row }) => {
      recalculatedRows.push(row);
    });
  });

  const { error: deleteExistingError } = await supabase
    .from('prediction_results')
    .delete()
    .eq('event_id', normalizedEventId);

  if (deleteExistingError) {
    throw deleteExistingError;
  }

  for (let index = 0; index < recalculatedRows.length; index += PREDICTION_RESULTS_INSERT_CHUNK_SIZE) {
    const chunk = recalculatedRows.slice(index, index + PREDICTION_RESULTS_INSERT_CHUNK_SIZE);
    const { error: insertError } = await supabase
      .from('prediction_results')
      .insert(chunk);

    if (insertError) {
      throw insertError;
    }
  }

  return { rowCount: recalculatedRows.length };
}

const USERS_IDENTITY_SELECT = 'user_id, username, phone_number, user_type';
const DEFAULT_SELECTED_PLAYERCARD_ID = 16;
const USERS_PROFILE_SELECT = `
  user_id,
  username,
  user_type,
  created_at,
  avatar_config,
  selected_playercard_id,
  playercards!selected_playercard_id (
    id,
    name,
    image_url,
    category
  )
`;

async function fetchUserById(userId, selectClause = USERS_IDENTITY_SELECT) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select(selectClause)
    .eq('user_id', normalizedUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function fetchAllUsers(selectClause) {
  const usersQuery = supabase
    .from('users')
    .select(selectClause);

  try {
    return await fetchAllFromSupabase(usersQuery);
  } catch (error) {
    const fallbackSelectClause = buildUsersSelectWithoutPlayercards(selectClause);
    if (!isMissingUserPlayercardFieldError(error) || !fallbackSelectClause || fallbackSelectClause === selectClause) {
      throw error;
    }

    const fallbackUsersQuery = supabase
      .from('users')
      .select(fallbackSelectClause);
    const users = await fetchAllFromSupabase(fallbackUsersQuery);
    return normalizeUsersWithoutPlayercards(users);
  }
}

async function fetchSingleUserProfile(column, value) {
  const { data, error } = await supabase
    .from('users')
    .select(USERS_PROFILE_SELECT)
    .eq(column, value)
    .maybeSingle();

  if (error && isMissingUserPlayercardFieldError(error)) {
    const fallbackSelectClause = buildUsersSelectWithoutPlayercards(USERS_PROFILE_SELECT);
    if (fallbackSelectClause && fallbackSelectClause !== USERS_PROFILE_SELECT) {
      const fallbackResult = await supabase
        .from('users')
        .select(fallbackSelectClause)
        .eq(column, value)
        .maybeSingle();

      if (fallbackResult.error) {
        throw fallbackResult.error;
      }

      return normalizeUserWithoutPlayercards(fallbackResult.data || null);
    }
  }

  if (error) {
    throw error;
  }

  return data || null;
}

function buildUsersSelectWithoutPlayercards(selectClause) {
  return String(selectClause || '')
    .replace(/\bselected_playercard_id\b\s*,?/gi, '')
    .replace(/playercards!selected_playercard_id\s*\([\s\S]*?\)\s*,?/gi, '')
    .replace(/,\s*,/g, ',')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/,\s*,/g, ',')
    .replace(/^,\s*|\s*,$/g, '')
    .trim();
}

function isMissingUserPlayercardFieldError(error) {
  const message = [
    error?.message || '',
    error?.details || '',
    error?.hint || '',
  ]
    .join(' ')
    .toLowerCase();

  const referencesPlayercardField = [
    'selected_playercard_id',
    'playercards',
  ].some((token) => message.includes(token));

  return referencesPlayercardField && (
    message.includes('column') ||
    message.includes('relationship') ||
    error?.code === '42703' ||
    error?.code === 'PGRST200' ||
    error?.code === 'PGRST204'
  );
}

function normalizeUserWithoutPlayercards(user) {
  if (!user) {
    return user;
  }

  return {
    ...user,
    selected_playercard_id: user.selected_playercard_id ?? null,
    playercards: user.playercards || null,
  };
}

function normalizeUsersWithoutPlayercards(users) {
  return (users || []).map(normalizeUserWithoutPlayercards);
}

function buildUserMaps(users) {
  const safeUsers = users || [];

  return {
    byId: new Map(safeUsers.map(user => [String(user.user_id), user])),
    byUsername: new Map(
      safeUsers
        .filter(user => user?.username)
        .map(user => [String(user.username), user])
    ),
  };
}

function resolveUserForRow(row, userMaps) {
  if (!row || !userMaps) {
    return null;
  }

  const directUserId = row.user_id != null ? String(row.user_id) : null;
  if (directUserId && userMaps.byId.has(directUserId)) {
    return userMaps.byId.get(directUserId);
  }

  const directUsername = row.username != null ? String(row.username) : null;
  if (directUsername && userMaps.byUsername.has(directUsername)) {
    return userMaps.byUsername.get(directUsername);
  }

  return null;
}

function buildUserIdList(users) {
  return Array.from(
    new Set((users || []).map(user => String(user.user_id)).filter(Boolean))
  );
}

async function clearEventWinnersForEvent(eventId) {
  if (!eventId) {
    return;
  }

  const { error } = await supabase
    .from('event_winners')
    .delete()
    .eq('event_id', eventId);

  if (error) {
    throw error;
  }
}

// Add connection test
async function testSupabaseConnection({ verbose = false } = {}) {
  try {
    debugLog('Testing Supabase connection...');

    const { error: connectionError } = await supabase
      .from('ufc_full_fight_card')
      .select('FightId')
      .limit(1);

    if (connectionError) {
      console.error('Supabase connection test failed:', connectionError);
      return false;
    }

    if (verbose) {
      const { data, error } = await supabase
        .from('ufc_full_fight_card')
        .select()
        .limit(1);

      if (error) {
        console.error('Failed to get table structure:', error);
      } else if (data && data.length > 0) {
        debugLog('Available columns in ufc_full_fight_card:', Object.keys(data[0]).join(', '));
      }

      try {
        debugLog('Testing service-role permissions...');
        const { error: adminTestError } = await supabase
          .from('users')
          .select('user_id')
          .limit(1);

        if (adminTestError) {
          console.warn('Service-role test failed:', adminTestError);
        } else {
          debugLog('Service-role test successful');
        }
      } catch (adminError) {
        console.warn('Service-role test error:', adminError);
      }
    }

    debugLog('Supabase connection test successful');
    return true;
  } catch (error) {
    console.error('Error testing Supabase connection:', error);
    return false;
  }
}

function runStartupSupabaseCheck() {
  if (!SHOULD_RUN_STARTUP_SUPABASE_CHECK) {
    debugLog('Skipping Supabase startup check for local development');
    return;
  }

  void testSupabaseConnection({
    verbose: SHOULD_LOG_VERBOSE_STARTUP_SUPABASE_CHECK,
  }).then((connectionSuccess) => {
    if (!connectionSuccess) {
      console.error('WARNING: Failed to connect to Supabase on startup');
    }
  });
}

async function buildAuthenticatedUserResponse(user) {
  const baseResponse = {
    user_id: user.user_id,
    username: user.username,
    user_type: user.user_type || 'user',
  };

  const userSession = await issueUserSession({
    supabase,
    user,
  });

  if (baseResponse.user_type !== 'admin') {
    return {
      ...baseResponse,
      ...userSession,
    };
  }

  const adminSession = await issueAdminSession({
    supabase,
    user: {
      user_id: user.user_id,
      username: user.username,
      user_type: baseResponse.user_type,
    },
  });

  return {
    ...baseResponse,
    ...userSession,
    ...adminSession,
  };
}

async function logAdminAction(req, details) {
  await writeAdminAuditLog({
    supabase,
    req,
    adminUser: req.adminUser,
    ...details,
  });
}

// User Registration
app.post('/register', authRateLimit, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const phoneNumber = typeof req.body?.phoneNumber === 'string'
      ? req.body.phoneNumber.trim()
      : '';
    const username = typeof req.body?.username === 'string'
      ? req.body.username.trim()
      : '';

    // Validate input
    if (!phoneNumber || !username) {
      return res.status(400).json({ error: 'Phone number and username are required' });
    }

    if (phoneNumber.length !== 10 || !/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
    }

    if (/[\u0000-\u001F\u007F]/.test(username)) {
      return res.status(400).json({ error: 'Username contains invalid characters' });
    }

    // Check if username already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking username availability:', checkError);
      return res.status(500).json({ error: 'Failed to check username availability' });
    }

    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Try to insert the user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          phone_number: phoneNumber,
          username: username,
          user_type: 'user',
          avatar_config: randomAvatarConfig(),
          selected_playercard_id: DEFAULT_SELECTED_PLAYERCARD_ID
        }
      ])
      .select('user_id, username, phone_number, user_type')
      .single();

    if (insertError) {
      // If error is about duplicate phone number
      if (insertError.code === '23505' && insertError.message.includes('phone_number')) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
      // If error is about duplicate username (as a backup check)
      if (insertError.code === '23505' && insertError.message.includes('username')) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      
      console.error('Error creating user:', insertError);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    const responsePayload = await buildAuthenticatedUserResponse(newUser);
    if (responsePayload.admin_session_token) {
      await writeAdminAuditLog({
        supabase,
        req,
        adminUser: {
          user_id: responsePayload.user_id,
          username: responsePayload.username,
        },
        action: 'admin.session.login',
        status: 'success',
        metadata: {
          source: 'register',
          admin_session_expires_at: responsePayload.admin_session_expires_at,
        },
      });
    }
    res.json(responsePayload);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Login
app.post('/login', authRateLimit, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const phoneNumber = typeof req.body?.phoneNumber === 'string'
      ? req.body.phoneNumber.trim()
      : '';

    // Validate input
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    if (phoneNumber.length !== 10 || !/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Find user by phone number
    const { data: user, error } = await supabase
      .from('users')
      .select('user_id, username, phone_number, user_type')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (error) {
      console.error('Error finding user:', error);
      return res.status(500).json({ error: 'Failed to find user' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const responsePayload = await buildAuthenticatedUserResponse(user);
    if (responsePayload.admin_session_token) {
      await writeAdminAuditLog({
        supabase,
        req,
        adminUser: {
          user_id: responsePayload.user_id,
          username: responsePayload.username,
        },
        action: 'admin.session.login',
        status: 'success',
        metadata: {
          source: 'login',
          admin_session_expires_at: responsePayload.admin_session_expires_at,
        },
      });
    }
    res.json(responsePayload);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/admin/session/logout', adminActionRateLimit, requireAdminSession, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const token = readBearerToken(req);
    await revokeAdminSession({
      supabase,
      token,
      reason: 'logout',
    });

    await writeAdminAuditLog({
      supabase,
      req,
      adminUser: req.adminUser,
      action: 'admin.session.logout',
      status: 'success',
      metadata: {
        reason: 'logout',
      },
    });

    return res.json({ message: 'Admin session ended' });
  } catch (error) {
    console.error('Admin logout error:', error);
    return res.status(500).json({ error: 'Failed to end admin session' });
  }
});

app.get('/session', requireUserSession, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const profile = await fetchSingleUserProfile('user_id', req.authenticatedUser.user_id);
    if (!profile) {
      return res.status(401).json({ error: 'User session is invalid' });
    }
    return res.json({
      user_id: req.authenticatedUser.user_id,
      ...profile,
      user_session_expires_at: req.userSession.expires_at,
    });
  } catch (error) {
    console.error('Session profile error:', error);
    return res.status(500).json({ error: 'Failed to load user session' });
  }
});

app.post('/session/logout', requireUserSession, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    await revokeUserSession({
      supabase,
      token: readUserBearerToken(req),
      reason: 'logout',
    });
    return res.json({ message: 'User session ended' });
  } catch (error) {
    console.error('User session logout error:', error);
    return res.status(500).json({ error: 'Failed to end user session' });
  }
});

// Helper function to get weightclass mapping
async function getWeightclassMapping() {
  try {
    const { data: weightclasses, error } = await supabase
      .from('weightclasses')
      .select('official_weightclass, gay_weightclass, weight_lbs');
    
    if (error) {
      console.error('Error fetching weightclasses:', error);
      return new Map(); // Return empty map on error
    }

    return buildWeightclassMap(weightclasses);
  } catch (error) {
    console.error('Error in getWeightclassMapping:', error);
    return new Map();
  }
}

app.get('/fights', async (req, res) => {
  try {
    // Get the latest event
    const { data: latestEvent, error: eventError } = await supabase
      .from('events')
      .select('id, name, date, is_completed, image_url')
      .order('date', { ascending: false })
      .limit(1);

    if (eventError) {
      console.error('Error fetching latest event:', eventError);
      return res.status(500).json({ error: 'Failed to fetch latest event' });
    }

    // Get all fights for the latest event
    const { data: fights, error: fightsError } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_FIGHT_SELECT)
      .eq('EventId', latestEvent[0].id);

    if (fightsError) {
      console.error('Error fetching fights:', fightsError);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    // Get weightclass mapping
    const weightclassMap = await getWeightclassMapping();

    // Get fight results
    const { data: fightResults, error: resultsError } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed, result_type');

    if (resultsError) {
      console.error('Error fetching fight results:', resultsError);
      return res.status(500).json({ error: 'Failed to fetch fight results' });
    }

    // Create a map of fight results
    const fightResultsMap = new Map();
    fightResults.forEach(result => {
      fightResultsMap.set(result.fight_id, result);
    });

    // Group fighters by FightId
    const fightersByFight = new Map();
    fights.forEach(fighter => {
      const { FightId, Corner } = fighter;
      if (!fightersByFight.has(FightId)) {
        fightersByFight.set(FightId, { red: null, blue: null });
      }
      fightersByFight.get(FightId)[Corner.toLowerCase()] = fighter;
    });

    // Transform fights
    const transformedFights = [];
    fightersByFight.forEach((fighters, fightId) => {
      if (!fighters.red || !fighters.blue) {
        return;
      }

      const result = fightResultsMap.get(fightId);
      const transformedFight = buildFightResponse({
        fightId,
        eventId: latestEvent[0].id,
        redFighter: fighters.red,
        blueFighter: fighters.blue,
        result,
        weightclassMap,
      });

      transformedFights.push(transformedFight);
    });

    res.json(transformedFights);
  } catch (error) {
    console.error('Error fetching fights:', error);
    res.status(500).json({ error: 'Failed to fetch fights' });
  }
});

app.post('/predict', requireUserSession, async (req, res) => {
  const { fightId, fighter_id } = req.body;
  const user_id = req.authenticatedUser.user_id;
  const username = req.authenticatedUser.username;
  if (!fightId || !fighter_id) {
    return res.status(400).json({ error: "Missing required data" });
  }
  try {
    debugLog('Received prediction request:', {
      fightId,
      fighter_id,
      username,
      user_id
    });

    // Get fight details to get betting odds from ufc_full_fight_card
    const { data: fightData, error: fightError } = await supabase
      .from('ufc_full_fight_card')
      .select('FighterId, odds')
      .eq('FightId', fightId);

    if (fightError) {
      console.error('Error fetching fight data:', fightError);
      return res.status(500).json({ error: "Error fetching fight data" });
    }

    if (!fightData || fightData.length < 2) {
      return res.status(404).json({ error: 'Fight not found or missing fighter data' });
    }

    // Find the selected fighter and get their odds
    const selectedFighter = fightData.find(f => String(f.FighterId) === String(fighter_id));
    let betting_odds = null;
    if (selectedFighter) {
      betting_odds = parseInt(selectedFighter.odds);
    }

    // Check if prediction already exists
    const checkQuery = supabase
      .from('predictions')
      .select('fight_id')
      .eq('fight_id', fightId)
      .eq('user_id', user_id);
    const { data: existingPrediction, error: checkError } = await checkQuery.single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
      console.error('Error checking existing prediction:', checkError);
      return res.status(500).json({ error: "Error checking existing prediction" });
    }

    // Insert or update prediction
    const insertData = {
      fight_id: fightId,
      fighter_id,
      betting_odds,
      user_id,
      username,
    };
    const { data: upserted, error: upsertError } = await supabase
      .from('predictions')
      .upsert([insertData], { onConflict: 'fight_id,user_id' });

    if (upsertError) {
      console.error('Error inserting/updating prediction:', upsertError);
      return res.status(500).json({ error: 'Failed to submit prediction' });
    }

    debugLog('Prediction saved successfully');
    res.status(200).json(upserted);
  } catch (error) {
    console.error('Error in prediction endpoint:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/predictions', requireUserSession, async (req, res) => {
  try {
    const query = supabase
      .from('predictions')
      .select('fight_id, fighter_id, username, user_id')
      .eq('user_id', req.authenticatedUser.user_id);
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching predictions:', error);
      return res.status(500).json({ error: 'Failed to fetch predictions' });
    }
    res.json(data);
  } catch (error) {
    console.error('Error in /predictions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/predictions/history', requireUserSession, async (req, res) => {
  try {
    const predictionsQuery = supabase
      .from('predictions')
      .select('fight_id, fighter_id, username, user_id')
      .eq('user_id', req.authenticatedUser.user_id);

    const predictions = await fetchAllFromSupabase(predictionsQuery);
    if (!predictions || predictions.length === 0) {
      return res.json([]);
    }

    const fightIds = Array.from(new Set(predictions.map(prediction => Number(prediction.fight_id))))
      .filter(fightId => Number.isFinite(fightId));

    if (fightIds.length === 0) {
      return res.json([]);
    }

    const fightsQuery = supabase
      .from('ufc_full_fight_card')
      .select('FightId, EventId')
      .in('FightId', fightIds);
    const fights = await fetchAllFromSupabase(fightsQuery);

    const fightEventMap = new Map();
    (fights || []).forEach(fight => {
      const fightId = Number(fight.FightId);
      if (!Number.isFinite(fightId) || fightEventMap.has(fightId)) {
        return;
      }
      fightEventMap.set(fightId, Number(fight.EventId));
    });

    const eventIds = Array.from(new Set(
      (fights || [])
        .map(fight => Number(fight.EventId))
        .filter(eventId => Number.isFinite(eventId))
    ));

    const eventDateMap = new Map();
    if (eventIds.length > 0) {
      const eventsQuery = supabase
        .from('events')
        .select('id, date')
        .in('id', eventIds);
      const events = await fetchAllFromSupabase(eventsQuery);
      (events || []).forEach(event => {
        const eventId = Number(event.id);
        if (!Number.isFinite(eventId)) {
          return;
        }
        eventDateMap.set(eventId, event.date || null);
      });
    }

    const fightResultsQuery = supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed, result_type')
      .in('fight_id', fightIds);
    const fightResults = await fetchAllFromSupabase(fightResultsQuery);
    const fightResultMap = new Map(
      (fightResults || []).map(result => [
        Number(result.fight_id),
        {
          winner: result.fighter_id,
          is_completed: Boolean(result.is_completed),
          result_type: result.result_type,
        }
      ])
    );

    const history = predictions
      .map(prediction => {
        const fightId = Number(prediction.fight_id);
        const eventId = fightEventMap.get(fightId) || null;
        const result = fightResultMap.get(fightId);
        const winner = result?.winner ?? null;
        const isCompleted = result?.is_completed || false;
        const fighterWon = (isCompleted && winner !== null)
          ? String(winner) === String(prediction.fighter_id)
          : null;

        return {
          fight_id: prediction.fight_id,
          fighter_id: prediction.fighter_id,
          username: prediction.username,
          user_id: prediction.user_id,
          event_id: eventId,
          event_date: eventId ? (eventDateMap.get(eventId) || null) : null,
          winner,
          result_type: result?.result_type || (winner !== null ? 'winner' : null),
          is_completed: isCompleted,
          fighter_won: fighterWon,
        };
      })
      .sort((a, b) => {
        const aTime = a.event_date ? Date.parse(a.event_date) : Number.NEGATIVE_INFINITY;
        const bTime = b.event_date ? Date.parse(b.event_date) : Number.NEGATIVE_INFINITY;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        return Number(b.fight_id) - Number(a.fight_id);
      });

    res.json(history);
  } catch (error) {
    console.error('Error in /predictions/history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/predictions/filter', requireUserSession, async (req, res) => {
  const { fight_id, fighter_id } = req.query;

  if (!fight_id || !fighter_id) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const { data: viewerPrediction, error: viewerPredictionError } = await supabase
      .from('predictions')
      .select('fight_id')
      .eq('fight_id', fight_id)
      .eq('user_id', req.authenticatedUser.user_id)
      .maybeSingle();

    if (viewerPredictionError) {
      console.error('Error checking viewer prediction:', viewerPredictionError);
      return res.status(500).json({ error: 'Error checking prediction access' });
    }
    if (!viewerPrediction) {
      const { data: completedFight, error: completedFightError } = await supabase
        .from('fight_results')
        .select('fight_id')
        .eq('fight_id', fight_id)
        .eq('is_completed', true)
        .maybeSingle();

      if (completedFightError) {
        console.error('Error checking completed fight access:', completedFightError);
        return res.status(500).json({ error: 'Error checking prediction access' });
      }
      if (!completedFight) {
        return res.status(403).json({ error: 'Submit your pick before viewing individual votes' });
      }
    }

    // Get predictions
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('fight_id, fighter_id, username, user_id')
      .eq('fight_id', fight_id)
      .eq('fighter_id', fighter_id);

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
      return res.status(500).json({ error: "Error fetching predictions" });
    }

    // Get user information including is_bot status and playercard info
    const users = await fetchAllUsers(`
      user_id, 
      username, 
      is_bot, 
      avatar_config,
      selected_playercard_id,
      playercards!selected_playercard_id (
        id,
        name,
        image_url,
        category
      )
    `);
    const allUsers = users || [];
    const userMaps = buildUserMaps(allUsers);
    const filteredPredictions = (predictions || []).filter(
      (prediction) => Boolean(resolveUserForRow(prediction, userMaps))
    );

    if (filteredPredictions.length === 0) {
      return res.status(200).json([]);
    }

    // Get leaderboard data for rankings
    const userIds = buildUserIdList(allUsers);
    const { data: results, error: resultsError } = await supabase
      .from('prediction_results')
      .select('user_id, predicted_correctly, points')
      .in('user_id', userIds);
    const filteredResults = results || [];

    if (resultsError) {
      console.error('Error fetching prediction results:', resultsError);
      return res.status(500).json({ error: "Error fetching leaderboard data" });
    }

    // Process leaderboard data
    const userStats = {};
    filteredResults.forEach(result => {
      const userIdStr = String(result.user_id);
      const user = userMaps.byId.get(userIdStr);
      if (!userStats[userIdStr]) {
        userStats[userIdStr] = {
          user_id: userIdStr,
          username: user?.username || 'Unknown',
          is_bot: Boolean(user?.is_bot),
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0
        };
      }
      userStats[userIdStr].total_predictions++;
      if (result.predicted_correctly) {
        userStats[userIdStr].correct_predictions++;
      }
      // Directly sum the points from the table
      userStats[userIdStr].total_points += (result.points || 0);
    });

    // Convert to array and sort to get rankings
    const leaderboard = Object.values(userStats)
      .sort((a, b) => 
        b.total_points - a.total_points || // Sort by points first
        b.correct_predictions - a.correct_predictions || // Then by correct predictions
        ((b.correct_predictions / b.total_predictions) - (a.correct_predictions / a.total_predictions)) // Then by accuracy
      );

    const rankMap = new Map(leaderboard.map((user, index) => [String(user.user_id), index + 1]));

    // Add is_bot status, playercard, and ranking to each prediction
    const predictionsWithMetadata = filteredPredictions.map(prediction => {
      const predictionUser = resolveUserForRow(prediction, userMaps);
      const predictionUserId = predictionUser ? String(predictionUser.user_id) : null;

      return {
        ...prediction,
        user_id: predictionUserId || prediction.user_id || null,
        username: predictionUser?.username || prediction.username || 'Unknown',
        is_bot: Boolean(predictionUser?.is_bot),
        playercard: predictionUser?.playercards || null,
        avatar_config: predictionUser?.avatar_config || null,
        rank: predictionUserId ? (rankMap.get(predictionUserId) || null) : null
      };
    });

    res.status(200).json(predictionsWithMetadata);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'API is running' });
});

app.get('/utils/image-proxy', imageProxyRateLimit, async (req, res) => {
  const rawUrl = (req.query.url || '').toString();
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing required query parameter: url' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid url parameter' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'Only http and https URLs are allowed' });
  }

  if (!isImageProxyHostAllowed(parsedUrl.hostname)) {
    return res.status(403).json({ error: 'Image host is not allowed' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const upstreamResponse = await fetchAllowedImage(parsedUrl.toString(), {
      signal: controller.signal,
    });

    if (!upstreamResponse.ok) {
      return res.status(502).json({ error: `Upstream image request failed (${upstreamResponse.status})` });
    }

    const contentType = upstreamResponse.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: 'Upstream resource is not an image' });
    }

    const contentLengthHeader = upstreamResponse.headers.get('content-length');
    const contentLength = Number.parseInt(contentLengthHeader || '', 10);
    if (Number.isFinite(contentLength) && contentLength > IMAGE_PROXY_MAX_BYTES) {
      return res.status(413).json({ error: 'Upstream image is too large to proxy' });
    }

    const cacheControl = upstreamResponse.headers.get('cache-control') || '';
    res.set('Content-Type', contentType);
    res.set(
      'Cache-Control',
      cacheControl && !cacheControl.includes('private')
        ? cacheControl
        : 'public, max-age=86400, stale-while-revalidate=604800'
    );

    const imageBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    if (imageBuffer.length > IMAGE_PROXY_MAX_BYTES) {
      return res.status(413).json({ error: 'Upstream image is too large to proxy' });
    }

    return res.status(200).send(imageBuffer);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Timed out while fetching image' });
    }
    console.error('Error in GET /utils/image-proxy:', error);
    return res.status(502).json({ error: 'Failed to fetch image' });
  } finally {
    clearTimeout(timeoutId);
  }
});

// Cancel a fight
app.post('/ufc_full_fight_card/:id/cancel', requireAdminSession, async (req, res) => {
  try {
    const { id } = req.params;

    debugLog('Received request to cancel fight:', { id });

    // Update the fight status to "Canceled" in ufc_full_fight_card
    const { error: updateError } = await supabase
      .from('ufc_full_fight_card')
      .update({ FightStatus: 'Canceled' })
      .eq('FightId', id);

    if (updateError) {
      console.error('Error updating fight status:', updateError);
      return res.status(500).json({ error: 'Failed to cancel fight' });
    }

    // Clear any existing fight result since the fight is canceled
    const { error: deleteResultError } = await supabase
      .from('fight_results')
      .delete()
      .eq('fight_id', id);

    if (deleteResultError) {
      console.error('Error clearing fight result:', deleteResultError);
      // Don't fail the request if this fails, just log it
    }

    // Clear any prediction results for this fight
    const { error: deletePredictionResultsError } = await supabase
      .from('prediction_results')
      .delete()
      .eq('fight_id', id);

    if (deletePredictionResultsError) {
      console.error('Error clearing prediction results:', deletePredictionResultsError);
      // Don't fail the request if this fails, just log it
    }

    // Get the updated fight data to return
    const { data: fightData, error: getFightError } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_FIGHT_SELECT)
      .eq('FightId', id);

    if (getFightError) {
      console.error('Error fetching updated fight data:', getFightError);
      return res.status(500).json({ error: 'Failed to fetch updated fight data' });
    }

    if (!fightData || fightData.length === 0) {
      return res.status(404).json({ error: 'Fight not found' });
    }

    // Get the event_id and fighter IDs
    const event_id = fightData[0].EventId;
    const redFighter = fightData.find(f => f.Corner === 'Red');
    const blueFighter = fightData.find(f => f.Corner === 'Blue');

    if (!redFighter || !blueFighter) {
      return res.status(404).json({ error: 'Missing fighter data' });
    }

    const weightclassMap = await getWeightclassMapping();
    const transformedFight = buildFightResponse({
      fightId: id,
      eventId: event_id,
      redFighter,
      blueFighter,
      result: null,
      weightclassMap,
      overrides: {
        winner: null,
        is_completed: false,
        is_canceled: true,
        fight_status: 'Canceled',
      },
    });

    await logAdminAction(req, {
      action: 'fight.cancel',
      status: 'success',
      targetType: 'fight',
      targetId: id,
      eventId: event_id,
      metadata: {
        fight_id: id,
        event_id,
        fight_status: 'Canceled',
      },
    });

    res.json(transformedFight);
  } catch (error) {
    console.error('Error canceling fight:', error);
    await logAdminAction(req, {
      action: 'fight.cancel',
      status: 'error',
      targetType: 'fight',
      targetId: req.params.id,
      metadata: {
        message: error.message,
      },
    });
    res.status(500).json({ error: 'Failed to cancel fight' });
  }
});

app.post('/ufc_full_fight_card/:id/result', requireAdminSession, async (req, res) => {
  try {
    const { id } = req.params;
    const { winner, result_type: requestedResultType } = req.body;

    debugLog('Received request to update fight result:', {
      id,
      idType: typeof id,
      idLength: id.length,
      winner,
      winnerType: typeof winner,
      requestedResultType,
    });

    // First get the fight data to get the event_id and fighter IDs
    const { data: fightData, error: getFightError } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_FIGHT_SELECT)
      .eq('FightId', id);

    if (getFightError) {
      console.error('Error fetching fight data:', getFightError);
      return res.status(500).json({ error: 'Failed to fetch fight data' });
    }

    if (!fightData || fightData.length === 0) {
      return res.status(404).json({ error: 'Fight not found' });
    }

    // Get the event_id and fighter IDs
    const event_id = fightData[0].EventId;
    const redFighter = fightData.find(f => f.Corner === 'Red');
    const blueFighter = fightData.find(f => f.Corner === 'Blue');

    if (!redFighter || !blueFighter) {
      return res.status(404).json({ error: 'Missing fighter data' });
    }

    const inferredResultType = requestedResultType
      || (winner !== null && winner !== undefined && winner !== '' ? 'winner' : null);
    if (inferredResultType !== null && !['winner', 'draw', 'no_contest'].includes(inferredResultType)) {
      return res.status(400).json({ error: 'Result type must be winner, draw, or no_contest' });
    }

    if (inferredResultType !== 'winner' && winner !== null && winner !== undefined && winner !== '') {
      return res.status(400).json({ error: 'Draw and no contest results cannot include a winner' });
    }

    // Determine the winner's fighter_id for winner outcomes.
    let winner_id = null;
    if (inferredResultType === 'winner') {
      if (winner === null || winner === undefined || winner === '') {
        return res.status(400).json({ error: 'Winner id is required for a winner result' });
      }
      winner_id = Number(winner);
      if (!Number.isFinite(winner_id)) {
        return res.status(400).json({ error: 'Invalid winner id' });
      }

      const validWinnerIds = new Set([
        Number(redFighter.FighterId),
        Number(blueFighter.FighterId),
      ]);
      if (!validWinnerIds.has(winner_id)) {
        return res.status(400).json({ error: 'Winner must be one of the fight-card fighters' });
      }
    }

    const { data: existingResult, error: existingResultError } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed, result_type')
      .eq('fight_id', id)
      .maybeSingle();

    if (existingResultError) {
      console.error('Error fetching existing fight result:', existingResultError);
      return res.status(500).json({ error: 'Failed to fetch existing fight result' });
    }

    const isCompleted = inferredResultType !== null;

    // Store the completed outcome; neutral outcomes intentionally have no fighter_id.
    const { error: updateError } = await supabase
      .from('fight_results')
      .upsert([
        {
          fight_id: id,
          fighter_id: winner_id,
          is_completed: isCompleted,
          result_type: inferredResultType,
        }
      ], {
        onConflict: ['fight_id']
      });

    if (updateError) {
      console.error('Error updating fight result:', updateError);
      return res.status(500).json({ error: 'Failed to update fight result' });
    }

    let fighterStreakSync = {
      skipped: true,
      reason: 'Fight result did not change',
      updates: [],
    };
    const previousWinnerId = existingResult?.is_completed && existingResult?.fighter_id !== null
      ? Number(existingResult.fighter_id)
      : null;
    const previousResultType = existingResult?.result_type
      || (previousWinnerId !== null ? 'winner' : null);
    const resultChanged = previousWinnerId !== winner_id
      || previousResultType !== inferredResultType
      || Boolean(existingResult?.is_completed) !== isCompleted;

    if (resultChanged) {
      try {
        fighterStreakSync = await updateFighterStreaksForFightResult({
          fightId: id,
          winnerId: winner_id,
        });
      } catch (fighterStreakError) {
        console.error('Error updating fighter streaks from fight result:', fighterStreakError);
        return res.status(500).json({ error: 'Failed to update fighter streaks' });
      }
    }

    try {
      const recalculatedResults = await recalculatePredictionResultsForEvent(event_id);
      debugLog('Recalculated prediction results for event:', {
        event_id,
        updated_fight_id: id,
        winner_id,
        result_type: inferredResultType,
        rowCount: recalculatedResults.rowCount,
      });
    } catch (predictionResultsError) {
      console.error('Error recalculating prediction results:', predictionResultsError);
      return res.status(500).json({ error: 'Failed to update prediction results' });
    }

    // Get the updated fight result
    const { data: updatedResult, error: getResultError } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed, result_type')
      .eq('fight_id', id)
      .single();

    if (getResultError) {
      console.error('Error fetching updated fight result:', getResultError);
      return res.status(500).json({ error: 'Failed to fetch updated fight result' });
    }

    const weightclassMap = await getWeightclassMapping();
    const transformedFight = buildFightResponse({
      fightId: id,
      eventId: event_id,
      redFighter,
      blueFighter,
      result: updatedResult,
      weightclassMap,
    });
    transformedFight.fighterStreakSync = fighterStreakSync;

    await logAdminAction(req, {
      action: 'fight.result.set',
      status: 'success',
      targetType: 'fight',
      targetId: id,
      eventId: event_id,
      metadata: {
        fight_id: id,
        event_id,
        winner_id,
        result_type: inferredResultType,
        is_completed: isCompleted,
        fighter_streak_sync: fighterStreakSync,
      },
    });

    res.json(transformedFight);
  } catch (error) {
    console.error('Error updating fight result:', error);
    await logAdminAction(req, {
      action: 'fight.result.set',
      status: 'error',
      targetType: 'fight',
      targetId: req.params.id,
      metadata: {
        message: error.message,
      },
    });
    res.status(500).json({ error: 'Failed to update fight result' });
  }
});

// Helper function to calculate user's current streak
function calculateUserStreak(userResults) {
  // Need at least 2 predictions to have a streak
  if (!userResults || userResults.length < 2) {
    return null;
  }

  // Sort by created_at DESC (most recent first)
  const sortedResults = [...userResults].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );

  // Start with the most recent prediction
  const mostRecent = sortedResults[0];
  const streakType = mostRecent.predicted_correctly ? 'win' : 'loss';
  let streakCount = 1;

  // Count consecutive predictions of the same type
  for (let i = 1; i < sortedResults.length; i++) {
    const currentPrediction = sortedResults[i];
    const isWin = currentPrediction.predicted_correctly;
    
    if ((streakType === 'win' && isWin) || (streakType === 'loss' && !isWin)) {
      streakCount++;
    } else {
      // Streak broken
      break;
    }
  }

  // Only return streak if count >= 2
  if (streakCount < 2) {
    return null;
  }

  // Debug logging for Breachey
  const username = userResults[0]?.username || sortedResults[0]?.user_id;
  const usernameStr = username != null ? String(username).toLowerCase() : '';
  if (usernameStr && (usernameStr.includes('breachey') || usernameStr.includes('breach'))) {
    debugLog('DEBUG Streak for', username, ':', {
      type: streakType,
      count: streakCount,
      totalResults: sortedResults.length,
      recentPredictions: sortedResults.slice(0, 5).map(r => ({
        predicted_correctly: r.predicted_correctly,
        created_at: r.created_at,
        fight_id: r.fight_id
      }))
    });
  }

  return {
    type: streakType,
    count: streakCount
  };
}

// Calculates the longest win streak from an ordered prediction result list.
function calculateLongestWinStreak(orderedResults) {
  if (!orderedResults || orderedResults.length === 0) {
    return 0;
  }

  let current = 0;
  let longest = 0;
  orderedResults.forEach(result => {
    if (result.predicted_correctly) {
      current += 1;
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 0;
    }
  });

  return longest;
}

function compareLeaderboardEntries(a, b) {
  return (
    (Number(b.total_points) || 0) - (Number(a.total_points) || 0) ||
    (Number(b.correct_predictions) || 0) - (Number(a.correct_predictions) || 0) ||
    parseFloat(b.accuracy || 0) - parseFloat(a.accuracy || 0)
  );
}

function normalizeEventIdValue(eventId) {
  const numericEventId = Number(eventId);
  return Number.isNaN(numericEventId) ? String(eventId) : numericEventId;
}

function buildRankMap(entries) {
  const rankMap = new Map();
  [...(entries || [])].sort(compareLeaderboardEntries).forEach((entry, index) => {
    rankMap.set(String(entry.user_id), index + 1);
  });
  return rankMap;
}

function buildPointChangeMap(results, referenceEventId) {
  const pointChangeMap = new Map();
  if (!referenceEventId) {
    return pointChangeMap;
  }

  const referenceEventIdStr = String(referenceEventId);
  (results || []).forEach(result => {
    if (String(result.event_id) !== referenceEventIdStr) {
      return;
    }
    const userIdStr = String(result.user_id);
    pointChangeMap.set(userIdStr, (pointChangeMap.get(userIdStr) || 0) + (Number(result.points) || 0));
  });
  return pointChangeMap;
}

function buildLeaderboardFromResults(results, userCache) {
  const { userIdToUsername, userIdToIsBot, userIdToPlayercard, userIdToAvatarConfig } = userCache;
  const userStats = {};

  (results || []).forEach(result => {
    const userIdStr = String(result.user_id);
    if (!userStats[userIdStr]) {
      userStats[userIdStr] = {
        user_id: userIdStr,
        username: userIdToUsername.get(userIdStr) || 'Unknown',
        is_bot: userIdToIsBot.get(userIdStr) || false,
        playercard: userIdToPlayercard.get(userIdStr) || null,
        avatar_config: userIdToAvatarConfig.get(userIdStr) || null,
        total_predictions: 0,
        correct_predictions: 0,
        total_points: 0,
        event_ids: new Set()
      };
    }
    userStats[userIdStr].total_predictions++;
    userStats[userIdStr].event_ids.add(String(result.event_id));
    if (result.predicted_correctly) {
      userStats[userIdStr].correct_predictions++;
    }
    userStats[userIdStr].total_points += (Number(result.points) || 0);
  });

  return Object.values(userStats)
    .map(user => {
      const { event_ids, ...entry } = user;
      return {
        ...entry,
        events_played: event_ids?.size || 0,
        accuracy: user.total_predictions > 0
          ? ((user.correct_predictions / user.total_predictions) * 100).toFixed(2)
          : '0.00',
        total_points: user.total_points,
      };
    })
    .sort(compareLeaderboardEntries);
}

function addLeaderboardDeltas(leaderboard, baselineLeaderboard, referenceResults, referenceEventId) {
  const currentRankMap = buildRankMap(leaderboard);
  const baselineRankMap = buildRankMap(baselineLeaderboard);
  const pointChangeMap = buildPointChangeMap(referenceResults, referenceEventId);
  const fallbackBaselineRank = (baselineLeaderboard || []).length + 1;

  return (leaderboard || []).map(entry => {
    const userIdStr = String(entry.user_id);
    const currentRank = currentRankMap.get(userIdStr);
    const baselineRank = baselineRankMap.get(userIdStr) || fallbackBaselineRank;
    const pointsChange = pointChangeMap.get(userIdStr) || 0;
    return {
      ...entry,
      rank_change: pointsChange !== 0 && currentRank ? baselineRank - currentRank : 0,
      points_change: pointsChange
    };
  });
}

function determineReferenceEventId(events, results, requestedEventId) {
  const resultEventIds = new Set((results || []).map(result => String(result.event_id)));

  if (requestedEventId && resultEventIds.has(String(requestedEventId))) {
    return normalizeEventIdValue(requestedEventId);
  }

  const eventsWithResults = (events || [])
    .filter(event => resultEventIds.has(String(event.id)))
    .sort((a, b) => {
      const aTime = a.date ? Date.parse(a.date) : Number.NEGATIVE_INFINITY;
      const bTime = b.date ? Date.parse(b.date) : Number.NEGATIVE_INFINITY;
      return bTime - aTime;
    });

  return eventsWithResults.length > 0
    ? normalizeEventIdValue(eventsWithResults[0].id)
    : null;
}

/**
 * Fetches all users along with their playercard metadata and returns lookup maps.
 */
async function fetchUsersWithPlayercards() {
  const users = await fetchAllUsers(`
    user_id,
    username,
    is_bot,
    avatar_config,
    selected_playercard_id,
    playercards!selected_playercard_id (
      id,
      name,
      image_url,
      category
    )
  `);
  const safeUsers = users || [];

  return {
    users: safeUsers,
    userIdToUsername: new Map(safeUsers.map(user => [String(user.user_id), user.username])),
    userIdToIsBot: new Map(safeUsers.map(user => [String(user.user_id), user.is_bot])),
    userIdToPlayercard: new Map(safeUsers.map(user => [String(user.user_id), user.playercards])),
    userIdToAvatarConfig: new Map(safeUsers.map(user => [String(user.user_id), user.avatar_config || null]))
  };
}

/**
 * Returns all leaderboard entries who share the top score (ties allowed).
 */
function determineEventWinners(sortedEntries) {
  if (!sortedEntries || sortedEntries.length === 0) {
    return [];
  }
  const topScore = sortedEntries[0].total_points;
  return sortedEntries.filter(entry => entry.total_points === topScore);
}

/**
 * Builds the per-event leaderboard and identifies winners.
 */
async function buildEventLeaderboard(eventId, { allTimeResults, userCache } = {}) {
  if (!eventId) {
    throw new Error('eventId is required to build leaderboard');
  }

  const eventIdFilter = normalizeEventIdValue(eventId);
  const effectiveUserCache = userCache || await fetchUsersWithPlayercards();
  const userIds = buildUserIdList(effectiveUserCache.users);

  if (userIds.length === 0) {
    return { leaderboard: [], winners: [] };
  }

  const eventResultsPromise = fetchAllFromSupabase(
    supabase
      .from('prediction_results')
      .select('fight_id, event_id, user_id, predicted_correctly, points')
      .eq('event_id', eventIdFilter)
      .in('user_id', userIds)
  );
  const allTimeResultsPromise = allTimeResults
    ? Promise.resolve(allTimeResults)
    : fetchAllFromSupabase(
        supabase
          .from('prediction_results')
          .select('user_id, event_id, predicted_correctly, points, created_at')
          .in('user_id', userIds)
      );
  const eventFightRowsPromise = fetchAllFromSupabase(
    supabase
      .from('ufc_full_fight_card')
      .select('FightId, FightOrder')
      .eq('EventId', eventIdFilter)
  );
  const [eventResults, effectiveAllTimeResults, eventFightRows] = await Promise.all([
    eventResultsPromise,
    allTimeResultsPromise,
    eventFightRowsPromise,
  ]);
  // Group all-time results by user for streak calculation
  const allTimeUserResultsMap = {};
  (effectiveAllTimeResults || []).forEach(result => {
    const userIdStr = String(result.user_id);
    if (!allTimeUserResultsMap[userIdStr]) {
      allTimeUserResultsMap[userIdStr] = [];
    }
    allTimeUserResultsMap[userIdStr].push(result);
  });

  let leaderboard = buildLeaderboardFromResults(eventResults, effectiveUserCache);
  leaderboard = leaderboard.map(entry => ({
    ...entry,
    streak: calculateUserStreak(allTimeUserResultsMap[String(entry.user_id)] || [])
  }));

  const latestCompletedFightId = findLatestCompletedFightId(eventResults, eventFightRows);
  const baselineLeaderboard = latestCompletedFightId
    ? buildLeaderboardFromResults(
        eventResults.filter(result => String(result.fight_id) !== latestCompletedFightId),
        effectiveUserCache
      )
    : [];
  leaderboard = addFightToFightRankChanges(leaderboard, baselineLeaderboard);

  const winners = determineEventWinners(leaderboard);

  return { leaderboard, winners };
}

/**
 * Returns a map of user_id -> number of event wins.
 * @param {Array|undefined} userIds - Optional array of user IDs to filter by
 * @param {number|undefined} year - Optional year to filter event wins by
 */
async function fetchEventWinCounts(userIds, year) {
  try {
    let query = supabase
      .from('event_winners')
      .select('user_id, event_id');

    if (Array.isArray(userIds)) {
      if (userIds.length === 0) {
        return {};
      }
      const uniqueIds = Array.from(new Set(userIds.map(id => String(id))));
      query = query.in('user_id', uniqueIds);
    }

    // If year is specified, we need to filter by event date
    // We'll fetch all winners first, then filter by year via events table
    const winners = await fetchAllFromSupabase(query);
    
    // If year is specified, filter winners by events from that year
    if (year !== undefined && winners && winners.length > 0) {
      const eventIds = [...new Set(winners.map(w => Number(w.event_id)))];
      const eventsQuery = supabase
        .from('events')
        .select('id')
        .in('id', eventIds)
        .gte('date', `${year}-01-01`)
        .lt('date', `${year + 1}-01-01`);
      const eventsForYear = await fetchAllFromSupabase(eventsQuery);
      const eventIdsForYear = new Set((eventsForYear || []).map(e => Number(e.id)));
      
      // Filter winners to only those from events in the specified year
      const filteredWinners = winners.filter(w => eventIdsForYear.has(Number(w.event_id)));
      
      const counts = {};
      filteredWinners.forEach(row => {
        const key = String(row.user_id);
        counts[key] = (counts[key] || 0) + 1;
      });
      return counts;
    }
    
    // No year filter - count all wins
    const counts = {};
    (winners || []).forEach(row => {
      const key = String(row.user_id);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  } catch (error) {
    console.error('Error fetching event win counts:', error);
    return {};
  }
}

/**
 * Applies prepared crown counts to leaderboard entries.
 */
function addEventWinCounts(entries, countsMap, fieldName = 'event_win_count') {
  if (!entries || entries.length === 0) {
    return entries;
  }
  return entries.map(entry => ({
    ...entry,
    [fieldName]: countsMap[String(entry.user_id)] || 0
  }));
}

/**
 * Returns a map of user_id -> number of event wins among humans only.
 * @param {Array|undefined} userIds - Optional array of user IDs to filter by
 * @param {number|undefined} year - Optional year to filter event wins by
 * @param {object|null} userCache - Optional existing user metadata cache
 */
async function fetchHumanEventWinCounts(userIds, year, userCache = null) {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return {};
    }

    const uniqueIds = Array.from(new Set(userIds.map(id => String(id))));
    if (uniqueIds.length === 0) {
      return {};
    }

    let eventsQuery = supabase
      .from('events')
      .select('id, date, is_completed')
      .eq('is_completed', true);

    if (year !== undefined) {
      eventsQuery = eventsQuery
        .gte('date', `${year}-01-01`)
        .lt('date', `${year + 1}-01-01`);
    }

    const usersPromise = userCache?.userIdToIsBot
      ? Promise.resolve(null)
      : fetchAllFromSupabase(
          supabase
            .from('users')
            .select('user_id, is_bot')
            .in('user_id', uniqueIds)
        );
    const [users, events] = await Promise.all([
      usersPromise,
      fetchAllFromSupabase(eventsQuery),
    ]);
    const humanUserIds = userCache?.userIdToIsBot
      ? uniqueIds.filter(userId => !userCache.userIdToIsBot.get(String(userId)))
      : (users || [])
          .filter(user => !user.is_bot)
          .map(user => String(user.user_id));

    if (humanUserIds.length === 0) {
      return {};
    }

    const eventIds = (events || [])
      .map(event => String(event.id))
      .filter(Boolean);

    if (eventIds.length === 0) {
      return {};
    }

    const resultsQuery = supabase
      .from('prediction_results')
      .select('event_id, user_id, points')
      .in('user_id', humanUserIds)
      .in('event_id', eventIds);
    const results = await fetchAllFromSupabase(resultsQuery);

    if (!results || results.length === 0) {
      return {};
    }

    const eventUserPoints = new Map();
    results.forEach(result => {
      const eventIdStr = String(result.event_id);
      const userIdStr = String(result.user_id);
      if (!eventUserPoints.has(eventIdStr)) {
        eventUserPoints.set(eventIdStr, new Map());
      }
      const userPoints = eventUserPoints.get(eventIdStr);
      const current = userPoints.get(userIdStr) || 0;
      userPoints.set(userIdStr, current + (Number(result.points) || 0));
    });

    const counts = {};
    for (const userPoints of eventUserPoints.values()) {
      let topPoints = null;
      for (const points of userPoints.values()) {
        if (topPoints === null || points > topPoints) {
          topPoints = points;
        }
      }
      if (topPoints === null) {
        continue;
      }
      for (const [userIdStr, points] of userPoints.entries()) {
        if (points === topPoints) {
          counts[userIdStr] = (counts[userIdStr] || 0) + 1;
        }
      }
    }

    return counts;
  } catch (error) {
    console.error('Error fetching human event win counts:', error);
    return {};
  }
}

// Get overall leaderboard
app.get('/leaderboard', async (req, res) => {
  try {
    const userCache = await fetchUsersWithPlayercards();
    const userIds = buildUserIdList(userCache.users);

    if (userIds.length === 0) {
      return res.json([]);
    }

    // Get all prediction results using the pagination helper
    const resultsQuery = supabase
      .from('prediction_results')
      .select('user_id, event_id, predicted_correctly, points, created_at')
      .in('user_id', userIds);
    const results = await fetchAllFromSupabase(resultsQuery);

    // Map user_id to username, is_bot, and playercard info
    const { userIdToUsername, userIdToIsBot, userIdToPlayercard, userIdToAvatarConfig } = userCache;

    // Group results by user for streak calculation
    const userResultsMap = {};
    results.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!userResultsMap[userIdStr]) {
        userResultsMap[userIdStr] = [];
      }
      userResultsMap[userIdStr].push(result);
    });

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!userStats[userIdStr]) {
        userStats[userIdStr] = {
          user_id: userIdStr,
          username: userIdToUsername.get(userIdStr) || 'Unknown',
          is_bot: userIdToIsBot.get(userIdStr) || false,
          playercard: userIdToPlayercard.get(userIdStr) || null,
          avatar_config: userIdToAvatarConfig.get(userIdStr) || null,
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0,
          event_ids: new Set()
        };
      }
      userStats[userIdStr].total_predictions++;
      userStats[userIdStr].event_ids.add(String(result.event_id));
      if (result.predicted_correctly) {
        userStats[userIdStr].correct_predictions++;
      }
      // Directly sum the points from the table
      userStats[userIdStr].total_points += (result.points || 0);
    });

    // Calculate streak for each user
    Object.keys(userStats).forEach(userIdStr => {
      const userResults = userResultsMap[userIdStr];
      const username = userIdToUsername.get(userIdStr);
      const streak = calculateUserStreak(userResults);
      userStats[userIdStr].streak = streak;
      
      // Debug logging
      if (username && (username.toLowerCase().includes('breachey') || username.toLowerCase().includes('breach'))) {
        debugLog('LEADERBOARD DEBUG - Overall:', {
          username,
          user_id: userIdStr,
          streak,
          totalResults: userResults?.length,
          results: userResults
        });
      }
    });

    // Convert to array and sort to get rankings
    let leaderboard = Object.values(userStats)
      .map(user => {
        const { event_ids, ...entry } = user;
        return {
          ...entry,
          events_played: event_ids?.size || 0,
          accuracy: ((user.correct_predictions / user.total_predictions) * 100).toFixed(2),
          total_points: user.total_points,
        };
      })
      .sort((a, b) =>
        b.total_points - a.total_points ||
        b.correct_predictions - a.correct_predictions ||
        parseFloat(b.accuracy) - parseFloat(a.accuracy)
      );
    const eventWinCounts = await fetchEventWinCounts(leaderboard.map(user => user.user_id));
    const humanEventWinCounts = await fetchHumanEventWinCounts(leaderboard.map(user => user.user_id));
    leaderboard = addEventWinCounts(leaderboard, eventWinCounts);
    leaderboard = addEventWinCounts(leaderboard, humanEventWinCounts, 'event_win_count_human');
    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing leaderboard:', error);
    res.status(500).json({ error: 'Failed to process leaderboard' });
  }
});

// Get 2025 season leaderboard
app.get('/leaderboard/2025', async (req, res) => {
  try {
    const userCache = await fetchUsersWithPlayercards();
    const userIds = buildUserIdList(userCache.users);

    if (userIds.length === 0) {
      return res.json([]);
    }

    // Get all events from 2025
    const events2025Query = supabase
      .from('events')
      .select('id')
      .gte('date', '2025-01-01')
      .lt('date', '2026-01-01');
    const events2025 = await fetchAllFromSupabase(events2025Query);
    const eventIds2025 = new Set((events2025 || []).map(e => Number(e.id)));

    // Get all prediction results for 2025 events
    const allResultsQuery = supabase
      .from('prediction_results')
      .select('user_id, event_id, predicted_correctly, points')
      .in('user_id', userIds);
    const allResults = await fetchAllFromSupabase(allResultsQuery);
    
    // Filter results to only 2025 events
    const results = (allResults || []).filter(result => {
      const eventId = Number(result.event_id);
      return eventIds2025.has(eventId);
    });

    // Get all-time prediction results for streak calculation (streaks continue from past)
    const allTimeResults = await fetchAllFromSupabase(
      supabase
        .from('prediction_results')
        .select('user_id, predicted_correctly, created_at')
        .in('user_id', userIds)
    );

    // Map user_id to username, is_bot, and playercard info
    const { userIdToUsername, userIdToIsBot, userIdToPlayercard, userIdToAvatarConfig } = userCache;

    // Group all-time results by user for streak calculation
    const allTimeUserResultsMap = {};
    (allTimeResults || []).forEach(result => {
      const userIdStr = String(result.user_id);
      if (!allTimeUserResultsMap[userIdStr]) {
        allTimeUserResultsMap[userIdStr] = [];
      }
      allTimeUserResultsMap[userIdStr].push(result);
    });

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!userStats[userIdStr]) {
        userStats[userIdStr] = {
          user_id: userIdStr,
          username: userIdToUsername.get(userIdStr) || 'Unknown',
          is_bot: userIdToIsBot.get(userIdStr) || false,
          playercard: userIdToPlayercard.get(userIdStr) || null,
          avatar_config: userIdToAvatarConfig.get(userIdStr) || null,
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0,
          event_ids: new Set()
        };
      }
      userStats[userIdStr].total_predictions++;
      userStats[userIdStr].event_ids.add(String(result.event_id));
      if (result.predicted_correctly) {
        userStats[userIdStr].correct_predictions++;
      }
      userStats[userIdStr].total_points += (result.points || 0);
    });

    // Calculate all-time streak for each user
    Object.keys(userStats).forEach(userIdStr => {
      const allTimeUserResults = allTimeUserResultsMap[userIdStr] || [];
      userStats[userIdStr].streak = calculateUserStreak(allTimeUserResults);
    });

    // Convert to array and calculate accuracy
    let leaderboard = Object.values(userStats)
      .map(user => {
        const { event_ids, ...entry } = user;
        return {
          ...entry,
          events_played: event_ids?.size || 0,
          accuracy: ((user.correct_predictions / user.total_predictions) * 100).toFixed(2),
          total_points: user.total_points,
        };
      })
      .sort((a, b) =>
        b.total_points - a.total_points ||
        b.correct_predictions - a.correct_predictions ||
        parseFloat(b.accuracy) - parseFloat(a.accuracy)
      );

    // Get event win counts for 2025 events only
    const eventWinCounts2025 = await fetchEventWinCounts(leaderboard.map(user => user.user_id), 2025);
    const humanEventWinCounts2025 = await fetchHumanEventWinCounts(leaderboard.map(user => user.user_id), 2025);
    leaderboard = addEventWinCounts(leaderboard, eventWinCounts2025);
    leaderboard = addEventWinCounts(leaderboard, humanEventWinCounts2025, 'event_win_count_human');

    // Mark season winner (user with highest points from 2025)
    if (leaderboard.length > 0) {
      const topPoints = leaderboard[0].total_points;
      leaderboard.forEach(entry => {
        entry.season_2025_winner = entry.total_points === topPoints && topPoints > 0;
      });
    }

    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing 2025 leaderboard:', error);
    res.status(500).json({ error: 'Failed to process 2025 leaderboard' });
  }
});

// Get current season (current year) leaderboard
app.get('/leaderboard/season', async (req, res) => {
  try {
    const userCache = await fetchUsersWithPlayercards();
    const userIds = buildUserIdList(userCache.users);

    if (userIds.length === 0) {
      return res.json([]);
    }

    const currentYear = new Date().getFullYear();
    const seasonStart = `${currentYear}-01-01`;
    const nextSeasonStart = `${currentYear + 1}-01-01`;

    // Get all events from current year
    const seasonEventsQuery = supabase
      .from('events')
      .select('id, date')
      .gte('date', seasonStart)
      .lt('date', nextSeasonStart);
    const seasonEvents = await fetchAllFromSupabase(seasonEventsQuery);
    const seasonEventIds = new Set((seasonEvents || []).map(e => String(e.id)));

    // Get all prediction results for current year events
    const allResultsQuery = supabase
      .from('prediction_results')
      .select('user_id, event_id, predicted_correctly, points')
      .in('user_id', userIds);
    const allResults = await fetchAllFromSupabase(allResultsQuery);
    
    // Filter results to only current year events
    const results = (allResults || []).filter(result => {
      return seasonEventIds.has(String(result.event_id));
    });

    // Get all-time prediction results for streak calculation (streaks continue from past)
    const allTimeResults = await fetchAllFromSupabase(
      supabase
        .from('prediction_results')
        .select('user_id, predicted_correctly, created_at')
        .in('user_id', userIds)
    );

    // Group all-time results by user for streak calculation
    const allTimeUserResultsMap = {};
    (allTimeResults || []).forEach(result => {
      const userIdStr = String(result.user_id);
      if (!allTimeUserResultsMap[userIdStr]) {
        allTimeUserResultsMap[userIdStr] = [];
      }
      allTimeUserResultsMap[userIdStr].push(result);
    });

    const requestedReferenceEventId = req.query.reference_event_id
      ? normalizeEventIdValue(req.query.reference_event_id)
      : null;
    const referenceEventId = determineReferenceEventId(seasonEvents, results, requestedReferenceEventId);

    // Convert to array and calculate accuracy
    let leaderboard = buildLeaderboardFromResults(results, userCache)
      .map(entry => ({
        ...entry,
        streak: calculateUserStreak(allTimeUserResultsMap[String(entry.user_id)] || [])
      }));
    const baselineLeaderboard = referenceEventId
      ? buildLeaderboardFromResults(
        results.filter(result => String(result.event_id) !== String(referenceEventId)),
        userCache
      )
      : [];
    leaderboard = addLeaderboardDeltas(leaderboard, baselineLeaderboard, results, referenceEventId);

    const eventWinCounts = await fetchEventWinCounts(leaderboard.map(user => user.user_id), currentYear);
    const humanEventWinCounts = await fetchHumanEventWinCounts(leaderboard.map(user => user.user_id), currentYear);
    leaderboard = addEventWinCounts(leaderboard, eventWinCounts);
    leaderboard = addEventWinCounts(leaderboard, humanEventWinCounts, 'event_win_count_human');

    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing season leaderboard:', error);
    res.status(500).json({ error: 'Failed to process season leaderboard' });
  }
});

// Get monthly leaderboard
app.get('/leaderboard/monthly', async (req, res) => {
  try {
    res.set('Deprecation', 'true');
    const userCache = await fetchUsersWithPlayercards();
    const userIds = buildUserIdList(userCache.users);

    if (userIds.length === 0) {
      return res.json([]);
    }

    // Get the first and last day of the current month in ISO format
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstDayISO = firstDay.toISOString();
    const nextMonthISO = nextMonth.toISOString();

    // Get all prediction results for the current month using the pagination helper
    const resultsQuery = supabase
      .from('prediction_results')
      .select('user_id, predicted_correctly, points, created_at')
      .gte('created_at', firstDayISO)
      .lt('created_at', nextMonthISO)
      .in('user_id', userIds);
    const results = await fetchAllFromSupabase(resultsQuery);

    // Get all-time prediction results for streak calculation
    const allTimeResultsQuery = supabase
      .from('prediction_results')
      .select('user_id, predicted_correctly, created_at')
      .in('user_id', userIds);
    const allTimeResults = await fetchAllFromSupabase(allTimeResultsQuery);

    // Map user_id to username, is_bot, and playercard info
    const { userIdToUsername, userIdToIsBot, userIdToPlayercard, userIdToAvatarConfig } = userCache;

    // Group all-time results by user for streak calculation
    const allTimeUserResultsMap = {};
    allTimeResults.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!allTimeUserResultsMap[userIdStr]) {
        allTimeUserResultsMap[userIdStr] = [];
      }
      allTimeUserResultsMap[userIdStr].push(result);
    });

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!userStats[userIdStr]) {
        userStats[userIdStr] = {
          user_id: userIdStr,
          username: userIdToUsername.get(userIdStr) || 'Unknown',
          is_bot: userIdToIsBot.get(userIdStr) || false,
          playercard: userIdToPlayercard.get(userIdStr) || null,
          avatar_config: userIdToAvatarConfig.get(userIdStr) || null,
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0
        };
      }
      userStats[userIdStr].total_predictions++;
      if (result.predicted_correctly) {
        userStats[userIdStr].correct_predictions++;
      }
      // Directly sum the points from the table
      userStats[userIdStr].total_points += (result.points || 0);
    });

    // Calculate all-time streak for each user
    Object.keys(userStats).forEach(userIdStr => {
      const allTimeUserResults = allTimeUserResultsMap[userIdStr];
      userStats[userIdStr].streak = calculateUserStreak(allTimeUserResults);
    });

    // Convert to array and calculate accuracy
    let leaderboard = Object.values(userStats)
      .map(user => ({
        ...user,
        accuracy: ((user.correct_predictions / user.total_predictions) * 100).toFixed(2),
        total_points: user.total_points,
      }))
      .sort((a, b) =>
        b.total_points - a.total_points ||
        b.correct_predictions - a.correct_predictions ||
        parseFloat(b.accuracy) - parseFloat(a.accuracy)
      );
    const eventWinCounts = await fetchEventWinCounts(leaderboard.map(user => user.user_id));
    const humanEventWinCounts = await fetchHumanEventWinCounts(leaderboard.map(user => user.user_id));
    leaderboard = addEventWinCounts(leaderboard, eventWinCounts);
    leaderboard = addEventWinCounts(leaderboard, humanEventWinCounts, 'event_win_count_human');
    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing monthly leaderboard:', error);
    res.status(500).json({ error: 'Failed to process monthly leaderboard' });
  }
});

// Get all events
app.get('/events', async (req, res) => {
  try {
    debugLog('Attempting to fetch events from Supabase...');

    // Fetch events from the events table (this is the primary source now)
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('id, name, date, is_completed, image_url, venue, location_city, location_state, location_country')
      .order('date', { ascending: false });

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return res.status(500).json({ error: 'Failed to fetch events' });
    }

    if (!eventsData || eventsData.length === 0) {
      debugLog('No events found in events table');
      return res.status(404).json({ error: 'No events found' });
    }

    // Get unique EventIds from ufc_full_fight_card to check which events have fight data
    const { data: fightCardData, error: fightCardError } = await supabase
      .from('ufc_full_fight_card')
      .select('EventId, StartTime, CardSegment, CardSegmentStartTime')
      .order('EventId', { ascending: false });

    if (fightCardError) {
      console.error('Error fetching fight card data:', fightCardError);
      // Continue without fight data check - events will still be shown
    }

    // Create a set of EventIds that have fight data
    const eventIdsWithFights = new Set();
    const eventStartTimes = new Map();
    const eventCardStartTimes = new Map();
    if (fightCardData) {
      fightCardData.forEach(fight => {
        eventIdsWithFights.add(fight.EventId);

        const startTime = typeof fight.StartTime === 'string' ? fight.StartTime.trim() : '';
        if (!startTime) {
          return;
        }

        const existingStartTime = eventStartTimes.get(fight.EventId);
        if (!existingStartTime || Date.parse(startTime) < Date.parse(existingStartTime)) {
          eventStartTimes.set(fight.EventId, startTime);
        }

        const cardSegment = String(fight.CardSegment || '').trim().toLowerCase();
        const segmentKey = cardSegment === 'maincard' || cardSegment === 'main card'
          ? 'main_card'
          : cardSegment === 'prelims1' || cardSegment === 'prelims'
          ? 'prelims'
          : cardSegment === 'prelims2' || cardSegment === 'early prelims'
          ? 'early_prelims'
          : null;
        const segmentStart = typeof fight.CardSegmentStartTime === 'string'
          ? fight.CardSegmentStartTime.trim()
          : '';
        if (segmentKey && segmentStart) {
          const cardTimes = eventCardStartTimes.get(fight.EventId) || {};
          if (!cardTimes[segmentKey] || Date.parse(segmentStart) < Date.parse(cardTimes[segmentKey])) {
            cardTimes[segmentKey] = segmentStart;
            eventCardStartTimes.set(fight.EventId, cardTimes);
          }
        }
      });
    }

    debugLog(`Successfully fetched ${eventsData.length} events from events table`);
    debugLog(`Found ${eventIdsWithFights.size} events with fight data`);

    // Transform the data to match the expected structure
    const transformedEvents = eventsData.map(event => ({
      id: event.id,
      name: event.name,
      date: event.date,
      is_completed: event.is_completed,
      status: event.is_completed ? 'Complete' : 'Upcoming',
      venue: event.venue || null,
      location_city: event.location_city || null,
      location_state: event.location_state || null,
      location_country: event.location_country || null,
      start_time: eventStartTimes.get(event.id) || null,
      card_start_times: {
        early_prelims: eventCardStartTimes.get(event.id)?.early_prelims || null,
        prelims: eventCardStartTimes.get(event.id)?.prelims || null,
        main_card: eventCardStartTimes.get(event.id)?.main_card || eventStartTimes.get(event.id) || null,
      },
      image_url: event.image_url,
      has_fight_data: eventIdsWithFights.has(event.id) // Add flag to indicate if fights are available
    }));

    res.json(transformedEvents);
  } catch (error) {
    console.error('Unexpected error in GET /events:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/admin/events/discover-ufc', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const result = await runUfcEventDiscovery({
      repoRoot: REPO_ROOT,
      startId: req.body?.startId,
      endId: req.body?.endId,
      maxIds: req.body?.maxIds,
      stopAfterMisses: req.body?.stopAfterMisses,
      delaySeconds: req.body?.delaySeconds,
      tapologyDelaySeconds: req.body?.tapologyDelaySeconds,
      timeoutSeconds: req.body?.timeoutSeconds,
    });

    await logAdminAction(req, {
      action: 'events.discover_ufc',
      status: 'success',
      targetType: 'events',
      targetId: null,
      eventId: null,
      metadata: {
        startId: result.startId,
        endId: result.endId,
        scanned: result.scanned,
        apiEventsFound: result.api_events_found,
        eligibleEventsFound: result.eligible_events_found,
        filteredEvents: result.filtered_events,
        insertedCount: result.insertedCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount,
        posterCount: result.posterCount,
        posterErrorCount: result.posterErrors?.length || 0,
      },
    });

    return res.json(result);
  } catch (error) {
    console.error('Error discovering UFC events:', error);
    await logAdminAction(req, {
      action: 'events.discover_ufc',
      status: 'error',
      targetType: 'events',
      targetId: null,
      eventId: null,
      metadata: {
        message: error.message,
      },
    });
    return res.status(500).json({
      error: 'Failed to discover UFC events',
      details: error.message,
    });
  }
});

app.get('/events/:id/start-time', async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    res.set('Cache-Control', 'no-store');

    const { data, error } = await supabase
      .from('ufc_full_fight_card')
      .select('StartTime, CardSegment, CardSegmentStartTime')
      .eq('EventId', eventId)
      .order('CardSegmentStartTime', { ascending: true, nullsFirst: false })
      .order('StartTime', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error fetching event start time:', error);
      return res.status(500).json({ error: 'Failed to fetch event start time' });
    }

    const earliestStartTime = (data || []).reduce((earliest, row) => {
      const candidate = typeof row?.StartTime === 'string' ? row.StartTime.trim() : '';
      if (!candidate) return earliest;
      if (!earliest || Date.parse(candidate) < Date.parse(earliest)) {
        return candidate;
      }
      return earliest;
    }, null);

    const cardStartTimes = {
      early_prelims: null,
      prelims: null,
      main_card: null,
    };

    (data || []).forEach((row) => {
      const segment = typeof row?.CardSegment === 'string' ? row.CardSegment.trim() : '';
      const segmentStartTime = typeof row?.CardSegmentStartTime === 'string'
        ? row.CardSegmentStartTime.trim()
        : '';

      if (!segment || !segmentStartTime) {
        return;
      }

      let key = null;
      if (segment === 'Prelims2') {
        key = 'early_prelims';
      } else if (segment === 'Prelims1') {
        key = 'prelims';
      } else if (segment === 'Main') {
        key = 'main_card';
      }

      if (!key) {
        return;
      }

      if (!cardStartTimes[key] || Date.parse(segmentStartTime) < Date.parse(cardStartTimes[key])) {
        cardStartTimes[key] = segmentStartTime;
      }
    });

    return res.json({
      start_time: earliestStartTime,
      card_start_times: cardStartTimes,
    });
  } catch (error) {
    console.error('Unexpected error in GET /events/:id/start-time:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/admin/events/:id/fight-card/preview', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  let scraperOutput = null;

  try {
    const eventId = Number(req.params.id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    await cleanupExpiredFightCardPreviews();

    const [
      { data: eventRecord, error: eventError },
      { data: existingFightCardRows, error: existingFightCardError },
    ] = await Promise.all([
      supabase
        .from('events')
        .select('id, name, date, venue, location_city, location_state, location_country, image_url')
        .eq('id', eventId)
        .maybeSingle(),
      supabase
        .from('ufc_full_fight_card')
        .select('FightId, FighterId, Corner')
        .eq('EventId', eventId),
    ]);

    if (eventError) {
      console.error('Error fetching event for fight-card preview:', eventError);
      return res.status(500).json({ error: 'Failed to load event metadata' });
    }

    if (existingFightCardError) {
      console.error('Error fetching existing fight-card rows for preview:', existingFightCardError);
      return res.status(500).json({ error: 'Failed to load existing fight-card rows' });
    }

    const existingFightIds = Array.from(
      new Set((existingFightCardRows || []).map((row) => row.FightId).filter(Boolean))
    );

    let existingFightResults = [];
    if (existingFightIds.length > 0) {
      const { data, error } = await supabase
        .from('fight_results')
        .select('fight_id, fighter_id, is_completed, result_type')
        .in('fight_id', existingFightIds);

      if (error) {
        console.error('Error fetching existing fight results for preview:', error);
        return res.status(500).json({ error: 'Failed to load existing fight results' });
      }

      existingFightResults = data || [];
    }

    scraperOutput = await runFightCardScraper({
      eventId,
      repoRoot: REPO_ROOT,
    });

    const parsedCsv = await parseFightCardCsvFile(scraperOutput.csvPath);
    const preview = await buildFightCardPreview({
      eventId,
      csvPath: scraperOutput.csvPath,
      headers: parsedCsv.headers,
      rows: parsedCsv.rows,
      headerErrors: parsedCsv.headerErrors,
      eventRecord,
      existingFightCardRows,
      existingFightResults,
      scraperOutput,
    });
    preview.streakVerificationByFighterId = await loadStreakVerificationByFighterId(preview.rows);

    const { rows, ...previewSummary } = preview;

    if (preview.blockers.length > 0) {
      await logAdminAction(req, {
        action: 'fight_card.preview',
        status: 'error',
        targetType: 'event',
        targetId: eventId,
        eventId,
        metadata: {
          rowCount: preview.rowCount,
          fightCount: preview.fightCount,
          blockerCount: preview.blockers.length,
          blockers: preview.blockers,
          csvFileName: preview.csvFileName,
        },
      });
      await removePreviewAssets(scraperOutput.scratchDir);
      return res.json({
        ...previewSummary,
        previewToken: null,
        expiresAt: null,
      });
    }

    const storedPreview = await replaceFightCardPreview({
      ...preview,
      scratchDir: scraperOutput.scratchDir,
    });

    await logAdminAction(req, {
      action: 'fight_card.preview',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        rowCount: preview.rowCount,
        fightCount: preview.fightCount,
        warningCount: preview.warnings.length,
        warnings: preview.warnings,
        csvFileName: preview.csvFileName,
        changedFightCard: preview.changedFightCard,
        existingFightCardRowCount: preview.existingFightCardRowCount,
        existingFightResultCount: preview.existingFightResultCount,
      },
    });

    return res.json({
      ...previewSummary,
      previewToken: storedPreview.previewToken,
      expiresAt: storedPreview.expiresAt,
    });
  } catch (error) {
    if (scraperOutput?.scratchDir) {
      await removePreviewAssets(scraperOutput.scratchDir);
    }

    console.error('Error building fight-card preview:', error);
    await logAdminAction(req, {
      action: 'fight_card.preview',
      status: 'error',
      targetType: 'event',
      targetId: req.params.id,
      eventId: Number(req.params.id),
      metadata: {
        message: error.message,
      },
    });
    return res.status(500).json({
      error: 'Failed to build fight-card preview',
      details: error.message,
    });
  }
});

app.post('/admin/events/:id/fight-card/preview/:previewToken/progress', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    const previewToken = String(req.params.previewToken || '').trim();
    if (Number.isNaN(eventId) || !previewToken) {
      return res.status(400).json({ error: 'Invalid event id or preview token' });
    }

    await cleanupExpiredFightCardPreviews();
    const result = saveFightCardPreviewProgress(
      previewToken,
      eventId,
      req.body?.manualRowUpdates
    );
    if (!result) {
      return res.status(404).json({ error: 'Preview token was not found or has expired' });
    }

    const persistence = await persistImportedFightCardPreviewUpdates({
      eventId,
      preview: result.preview,
      manualRowUpdates: req.body?.manualRowUpdates,
    });
    const verifiedStreaks = await persistManualStreakAnchors({
      eventId,
      preview: result.preview,
      manualRowUpdates: req.body?.manualRowUpdates,
    });
    result.preview.streakVerificationByFighterId = {
      ...(result.preview.streakVerificationByFighterId || {}),
      ...verifiedStreaks,
    };

    const { rows, scratchDir, ...previewSummary } = result.preview;
    await logAdminAction(req, {
      action: 'fight_card.preview.save_progress',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        applied_manual_update_count: result.appliedManualUpdateCount,
        updated_fight_card_rows: persistence.updatedFightCardRows,
        updated_fighters: persistence.updatedFighters,
        verified_streaks: Object.keys(verifiedStreaks).length,
      },
    });

    return res.json({
      ...previewSummary,
      appliedManualUpdateCount: result.appliedManualUpdateCount,
      verifiedStreakCount: Object.keys(verifiedStreaks).length,
      ...persistence,
    });
  } catch (error) {
    console.error('Error saving fight-card preview progress:', error);
    return res.status(500).json({
      error: 'Failed to save fight-card preview progress',
      details: error.message,
    });
  }
});

app.post('/admin/events/:id/fight-card/preview/:previewToken/verify-streak', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    const previewToken = String(req.params.previewToken || '').trim();
    const rowKey = String(req.body?.rowKey || '').trim();
    const normalizedStreak = normalizeAdminStatValue('Streak', req.body?.streak);
    if (Number.isNaN(eventId) || !previewToken || !rowKey) {
      return res.status(400).json({ error: 'Invalid event id, preview token, or fighter row' });
    }
    if (!normalizedStreak.ok || normalizedStreak.value === null) {
      return res.status(400).json({ error: normalizedStreak.error || 'Enter a streak before verifying it' });
    }

    await cleanupExpiredFightCardPreviews();
    const preview = getFightCardPreview(previewToken, eventId);
    if (!preview) {
      return res.status(404).json({ error: 'Preview token was not found or has expired' });
    }
    const row = (preview.rows || []).find(
      (candidate) => buildFightCardPreviewRowKey(candidate) === rowKey
    );
    if (!row) {
      return res.status(404).json({ error: 'Fighter row was not found in this preview' });
    }

    const progress = saveFightCardPreviewProgress(previewToken, eventId, {
      [rowKey]: { Streak: normalizedStreak.value },
    });
    if (!progress) {
      return res.status(404).json({ error: 'Preview token was not found or has expired' });
    }
    const persistence = await persistImportedFightCardPreviewUpdates({
      eventId,
      preview: progress.preview,
      manualRowUpdates: { [rowKey]: { Streak: normalizedStreak.value } },
      updateFighterProfiles: false,
    });
    const streakVerification = await persistVerifiedStreakAnchor({
      row: { ...row, Streak: normalizedStreak.value },
      eventId,
      streak: normalizedStreak.value,
      source: 'manual',
    });
    progress.preview.streakVerificationByFighterId = {
      ...(progress.preview.streakVerificationByFighterId || {}),
      [Number(row.FighterId)]: streakVerification,
    };

    const { rows, scratchDir, ...previewSummary } = progress.preview;
    await logAdminAction(req, {
      action: 'fight_card.preview.verify_streak',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        rowKey,
        fighterId: row.FighterId,
        streak: normalizedStreak.value,
      },
    });

    return res.json({
      ...previewSummary,
      rowKey,
      fighterId: row.FighterId,
      streakVerification,
      ...persistence,
    });
  } catch (error) {
    console.error('Error verifying preview fighter streak:', error);
    return res.status(500).json({
      error: 'Failed to verify fighter streak',
      details: error.message,
    });
  }
});

app.post('/admin/events/:id/fight-card/preview/:previewToken/scrape-tapology', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    const previewToken = String(req.params.previewToken || '').trim();
    const rowKey = String(req.body?.rowKey || '').trim();
    if (Number.isNaN(eventId) || !previewToken || !rowKey) {
      return res.status(400).json({ error: 'Invalid event id, preview token, or fighter row' });
    }

    await cleanupExpiredFightCardPreviews();
    const preview = getFightCardPreview(previewToken, eventId);
    if (!preview) {
      return res.status(404).json({ error: 'Preview token was not found or has expired' });
    }

    const row = (preview.rows || []).find(
      (candidate) => buildFightCardPreviewRowKey(candidate) === rowKey
    );
    if (!row) {
      return res.status(404).json({ error: 'Fighter row was not found in this preview' });
    }

    const requestedTapologyUrl = normalizeAdminStatValue(
      'TapologyFighterURL',
      req.body?.tapologyFighterUrl
    );
    if (!requestedTapologyUrl.ok) {
      return res.status(400).json({ error: requestedTapologyUrl.error });
    }

    const tapologyFighterUrl = requestedTapologyUrl.value || row.TapologyFighterURL || '';
    if (!tapologyFighterUrl) {
      return res.status(409).json({
        error: 'No Tapology fighter URL is available for this preview row.',
        details: 'Paste the Tapology fighter profile URL into this row, then click Scrape again.',
      });
    }

    const scrapeResult = await runTapologyFighterProfileScraper({
      tapologyFighterUrl,
      fighterName: [row.FirstName, row.LastName].filter(Boolean).join(' '),
      recordWins: row.Record_Wins,
      recordLosses: row.Record_Losses,
      timeoutMs: 120000,
    });
    const profile = scrapeResult?.profile || {};
    const statsSource = scrapeResult?.source || 'tapology_single_profile';
    const statsConfidence = tapologyStatsConfidence(statsSource);
    const patch = {
      ...buildFightCardPatchFromTapologyProfile(row, profile),
      TapologyFighterURL: tapologyFighterUrl,
    };
    const profilePersistence = await persistScrapedTapologyFighterProfile({
      row: { ...row, ...patch },
      eventId,
      tapologyFighterUrl,
      profile,
      statsSource,
      statsConfidence,
      verifyLiveStreak: scrapeResult?.diagnostics?.tapology_fetch_status === 'success',
    });
    const progress = saveFightCardPreviewProgress(previewToken, eventId, {
      [rowKey]: patch,
    });
    if (!progress) {
      return res.status(404).json({ error: 'Preview token expired while the fighter was being scraped' });
    }
    const fightCardPersistence = await persistImportedFightCardPreviewUpdates({
      eventId,
      preview: progress.preview,
      manualRowUpdates: { [rowKey]: patch },
      updateFighterProfiles: false,
    });
    if (profilePersistence.streakVerification) {
      progress.preview.streakVerificationByFighterId = {
        ...(progress.preview.streakVerificationByFighterId || {}),
        [Number(row.FighterId)]: profilePersistence.streakVerification,
      };
    }
    const { rows, scratchDir, ...previewSummary } = progress.preview;
    const updatedFields = Object.keys(patch).filter((field) => field !== 'TapologyFighterURL');
    const scrapeDiagnostics = buildTapologyScrapeDiagnostics(
      scrapeResult,
      profile,
      updatedFields
    );

    await logAdminAction(req, {
      action: 'fight_card.preview.scrape_tapology_fighter',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        rowKey,
        fighterId: row.FighterId,
        fighterName: [row.FirstName, row.LastName].filter(Boolean).join(' '),
        tapologyFighterUrl,
        statsSource,
        updatedFields,
        updatedFightCardRows: fightCardPersistence.updatedFightCardRows,
        scrapeDiagnostics,
      },
    });

    return res.json({
      ...previewSummary,
      rowKey,
      fighterId: row.FighterId,
      tapologyFighterUrl,
      statsSource,
      wikipediaTitle: scrapeResult?.wikipedia_title || null,
      tapologyBlocked: scrapeDiagnostics.tapologyFetchStatus === 'failed',
      updatedFields,
      scrapeDiagnostics,
      ...profilePersistence,
      ...fightCardPersistence,
    });
  } catch (error) {
    console.error('Error scraping Tapology stats for fight-card preview:', error);
    const scrapeDiagnostics = buildFailedTapologyScrapeDiagnostics(error);
    await logAdminAction(req, {
      action: 'fight_card.preview.scrape_tapology_fighter',
      status: 'error',
      targetType: 'event',
      targetId: req.params.id,
      eventId: Number(req.params.id),
      metadata: {
        rowKey: req.body?.rowKey || null,
        message: error.message,
        scrapeDiagnostics,
      },
    });
    return res.status(500).json({
      error: 'Failed to scrape Tapology fighter stats for preview',
      details: error.message,
      scrapeDiagnostics,
    });
  }
});

app.post('/admin/events/:id/tapology-cache/refresh', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const result = await refreshTapologyCacheForEvent({
      eventId,
      repoRoot: REPO_ROOT,
    });

    const status = result.headerErrors?.length > 0 ? 'error' : 'success';
    await logAdminAction(req, {
      action: 'tapology_cache.refresh',
      status,
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        rowCount: result.rowCount,
        fightCount: result.fightCount,
        tapologyUrlCount: result.tapologyUrlCount,
        tapologyProfileStatCount: result.tapologyProfileStatCount,
        headerErrors: result.headerErrors,
        csvFileName: result.csvFileName,
      },
    });

    if (result.headerErrors?.length > 0) {
      return res.status(500).json({
        error: 'Tapology cache refresh generated an invalid CSV',
        ...result,
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('Error refreshing Tapology cache:', error);
    await logAdminAction(req, {
      action: 'tapology_cache.refresh',
      status: 'error',
      targetType: 'event',
      targetId: req.params.id,
      eventId: Number(req.params.id),
      metadata: {
        message: error.message,
      },
    });
    return res.status(500).json({
      error: 'Failed to refresh Tapology cache',
      details: error.message,
    });
  }
});

app.get('/admin/events/:id/fight-card/scrape-log', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const { data, error } = await supabase
      .from('admin_action_audit_log')
      .select('id,created_at,admin_username,action,status,metadata')
      .eq('event_id', eventId)
      .in('action', [
        'fight_card.preview.scrape_tapology_fighter',
        'fight_card.scrape_tapology_fighter',
      ])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`Failed to load scrape audit entries: ${error.message}`);
    }

    return res.json({
      eventId,
      entries: (data || []).map((entry) => {
        const metadata = entry.metadata || {};
        const diagnostics = metadata.scrapeDiagnostics || {};
        return {
          id: entry.id,
          createdAt: entry.created_at,
          adminUsername: entry.admin_username,
          status: diagnostics.status || entry.status,
          fighterName: metadata.fighterName || null,
          fighterId: metadata.fighterId || null,
          rowKey: metadata.rowKey || null,
          rowId: metadata.rowId || null,
          source: diagnostics.source || metadata.statsSource || null,
          tapologyFetchStatus: diagnostics.tapologyFetchStatus || null,
          tapologyError: diagnostics.tapologyError || null,
          fallbackError: diagnostics.fallbackError || null,
          fieldsFound: diagnostics.fieldsFound || [],
          fieldsMissing: diagnostics.fieldsMissing || [],
          updatedFields: diagnostics.updatedFields || metadata.updatedFields || [],
          streakDetail: diagnostics.streakDetail || null,
          warnings: diagnostics.warnings || (metadata.message ? [metadata.message] : []),
        };
      }),
    });
  } catch (error) {
    console.error('Error loading fight-card scrape log:', error);
    return res.status(500).json({
      error: 'Failed to load fight-card scrape log',
      details: error.message,
    });
  }
});

app.post('/admin/events/:id/fight-card/editor', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const [eventResponse, rowsResponse] = await Promise.all([
      supabase
        .from('events')
        .select('id,name,date,venue,location_city,location_state,location_country,image_url')
        .eq('id', eventId)
        .maybeSingle(),
      supabase
        .from('ufc_full_fight_card')
        .select(FIGHT_CARD_STAT_SELECT)
        .eq('EventId', eventId)
        .order('FightOrder', { ascending: true })
        .order('Corner', { ascending: false }),
    ]);

    if (eventResponse.error) {
      throw new Error(`Failed to load event: ${eventResponse.error.message}`);
    }
    if (!eventResponse.data) {
      return res.status(404).json({ error: `Event ${eventId} was not found` });
    }
    if (rowsResponse.error) {
      throw new Error(`Failed to load imported fight-card rows: ${rowsResponse.error.message}`);
    }
    if (!rowsResponse.data?.length) {
      return res.status(404).json({
        error: 'No imported fight card is available for this event',
        details: 'Scrape and import the fight card before opening the imported editor.',
      });
    }

    const preview = buildImportedFightCardEditorPreview({
      eventId,
      eventRecord: eventResponse.data,
      rows: rowsResponse.data,
    });
    preview.streakVerificationByFighterId = await loadStreakVerificationByFighterId(preview.rows);
    const storedPreview = await replaceFightCardPreview(preview);
    const importedPreview = markFightCardPreviewImported(
      storedPreview.previewToken,
      eventId,
      preview
    );
    if (!importedPreview) {
      throw new Error('Failed to create an imported fight-card editor session.');
    }

    const { rows, scratchDir, ...previewSummary } = importedPreview;
    await logAdminAction(req, {
      action: 'fight_card.editor.open',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        rowCount: importedPreview.rowCount,
        fightCount: importedPreview.fightCount,
      },
    });

    return res.json(previewSummary);
  } catch (error) {
    console.error('Error opening imported fight-card editor:', error);
    return res.status(500).json({
      error: 'Failed to open imported fight-card editor',
      details: error.message,
    });
  }
});

app.get('/admin/events/:id/fight-card/stats', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const { data: rows, error } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_STAT_SELECT)
      .eq('EventId', eventId)
      .order('FightOrder', { ascending: true })
      .order('Corner', { ascending: false });

    if (error) {
      console.error('Error loading fight-card stat rows:', error);
      return res.status(500).json({ error: 'Failed to load fight-card stat rows' });
    }

    const decoratedRows = await decorateRowsWithStreakVerification(rows || []);
    return res.json({
      eventId,
      rows: decoratedRows,
      editableFields: ADMIN_FIGHTER_STAT_FIELDS,
    });
  } catch (error) {
    console.error('Error loading fight-card stat rows:', error);
    return res.status(500).json({
      error: 'Failed to load fight-card stat rows',
      details: error.message,
    });
  }
});

app.post('/admin/events/:id/fight-card/stats/:rowId/scrape-tapology', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    const rowId = Number(req.params.rowId);
    if (Number.isNaN(eventId) || Number.isNaN(rowId)) {
      return res.status(400).json({ error: 'Invalid event id or row id' });
    }

    const { data: row, error: rowError } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_STAT_SELECT)
      .eq('EventId', eventId)
      .eq('id', rowId)
      .maybeSingle();

    if (rowError) {
      console.error('Error loading fight-card row for Tapology scrape:', rowError);
      return res.status(500).json({ error: 'Failed to load fight-card row' });
    }

    if (!row) {
      return res.status(404).json({ error: `Fight-card row ${rowId} was not found for event ${eventId}` });
    }

    const requestedTapologyUrl = normalizeAdminStatValue(
      'TapologyFighterURL',
      req.body?.tapologyFighterUrl
    );
    if (!requestedTapologyUrl.ok) {
      return res.status(400).json({ error: requestedTapologyUrl.error });
    }

    const tapologyFighterUrl = await resolveTapologyFighterUrlForStatRow(
      row,
      requestedTapologyUrl.value || ''
    );
    if (!tapologyFighterUrl) {
      return res.status(409).json({
        error: 'No Tapology fighter URL is available for this fighter yet.',
        details: 'Paste the Tapology fighter profile URL into this row, then click Scrape Tapology again.',
      });
    }

    const scrapeResult = await runTapologyFighterProfileScraper({
      tapologyFighterUrl,
      fighterName: [row.FirstName, row.LastName].filter(Boolean).join(' '),
      recordWins: row.Record_Wins,
      recordLosses: row.Record_Losses,
      timeoutMs: 120000,
    });

    const profile = scrapeResult?.profile || {};
    const statsSource = scrapeResult?.source || 'tapology_single_profile';
    const statsConfidence = tapologyStatsConfidence(statsSource);
    const patch = buildFightCardPatchFromTapologyProfile(row, profile);
    const fightCardPatch = {
      ...patch,
      TapologyFighterURL: row.TapologyFighterURL || tapologyFighterUrl,
      TapologyMatchConfidence: statsConfidence,
    };

    if (Object.keys(fightCardPatch).length > 0) {
      const { error: updateError } = await supabase
        .from('ufc_full_fight_card')
        .update(fightCardPatch)
        .eq('EventId', eventId)
        .eq('id', rowId);

      if (updateError) {
        throw new Error(`Failed to update fight-card row ${rowId}: ${updateError.message}`);
      }
    }

    const profilePersistence = await persistScrapedTapologyFighterProfile({
      row: { ...row, ...fightCardPatch },
      eventId,
      tapologyFighterUrl,
      profile,
      statsSource,
      statsConfidence,
      verifyLiveStreak: scrapeResult?.diagnostics?.tapology_fetch_status === 'success',
    });
    const updatedFields = Object.keys(patch);
    const scrapeDiagnostics = buildTapologyScrapeDiagnostics(
      scrapeResult,
      profile,
      updatedFields
    );

    await logAdminAction(req, {
      action: 'fight_card.scrape_tapology_fighter',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        rowId,
        fighterId: row.FighterId,
        fighterName: [row.FirstName, row.LastName].filter(Boolean).join(' '),
        tapologyFighterUrl,
        statsSource,
        updatedFields,
        scrapeDiagnostics,
      },
    });

    return res.json({
      eventId,
      rowId,
      fighterId: row.FighterId,
      tapologyFighterUrl,
      statsSource,
      wikipediaTitle: scrapeResult?.wikipedia_title || null,
      tapologyBlocked: scrapeDiagnostics.tapologyFetchStatus === 'failed',
      updatedFields,
      scrapeDiagnostics,
      profile,
      streakVerification: profilePersistence.streakVerification,
    });
  } catch (error) {
    console.error('Error scraping Tapology fighter stats:', error);
    const scrapeDiagnostics = buildFailedTapologyScrapeDiagnostics(error);
    await logAdminAction(req, {
      action: 'fight_card.scrape_tapology_fighter',
      status: 'error',
      targetType: 'event',
      targetId: req.params.id,
      eventId: Number(req.params.id),
      metadata: {
        rowId: Number(req.params.rowId),
        message: error.message,
        scrapeDiagnostics,
      },
    });
    return res.status(500).json({
      error: 'Failed to scrape Tapology fighter stats',
      details: error.message,
      scrapeDiagnostics,
    });
  }
});

app.post('/admin/events/:id/fight-card/stats/:rowId/verify-streak', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    const rowId = Number(req.params.rowId);
    const normalizedStreak = normalizeAdminStatValue('Streak', req.body?.streak);
    if (Number.isNaN(eventId) || Number.isNaN(rowId)) {
      return res.status(400).json({ error: 'Invalid event id or row id' });
    }
    if (!normalizedStreak.ok || normalizedStreak.value === null) {
      return res.status(400).json({ error: normalizedStreak.error || 'Enter a streak before verifying it' });
    }

    const { data: row, error: rowError } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_STAT_SELECT)
      .eq('EventId', eventId)
      .eq('id', rowId)
      .maybeSingle();
    if (rowError) {
      throw new Error(`Failed to load fight-card row: ${rowError.message}`);
    }
    if (!row) {
      return res.status(404).json({ error: `Fight-card row ${rowId} was not found for event ${eventId}` });
    }

    if (normalizeFiniteInteger(row.Streak) !== normalizedStreak.value) {
      const { error: updateError } = await supabase
        .from('ufc_full_fight_card')
        .update({ Streak: normalizedStreak.value })
        .eq('EventId', eventId)
        .eq('id', rowId);
      if (updateError) {
        throw new Error(`Failed to update fight-card streak: ${updateError.message}`);
      }
    }

    const streakVerification = await persistVerifiedStreakAnchor({
      row: { ...row, Streak: normalizedStreak.value },
      eventId,
      streak: normalizedStreak.value,
      source: 'manual',
    });
    await logAdminAction(req, {
      action: 'fight_card.verify_streak',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        rowId,
        fighterId: row.FighterId,
        streak: normalizedStreak.value,
      },
    });

    return res.json({
      eventId,
      rowId,
      fighterId: row.FighterId,
      streak: normalizedStreak.value,
      streakVerification,
    });
  } catch (error) {
    console.error('Error verifying fighter streak:', error);
    return res.status(500).json({
      error: 'Failed to verify fighter streak',
      details: error.message,
    });
  }
});

app.post('/admin/events/:id/fight-card/stats', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (updates.length === 0) {
      return res.json({
        eventId,
        updatedFightCardRows: 0,
        updatedFighters: 0,
      });
    }

    const rowIds = updates
      .map((update) => Number(update?.id))
      .filter((id) => Number.isFinite(id));
    if (rowIds.length !== updates.length) {
      return res.status(400).json({ error: 'Each update must include a valid fight-card row id' });
    }

    const { data: existingRows, error: existingRowsError } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_STAT_SELECT)
      .eq('EventId', eventId)
      .in('id', rowIds);

    if (existingRowsError) {
      console.error('Error loading fight-card rows for stat update:', existingRowsError);
      return res.status(500).json({ error: 'Failed to load fight-card rows for update' });
    }

    const existingById = new Map((existingRows || []).map((row) => [Number(row.id), row]));
    const normalizedUpdates = [];

    for (const update of updates) {
      const rowId = Number(update.id);
      const existingRow = existingById.get(rowId);
      if (!existingRow) {
        return res.status(404).json({ error: `Fight-card row ${rowId} was not found for event ${eventId}` });
      }

      const patch = {};
      const values = update.values && typeof update.values === 'object' ? update.values : {};
      for (const [field, rawValue] of Object.entries(values)) {
        const normalized = normalizeAdminStatValue(field, rawValue);
        if (!normalized.ok) {
          return res.status(400).json({ error: normalized.error });
        }
        patch[field] = normalized.value;
      }

      if (Object.keys(patch).length === 0) {
        continue;
      }

      normalizedUpdates.push({
        rowId,
        existingRow,
        patch,
      });
    }

    let updatedFightCardRows = 0;
    let verifiedStreakCount = 0;
    const fighterProfilePayloadById = new Map();

    for (const update of normalizedUpdates) {
      const { error: updateError } = await supabase
        .from('ufc_full_fight_card')
        .update(update.patch)
        .eq('id', update.rowId)
        .eq('EventId', eventId);

      if (updateError) {
        throw new Error(`Failed to update fight-card row ${update.rowId}: ${updateError.message}`);
      }

      updatedFightCardRows += 1;

      if (Object.prototype.hasOwnProperty.call(update.patch, 'Streak') && update.patch.Streak !== null) {
        await persistVerifiedStreakAnchor({
          row: { ...update.existingRow, Streak: update.patch.Streak },
          eventId,
          streak: update.patch.Streak,
          source: 'manual',
        });
        verifiedStreakCount += 1;
      }

      const fighterId = Number(update.existingRow.FighterId);
      if (!Number.isFinite(fighterId)) {
        continue;
      }

      const fighterProfileEntries = Object.entries(update.patch)
        .map(([field, value]) => [toFighterProfileColumn(field), field, value])
        .filter(([profileColumn, field]) => Boolean(profileColumn) && field !== 'Streak');
      if (fighterProfileEntries.length === 0) {
        continue;
      }

      const payload = fighterProfilePayloadById.get(fighterId) || {
        fighter_id: fighterId,
        mma_id: update.existingRow.MMAId ?? null,
        first_name: update.existingRow.FirstName ?? null,
        last_name: update.existingRow.LastName ?? null,
        normalized_name: [update.existingRow.FirstName, update.existingRow.LastName]
          .filter(Boolean)
          .join(' ')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ') || null,
      };

      for (const [profileColumn, , value] of fighterProfileEntries) {
        payload[profileColumn] = value;
      }

      fighterProfilePayloadById.set(fighterId, payload);
    }

    const fighterProfilePayloads = Array.from(fighterProfilePayloadById.values())
      .map(compactFighterProfilePayload);
    if (fighterProfilePayloads.length > 0) {
      const { error: fighterUpdateError } = await supabase
        .from('fighters')
        .upsert(fighterProfilePayloads, { onConflict: 'fighter_id' });

      if (fighterUpdateError) {
        throw new Error(`Failed to update fighters table: ${fighterUpdateError.message}`);
      }
    }

    await logAdminAction(req, {
      action: 'fight_card.update_stats',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        updatedFightCardRows,
        updatedFighters: fighterProfilePayloads.length,
        requestedUpdates: updates.length,
        verifiedStreakCount,
      },
    });

    return res.json({
      eventId,
      updatedFightCardRows,
      updatedFighters: fighterProfilePayloads.length,
      verifiedStreakCount,
    });
  } catch (error) {
    console.error('Error updating fight-card stats:', error);
    await logAdminAction(req, {
      action: 'fight_card.update_stats',
      status: 'error',
      targetType: 'event',
      targetId: req.params.id,
      eventId: Number(req.params.id),
      metadata: {
        message: error.message,
      },
    });
    return res.status(500).json({
      error: 'Failed to update fight-card stats',
      details: error.message,
    });
  }
});

app.post('/admin/events/:id/fight-card/import', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    const previewToken = typeof req.body?.previewToken === 'string'
      ? req.body.previewToken.trim()
      : '';

    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    if (!previewToken) {
      return res.status(400).json({ error: 'previewToken is required' });
    }

    await cleanupExpiredFightCardPreviews();

    const storedPreview = getFightCardPreview(previewToken, eventId);
    if (!storedPreview) {
      return res.status(404).json({ error: 'Preview token was not found or has expired' });
    }
    if (storedPreview.isImported) {
      return res.status(409).json({
        error: 'This preview has already been imported',
        details: 'Use the retained editor to save additional changes to the fight card.',
      });
    }

    const manualRowUpdates = req.body?.manualRowUpdates && typeof req.body.manualRowUpdates === 'object'
      ? req.body.manualRowUpdates
      : null;
    const {
      preview,
      appliedManualUpdateCount,
    } = applyManualFightCardPreviewUpdates(storedPreview, manualRowUpdates);

    if (preview.blockers.length > 0) {
      return res.status(400).json({
        error: 'Preview contains blockers and cannot be imported',
        blockers: preview.blockers,
      });
    }

    const { data: importResult, error: importError } = await supabase.rpc(
      'replace_ufc_full_fight_card_event',
      {
        p_event_id: eventId,
        p_event_name: preview.previewEvent.name,
        p_event_date: preview.previewEvent.date,
        p_venue: preview.previewEvent.venue,
        p_location_city: preview.previewEvent.location_city,
        p_location_state: preview.previewEvent.location_state,
        p_location_country: preview.previewEvent.location_country,
        p_rows: preview.rows,
      }
    );

    if (importError) {
      console.error('Error importing fight card:', importError);
      return res.status(500).json({
        error: 'Failed to import fight card',
        details: importError.message,
      });
    }

    const eventImageUpdate = await backfillEventImageIfMissing({
      supabase,
      eventId,
      currentImageUrl: preview.currentEvent?.image_url,
      fallbackImageUrl: preview.previewEvent?.tapology_event_image_url,
    });

    const fighterStyleSync = await syncFighterStyleFromFightCardRows({
      supabase,
      fightCardRows: preview.rows,
    });
    const verifiedStreaks = await persistManualStreakAnchors({
      eventId,
      preview,
      manualRowUpdates,
    });
    preview.streakVerificationByFighterId = {
      ...(preview.streakVerificationByFighterId || {}),
      ...verifiedStreaks,
    };

    const importedPreview = markFightCardPreviewImported(previewToken, eventId, preview);
    if (!importedPreview) {
      throw new Error('Fight-card preview expired before the imported editor could be retained.');
    }
    const { rows: importedPreviewRows, scratchDir, ...fightCardPreview } = importedPreview;

    await logAdminAction(req, {
      action: 'fight_card.import',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        rowCount: preview.rowCount,
        fightCount: preview.fightCount,
        csvFileName: preview.csvFileName,
        deleted_count: importResult?.deleted_count ?? null,
        inserted_count: importResult?.inserted_count ?? null,
        event_image_update: eventImageUpdate,
        warnings: preview.warnings,
        fighter_style_sync: fighterStyleSync,
        applied_manual_update_count: appliedManualUpdateCount,
        verified_streak_count: Object.keys(verifiedStreaks).length,
        editor_retained: true,
      },
    });

    return res.json({
      event_id: eventId,
      rowCount: preview.rowCount,
      fightCount: preview.fightCount,
      previewEvent: preview.previewEvent,
      importResult,
      eventImageUpdate,
      fighterStyleSync,
      appliedManualUpdateCount,
      verifiedStreakCount: Object.keys(verifiedStreaks).length,
      fightCardPreview,
    });
  } catch (error) {
    console.error('Error importing fight card:', error);
    await logAdminAction(req, {
      action: 'fight_card.import',
      status: 'error',
      targetType: 'event',
      targetId: req.params.id,
      eventId: Number(req.params.id),
      metadata: {
        message: error.message,
      },
    });
    return res.status(500).json({
      error: 'Failed to import fight card',
      details: error.message,
    });
  }
});

app.post('/admin/events/:id/refresh-odds', requireAdminSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const eventId = Number(req.params.id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const { data: existingFightCardRows, error: existingFightCardError } = await supabase
      .from('ufc_full_fight_card')
      .select('id, FightId, FighterId, Corner, odds')
      .eq('EventId', eventId);

    if (existingFightCardError) {
      console.error('Error loading existing fight-card rows for odds refresh:', existingFightCardError);
      return res.status(500).json({ error: 'Failed to load existing fight-card rows' });
    }

    const oddsScraperOutput = await runEventOddsScraper({
      eventId,
      repoRoot: REPO_ROOT,
    });

    const refreshPlan = buildOddsRefreshPlan({
      eventId,
      scrapedRows: oddsScraperOutput.rows,
      existingFightCardRows: existingFightCardRows || [],
    });

    if (refreshPlan.blockers.length > 0) {
      await logAdminAction(req, {
        action: 'fight_card.refresh_odds',
        status: 'error',
        targetType: 'event',
        targetId: eventId,
        eventId,
        metadata: {
          blockerCount: refreshPlan.blockers.length,
          blockers: refreshPlan.blockers,
          warningCount: refreshPlan.warnings.length,
          warnings: refreshPlan.warnings,
        },
      });
      return res.status(409).json({
        error: 'Odds refresh could not be completed',
        blockers: refreshPlan.blockers,
        warnings: refreshPlan.warnings,
      });
    }

    for (const update of refreshPlan.updates) {
      const { error: updateError } = await supabase
        .from('ufc_full_fight_card')
        .update({ odds: update.to })
        .eq('id', update.id);

      if (updateError) {
        throw new Error(`Failed to update odds for fight ${update.FightId}: ${updateError.message}`);
      }
    }

    await logAdminAction(req, {
      action: 'fight_card.refresh_odds',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        updatedCount: refreshPlan.updatedCount,
        unchangedCount: refreshPlan.unchangedCount,
        missingOddsCount: refreshPlan.missingOddsCount,
        scrapedRowCount: oddsScraperOutput.rowCount,
        warningCount: refreshPlan.warnings.length,
        warnings: refreshPlan.warnings,
      },
    });

    return res.json({
      eventId,
      updatedCount: refreshPlan.updatedCount,
      unchangedCount: refreshPlan.unchangedCount,
      missingOddsCount: refreshPlan.missingOddsCount,
      scrapedRowCount: oddsScraperOutput.rowCount,
      warnings: refreshPlan.warnings,
      updatedRows: refreshPlan.updates.map((update) => ({
        FightId: update.FightId,
        FighterId: update.FighterId,
        Corner: update.Corner,
        fighterName: update.fighterName,
        from: update.from,
        to: update.to,
      })),
    });
  } catch (error) {
    console.error('Error refreshing odds:', error);
    await logAdminAction(req, {
      action: 'fight_card.refresh_odds',
      status: 'error',
      targetType: 'event',
      targetId: req.params.id,
      eventId: Number(req.params.id),
      metadata: {
        message: error.message,
      },
    });
    return res.status(500).json({
      error: 'Failed to refresh odds',
      details: error.message,
    });
  }
});

// Get fights for a specific event
app.get('/events/:id/fights', async (req, res) => {
  try {
    const { id } = req.params;
    
    // First check if the event exists in the events table
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, date')
      .eq('id', id)
      .single();

    if (eventError) {
      console.error('Error fetching event:', eventError);
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get fights for the event from ufc_full_fight_card
    const { data, error } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_FIGHT_SELECT)
      .eq('EventId', id)
      .order('FightOrder');

    if (error) {
      console.error('Error fetching fights for event:', error);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    // If no fight data exists, return empty array (this allows future events to be displayed)
    if (!data || data.length === 0) {
      debugLog(`No fight data found for event ${id}, returning empty array`);
      return res.json([]);
    }

    const fightIds = Array.from(new Set(
      data.map((row) => Number(row.FightId)).filter(Number.isFinite)
    ));

    // Get only the selected event's fight results so live refreshes stay lightweight.
    const { data: fightResults, error: resultsError } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed, result_type')
      .in('fight_id', fightIds);

    if (resultsError) {
      console.error('Error fetching fight results:', resultsError);
      return res.status(500).json({ error: 'Failed to fetch fight results' });
    }

    // Create a map of fight results
    const fightResultsMap = new Map();
    fightResults.forEach(result => {
      const numericFightId = Number(result.fight_id);
      fightResultsMap.set(numericFightId, {
        winner: result.fighter_id,
        is_completed: result.is_completed,
        result_type: result.result_type,
      });
    });

    // Group fighters by FightId
    const fightMap = new Map();
    data.forEach(fighter => {
      if (!fightMap.has(fighter.FightId)) {
        fightMap.set(fighter.FightId, {
          red: null,
          blue: null,
          weightclass: fighter.FighterWeightClass,
          card_tier: fighter.CardSegment
        });
      }
      
      const corner = fighter.Corner?.toLowerCase();
      if (corner === 'red') {
        fightMap.get(fighter.FightId).red = fighter;
      } else if (corner === 'blue') {
        fightMap.get(fighter.FightId).blue = fighter;
      }
    });

    // Get weightclass mapping
    const weightclassMap = await getWeightclassMapping();

    // Transform fights into the required format
    const transformedFights = [];
    for (const [fightId, fighters] of fightMap) {
      // Skip incomplete fights
      if (!fighters.red || !fighters.blue) {
        continue;
      }

      const result = fightResultsMap.get(fightId);
      const transformedFight = buildFightResponse({
        fightId,
        eventId: id,
        eventDate: eventData.date || null,
        redFighter: fighters.red,
        blueFighter: fighters.blue,
        result,
        weightclassMap,
      });

      transformedFights.push(transformedFight);
    }

    res.json(transformedFights);
  } catch (error) {
    console.error('Error in GET /events/:id/fights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// One authenticated, event-scoped payload for the primary picks workspace.
app.get('/events/:id/picks-context', requireUserSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const eventId = normalizeUserId(req.params.id);
    if (!eventId) return res.status(400).json({ error: 'Invalid event id' });

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('id, date')
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!eventData) return res.status(404).json({ error: 'Event not found' });

    const { data: cardRows, error: cardError } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_FIGHT_SELECT)
      .eq('EventId', eventId)
      .order('FightOrder');
    if (cardError) throw cardError;

    const fightIds = Array.from(new Set((cardRows || []).map((row) => Number(row.FightId)).filter(Number.isFinite)));
    if (fightIds.length === 0) {
      return res.json({ fights: [], submitted_picks: {}, vote_counts: {}, reminders: [], prior_pick_outcomes: [] });
    }

    const [resultsResult, predictions, users, remindersResult, userPredictionRows] = await Promise.all([
      supabase.from('fight_results').select('fight_id, fighter_id, is_completed, result_type').in('fight_id', fightIds),
      fetchAllFromSupabase(supabase.from('predictions').select('fight_id, fighter_id, user_id, username').in('fight_id', fightIds)),
      fetchAllUsers('user_id, username, is_bot'),
      supabase.from('fighter_vote_reminders').select('fighter_id, fighter_name, reminder_type, created_at, updated_at').eq('user_id', req.authenticatedUser.user_id).order('updated_at', { ascending: false }),
      fetchAllFromSupabase(supabase.from('predictions').select('fight_id, fighter_id, user_id, username').eq('user_id', req.authenticatedUser.user_id)),
    ]);
    if (resultsResult.error) throw resultsResult.error;

    const resultMap = new Map((resultsResult.data || []).map((result) => [Number(result.fight_id), result]));
    const weightclassMap = await getWeightclassMapping();
    const grouped = new Map();
    (cardRows || []).forEach((row) => {
      const group = grouped.get(row.FightId) || { red: null, blue: null };
      if (String(row.Corner).toLowerCase() === 'red') group.red = row;
      if (String(row.Corner).toLowerCase() === 'blue') group.blue = row;
      grouped.set(row.FightId, group);
    });
    const fights = Array.from(grouped.entries()).flatMap(([fightId, group]) => {
      if (!group.red || !group.blue) return [];
      const result = resultMap.get(Number(fightId));
      return [buildFightResponse({
        fightId,
        eventId,
        eventDate: eventData.date || null,
        redFighter: group.red,
        blueFighter: group.blue,
        result: result ? {
          winner: result.fighter_id,
          is_completed: result.is_completed,
          result_type: result.result_type,
        } : null,
        weightclassMap,
      })];
    });

    let historyFightMeta = [];
    let historyResults = [];
    const historyFightIds = Array.from(new Set(userPredictionRows.map((prediction) => Number(prediction.fight_id)).filter(Number.isFinite)));
    if (historyFightIds.length > 0) {
      const historyRows = await fetchAllFromSupabase(
        supabase.from('ufc_full_fight_card').select('FightId, EventId').in('FightId', historyFightIds)
      );
      const historyEventIds = Array.from(new Set(historyRows.map((row) => Number(row.EventId)).filter(Number.isFinite)));
      const historyEvents = historyEventIds.length
        ? await fetchAllFromSupabase(supabase.from('events').select('id, date').in('id', historyEventIds))
        : [];
      const eventDates = new Map(historyEvents.map((event) => [Number(event.id), event.date]));
      historyFightMeta = historyRows.map((row) => ({ ...row, event_date: eventDates.get(Number(row.EventId)) || null }));
      historyResults = await fetchAllFromSupabase(
        supabase.from('fight_results').select('fight_id, fighter_id, is_completed, result_type').in('fight_id', historyFightIds)
      );
    }

    return res.json(buildPicksContextPayload({
      fights,
      userPredictions: userPredictionRows,
      currentFightIds: fightIds,
      publicPredictions: predictions,
      users,
      reminders: remindersResult.error ? [] : (remindersResult.data || []),
      fightMeta: historyFightMeta,
      results: historyResults,
      selectedEventDate: eventData.date,
    }));
  } catch (error) {
    console.error('Error building picks context:', error);
    return res.status(500).json({ error: 'Failed to load picks context' });
  }
});

// Get vote counts for all fights in an event (total + human counts)
app.get('/events/:id/vote-counts', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Event ID is required' });
    }
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');

    const { data: fights, error: fightsError } = await supabase
      .from('ufc_full_fight_card')
      .select('FightId')
      .eq('EventId', id);

    if (fightsError) {
      console.error('Error fetching fights for vote counts:', fightsError);
      return res.status(500).json({ error: 'Failed to fetch fights for vote counts' });
    }

    const fightIds = Array.from(new Set((fights || []).map(f => f.FightId))).filter(Boolean);
    if (fightIds.length === 0) {
      return res.json({});
    }

    const predictionsQuery = supabase
      .from('predictions')
      .select('fight_id, fighter_id, user_id, username')
      .in('fight_id', fightIds);
    const predictions = await fetchAllFromSupabase(predictionsQuery);

    if (!predictions || predictions.length === 0) {
      return res.json({});
    }

    const users = await fetchAllUsers(`
      user_id,
      username,
      is_bot,
      avatar_config,
      selected_playercard_id,
      playercards!selected_playercard_id (id, name, image_url, category)
    `);
    const userMaps = buildUserMaps(users);
    const filteredPredictions = (predictions || []).filter(
      (prediction) => Boolean(resolveUserForRow(prediction, userMaps))
    );

    if (filteredPredictions.length === 0) {
      return res.json({});
    }

    const counts = {};
    filteredPredictions.forEach(pred => {
      const fightIdStr = String(pred.fight_id);
      const fighterIdStr = String(pred.fighter_id);
      const predictionUser = resolveUserForRow(pred, userMaps);
      if (!counts[fightIdStr]) {
        counts[fightIdStr] = {};
      }
      if (!counts[fightIdStr][fighterIdStr]) {
        counts[fightIdStr][fighterIdStr] = { total: 0, human: 0 };
      }
      const isBot = Boolean(predictionUser?.is_bot);
      counts[fightIdStr][fighterIdStr].total += 1;
      if (!isBot) {
        counts[fightIdStr][fighterIdStr].human += 1;
      }
    });

    res.json(counts);
  } catch (error) {
    console.error('Error fetching event vote counts:', error);
    res.status(500).json({ error: 'Failed to fetch event vote counts' });
  }
});

async function getPropPixBetById(propPixId) {
  const normalizedId = normalizeUserId(propPixId);
  if (!normalizedId) {
    return null;
  }

  const { data, error } = await supabase
    .from('prop_bets')
    .select('id, event_id, creator_user_id, question, response_type, wager_label, status, outcome_text, closed_at, created_at, updated_at')
    .eq('id', normalizedId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getPropPixEventData(eventId, currentUserId = null) {
  const normalizedEventId = normalizeUserId(eventId);
  if (!normalizedEventId) {
    return [];
  }

  const { data: bets, error: betsError } = await supabase
    .from('prop_bets')
    .select('id, event_id, creator_user_id, question, response_type, wager_label, status, outcome_text, closed_at, created_at, updated_at')
    .eq('event_id', normalizedEventId)
    .order('created_at', { ascending: false });

  if (betsError) {
    throw betsError;
  }

  if (!bets || bets.length === 0) {
    return [];
  }

  const betIds = bets.map((bet) => bet.id);
  const [
    { data: options, error: optionsError },
    { data: votes, error: votesError },
    { data: claims, error: claimsError },
    { data: results, error: resultsError },
  ] = await Promise.all([
    supabase
      .from('prop_bet_options')
      .select('id, prop_bet_id, label, sort_order')
      .in('prop_bet_id', betIds)
      .order('sort_order', { ascending: true }),
    supabase
      .from('prop_bet_votes')
      .select('id, prop_bet_id, user_id, option_id, response_text, created_at, updated_at')
      .in('prop_bet_id', betIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('prop_bet_claims')
      .select('id, prop_bet_id, claimant_user_id, outcome_text, status, confirming_user_id, created_at, confirmed_at')
      .in('prop_bet_id', betIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('prop_bet_results')
      .select('id, prop_bet_id, user_id, vote_text, outcome_text, is_correct, wager_label, settled_at')
      .in('prop_bet_id', betIds)
      .order('settled_at', { ascending: true }),
  ]);

  if (optionsError) throw optionsError;
  if (votesError) throw votesError;
  if (claimsError) throw claimsError;
  if (resultsError) throw resultsError;

  const userIds = [...new Set([
    ...bets.map((bet) => bet.creator_user_id),
    ...(votes || []).map((vote) => vote.user_id),
    ...(claims || []).flatMap((claim) => [claim.claimant_user_id, claim.confirming_user_id]),
  ].filter((userId) => userId !== null && userId !== undefined))];
  const usersById = new Map();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('user_id, username')
      .in('user_id', userIds);

    if (usersError) throw usersError;
    (users || []).forEach((user) => usersById.set(String(user.user_id), user));
  }

  const optionsByBet = new Map();
  (options || []).forEach((option) => {
    if (!optionsByBet.has(option.prop_bet_id)) optionsByBet.set(option.prop_bet_id, []);
    optionsByBet.get(option.prop_bet_id).push(option);
  });
  const votesByBet = new Map();
  (votes || []).forEach((vote) => {
    if (!votesByBet.has(vote.prop_bet_id)) votesByBet.set(vote.prop_bet_id, []);
    votesByBet.get(vote.prop_bet_id).push({
      ...vote,
      username: usersById.get(String(vote.user_id))?.username || 'Unknown user',
    });
  });
  const claimsByBet = new Map();
  (claims || []).forEach((claim) => {
    if (!claimsByBet.has(claim.prop_bet_id)) claimsByBet.set(claim.prop_bet_id, []);
    claimsByBet.get(claim.prop_bet_id).push({
      ...claim,
      claimant_username: usersById.get(String(claim.claimant_user_id))?.username || 'Unknown user',
      confirming_username: claim.confirming_user_id
        ? usersById.get(String(claim.confirming_user_id))?.username || 'Unknown user'
        : null,
    });
  });
  const resultsByBet = new Map();
  (results || []).forEach((result) => {
    if (!resultsByBet.has(result.prop_bet_id)) resultsByBet.set(result.prop_bet_id, []);
    resultsByBet.get(result.prop_bet_id).push({
      ...result,
      username: usersById.get(String(result.user_id))?.username || 'Unknown user',
    });
  });

  return bets.map((bet) => {
    const betVotes = votesByBet.get(bet.id) || [];
    const betClaims = claimsByBet.get(bet.id) || [];
    const betResults = resultsByBet.get(bet.id) || [];
    const currentVote = currentUserId
      ? betVotes.find((vote) => String(vote.user_id) === String(currentUserId)) || null
      : null;
    const currentResult = currentUserId
      ? betResults.find((result) => String(result.user_id) === String(currentUserId)) || null
      : null;

    return {
      ...bet,
      creator_username: usersById.get(String(bet.creator_user_id))?.username || 'Unknown user',
      options: optionsByBet.get(bet.id) || [],
      votes: currentVote ? betVotes : [],
      claims: betClaims,
      results: currentVote ? betResults : [],
      my_result: currentResult,
      my_vote: currentVote,
      participant_count: betVotes.length,
    };
  });
}

async function getPropPixUser(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;

  const { data, error } = await supabase
    .from('users')
    .select('user_id, username, is_bot')
    .eq('user_id', normalizedUserId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function getPropPixErrorStatus(error) {
  if (error?.code === '23505' || String(error?.message || '').toLowerCase().includes('no longer pending')) {
    return 409;
  }
  if (error?.code === '23503' || error?.code === '23514') {
    return 400;
  }
  return 500;
}

async function getPropPixParticipants(propPixId) {
  const { data, error } = await supabase
    .from('prop_bet_votes')
    .select('user_id')
    .eq('prop_bet_id', propPixId);

  if (error) throw error;
  return (data || []).map((vote) => vote.user_id);
}

async function notifyPropPixResults({ propPixId, bet, claimId, actorUserId, closedByAdmin = false }) {
  const { data: results, error: resultsError } = await supabase
    .from('prop_bet_results')
    .select('id, user_id, vote_text, outcome_text, is_correct, wager_label')
    .eq('prop_bet_id', propPixId)
    .order('settled_at', { ascending: true });

  if (resultsError) throw resultsError;
  if (!results || results.length === 0) return [];

  const rows = results.map((result) => ({
    recipient_user_id: result.user_id,
    actor_user_id: actorUserId,
    notification_type: 'prop_pix_result',
    entity_type: 'prop_bet',
    entity_id: propPixId,
    title: result.is_correct ? 'Prop Pix win' : 'Prop Pix wager owed',
    body: result.is_correct
      ? `You got it right: ${bet.question} resolved as ${result.outcome_text}.`
      : `You owe ${result.wager_label}: ${bet.question} resolved as ${result.outcome_text}, not ${result.vote_text}.`,
    payload: {
      prop_bet_id: propPixId,
      result_id: result.id,
      claim_id: claimId,
      vote_text: result.vote_text,
      outcome_text: result.outcome_text,
      wager_label: result.wager_label,
      is_correct: result.is_correct,
      closed_by_admin: closedByAdmin,
    },
  }));

  const { data, error } = await supabase
    .from('notifications')
    .insert(rows)
    .select('*');
  if (error) throw error;
  return data || [];
}

// Prop Pix is deliberately separate from fight predictions and has no scoring path.
app.get('/events/:id/prop-pix', requireUserSession, async (req, res) => {
  try {
    const eventId = normalizeUserId(req.params.id);
    const currentUserId = req.authenticatedUser.user_id;
    if (!eventId) return res.status(400).json({ error: 'Event ID must be a valid integer' });

    res.set('Cache-Control', 'no-store');
    res.json(await getPropPixEventData(eventId, currentUserId));
  } catch (error) {
    console.error('Error fetching Prop Pix bets:', error);
    res.status(500).json({ error: 'Failed to fetch Prop Pix bets' });
  }
});

app.post('/events/:id/prop-pix', requireUserSession, async (req, res) => {
  try {
    const eventId = normalizeUserId(req.params.id);
    const creatorUserId = req.authenticatedUser.user_id;
    if (!eventId || !creatorUserId) return res.status(400).json({ error: 'Event ID and user ID are required' });

    const user = await getPropPixUser(creatorUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_bot) return res.status(403).json({ error: 'AI users cannot create Prop Pix bets' });

    const normalized = normalizePropPixInput(req.body);
    if (normalized.error) return res.status(400).json({ error: normalized.error });

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const { data: bet, error: betError } = await supabase
      .from('prop_bets')
      .insert({
        event_id: eventId,
        creator_user_id: creatorUserId,
        question: normalized.value.question,
        response_type: normalized.value.responseType,
        wager_label: normalized.value.wagerLabel,
      })
      .select('*')
      .single();
    if (betError) throw betError;

    if (normalized.value.responseType === 'options') {
      const { error: optionsError } = await supabase
        .from('prop_bet_options')
        .insert(normalized.value.options.map((label, index) => ({
          prop_bet_id: bet.id,
          label,
          sort_order: index,
        })));

      if (optionsError) {
        await supabase.from('prop_bets').delete().eq('id', bet.id);
        throw optionsError;
      }
    }

    res.status(201).json((await getPropPixEventData(eventId, creatorUserId)).find((row) => row.id === bet.id));
  } catch (error) {
    console.error('Error creating Prop Pix bet:', error);
    res.status(getPropPixErrorStatus(error)).json({ error: 'Failed to create Prop Pix bet' });
  }
});

app.post('/prop-pix/:id/vote', requireUserSession, async (req, res) => {
  try {
    const propPixId = normalizeUserId(req.params.id);
    const userId = req.authenticatedUser.user_id;
    if (!propPixId || !userId) return res.status(400).json({ error: 'Prop Pix ID and user ID are required' });

    const [bet, user] = await Promise.all([getPropPixBetById(propPixId), getPropPixUser(userId)]);
    if (!bet) return res.status(404).json({ error: 'Prop Pix bet not found' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_bot) return res.status(403).json({ error: 'AI users cannot vote on Prop Pix bets' });
    if (bet.status !== 'open') return res.status(409).json({ error: 'This Prop Pix bet is no longer accepting votes' });

    const { data: existingVote, error: existingVoteError } = await supabase
      .from('prop_bet_votes')
      .select('id')
      .eq('prop_bet_id', propPixId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingVoteError) throw existingVoteError;
    if (existingVote) return res.status(409).json({ error: 'Your vote is already locked in for this Prop Pix bet' });

    const normalized = normalizePropPixVote(req.body, bet.response_type);
    if (normalized.error) return res.status(400).json({ error: normalized.error });

    let optionId = normalized.value.optionId;
    if (bet.response_type === 'options') {
      const { data: option, error: optionError } = await supabase
        .from('prop_bet_options')
        .select('id')
        .eq('id', optionId)
        .eq('prop_bet_id', propPixId)
        .maybeSingle();
      if (optionError) throw optionError;
      if (!option) return res.status(400).json({ error: 'That option is not part of this Prop Pix bet' });
    } else {
      optionId = null;
    }

    const { data: vote, error: voteError } = await supabase
      .from('prop_bet_votes')
      .insert({
        prop_bet_id: propPixId,
        user_id: userId,
        option_id: optionId,
        response_text: normalized.value.responseText,
      })
      .select('id, prop_bet_id, user_id, option_id, response_text, created_at, updated_at')
      .single();
    if (voteError) throw voteError;

    res.json(vote);
  } catch (error) {
    console.error('Error saving Prop Pix vote:', error);
    res.status(getPropPixErrorStatus(error)).json({ error: 'Failed to save Prop Pix vote' });
  }
});

app.post('/prop-pix/:id/claim', requireUserSession, async (req, res) => {
  try {
    const propPixId = normalizeUserId(req.params.id);
    const userId = req.authenticatedUser.user_id;
    if (!propPixId || !userId) return res.status(400).json({ error: 'Prop Pix ID and user ID are required' });

    const [bet, user] = await Promise.all([getPropPixBetById(propPixId), getPropPixUser(userId)]);
    if (!bet) return res.status(404).json({ error: 'Prop Pix bet not found' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_bot) return res.status(403).json({ error: 'AI users cannot submit claims' });
    if (bet.status !== 'open') return res.status(409).json({ error: 'This Prop Pix bet is not open for claims' });

    const { data: voter, error: voterError } = await supabase
      .from('prop_bet_votes')
      .select('id')
      .eq('prop_bet_id', propPixId)
      .eq('user_id', userId)
      .maybeSingle();
    if (voterError) throw voterError;
    if (!voter) return res.status(403).json({ error: 'Vote on this Prop Pix before submitting a claim' });

    const normalizedOutcome = normalizeOutcome(req.body?.outcome_text || req.body?.outcomeText);
    if (normalizedOutcome.error) return res.status(400).json({ error: normalizedOutcome.error });

    const { data: claimedBet, error: statusError } = await supabase
      .from('prop_bets')
      .update({ status: 'claim_pending' })
      .eq('id', propPixId)
      .eq('status', 'open')
      .select('id')
      .maybeSingle();
    if (statusError) throw statusError;
    if (!claimedBet) return res.status(409).json({ error: 'Another claim is already pending for this bet' });

    const { data: claim, error: claimError } = await supabase
      .from('prop_bet_claims')
      .insert({
        prop_bet_id: propPixId,
        claimant_user_id: userId,
        outcome_text: normalizedOutcome.value,
      })
      .select('id, prop_bet_id, claimant_user_id, outcome_text, status, created_at')
      .single();

    if (claimError) {
      await supabase.from('prop_bets').update({ status: 'open' }).eq('id', propPixId).eq('status', 'claim_pending');
      throw claimError;
    }

    try {
      const voterIds = await getPropPixParticipants(propPixId);
      const recipients = buildPropPixNotificationRecipients({
        creatorUserId: bet.creator_user_id,
        claimantUserId: userId,
        voterUserIds: voterIds,
      }).filter((recipientId) => recipientId !== userId);
      await createNotifications({
        supabase,
        recipientUserIds: recipients,
        actorUserId: userId,
        notificationType: 'prop_pix_claim_submitted',
        entityType: 'prop_bet',
        entityId: propPixId,
        title: 'Prop Pix claim submitted',
        body: `${user.username} says the outcome is: ${normalizedOutcome.value}`,
        payload: { prop_bet_id: propPixId, claim_id: claim.id },
      });
    } catch (notificationError) {
      console.error('Prop Pix claim notification error:', notificationError);
    }

    res.status(201).json(claim);
  } catch (error) {
    console.error('Error submitting Prop Pix claim:', error);
    res.status(getPropPixErrorStatus(error)).json({ error: 'Failed to submit Prop Pix claim' });
  }
});

app.post('/prop-pix/:id/claim/:claimId/confirm', requireUserSession, async (req, res) => {
  try {
    const propPixId = normalizeUserId(req.params.id);
    const claimId = normalizeUserId(req.params.claimId);
    const confirmingUserId = req.authenticatedUser.user_id;
    if (!propPixId || !claimId || !confirmingUserId) {
      return res.status(400).json({ error: 'Prop Pix ID, claim ID, and user ID are required' });
    }

    const user = await getPropPixUser(confirmingUserId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_bot) return res.status(403).json({ error: 'AI users cannot confirm claims' });

    const { data: claim, error: claimLookupError } = await supabase
      .from('prop_bet_claims')
      .select('id, prop_bet_id')
      .eq('id', claimId)
      .eq('prop_bet_id', propPixId)
      .maybeSingle();
    if (claimLookupError) throw claimLookupError;
    if (!claim) return res.status(404).json({ error: 'Claim not found for this Prop Pix bet' });

    const { data: confirmation, error: confirmationError } = await supabase.rpc('confirm_prop_pix_claim', {
      p_claim_id: claimId,
      p_confirming_user_id: confirmingUserId,
    });
    if (confirmationError) throw confirmationError;

    const bet = await getPropPixBetById(propPixId);
    try {
      await notifyPropPixResults({
        propPixId,
        bet,
        claimId,
        actorUserId: confirmingUserId,
      });
    } catch (notificationError) {
      console.error('Prop Pix closure notification error:', notificationError);
    }

    res.json({ confirmation: confirmation?.[0] || null, bet });
  } catch (error) {
    console.error('Error confirming Prop Pix claim:', error);
    res.status(getPropPixErrorStatus(error)).json({ error: error?.message || 'Failed to confirm Prop Pix claim' });
  }
});

app.post('/admin/prop-pix/:id/claim/:claimId/close', requireAdminSession, async (req, res) => {
  try {
    const propPixId = normalizeUserId(req.params.id);
    const claimId = normalizeUserId(req.params.claimId);
    if (!propPixId || !claimId) {
      return res.status(400).json({ error: 'Prop Pix ID and claim ID are required' });
    }

    const { data: closure, error: closureError } = await supabase.rpc('admin_close_prop_pix_claim', {
      p_prop_bet_id: propPixId,
      p_claim_id: claimId,
      p_admin_user_id: req.adminUser.user_id,
    });
    if (closureError) throw closureError;

    const closedClaim = closure?.[0];
    if (!closedClaim) {
      return res.status(404).json({ error: 'Pending claim not found for this Prop Pix bet' });
    }

    const bet = await getPropPixBetById(propPixId);
    try {
      await notifyPropPixResults({
        propPixId,
        bet,
        claimId,
        actorUserId: req.adminUser.user_id,
        closedByAdmin: true,
      });
    } catch (notificationError) {
      console.error('Admin Prop Pix closure notification error:', notificationError);
    }

    res.json({ confirmation: closedClaim, bet });
  } catch (error) {
    console.error('Error closing Prop Pix claim as admin:', error);
    res.status(getPropPixErrorStatus(error)).json({ error: error?.message || 'Failed to close Prop Pix claim' });
  }
});

app.post('/prop-pix/:id/cancel', requireUserSession, async (req, res) => {
  try {
    const propPixId = normalizeUserId(req.params.id);
    const userId = req.authenticatedUser.user_id;
    if (!propPixId || !userId) return res.status(400).json({ error: 'Prop Pix ID and user ID are required' });

    const [bet, user] = await Promise.all([getPropPixBetById(propPixId), getPropPixUser(userId)]);
    if (!bet) return res.status(404).json({ error: 'Prop Pix bet not found' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (String(bet.creator_user_id) !== String(userId)) return res.status(403).json({ error: 'Only the creator can cancel this Prop Pix bet' });
    if (!['open', 'claim_pending'].includes(bet.status)) return res.status(409).json({ error: 'This Prop Pix bet cannot be cancelled' });

    const { data: updatedBet, error: updateError } = await supabase
      .from('prop_bets')
      .update({ status: 'cancelled' })
      .eq('id', propPixId)
      .in('status', ['open', 'claim_pending'])
      .select('*')
      .single();
    if (updateError) throw updateError;

    await supabase
      .from('prop_bet_claims')
      .update({ status: 'rejected' })
      .eq('prop_bet_id', propPixId)
      .eq('status', 'pending');

    res.json(updatedBet);
  } catch (error) {
    console.error('Error cancelling Prop Pix bet:', error);
    res.status(getPropPixErrorStatus(error)).json({ error: 'Failed to cancel Prop Pix bet' });
  }
});

app.get('/user/:user_id/notifications', requireUserSession, requireOwnUserId, async (req, res) => {
  try {
    const userId = normalizeUserId(req.params.user_id);
    if (!userId) return res.status(400).json({ error: 'User ID must be a valid integer' });

    const requestedLimit = Number.parseInt(String(req.query.limit || '40'), 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 40, 1), 100);
    const unreadOnly = String(req.query.unread_only || '').toLowerCase() === 'true';
    let notificationsQuery = supabase
      .from('notifications')
      .select('id, recipient_user_id, actor_user_id, notification_type, entity_type, entity_id, title, body, payload, read_at, created_at')
      .eq('recipient_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (unreadOnly) notificationsQuery = notificationsQuery.is('read_at', null);

    const [{ data: notifications, error: notificationsError }, { count: unreadCount, error: countError }] = await Promise.all([
      notificationsQuery,
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', userId)
        .is('read_at', null),
    ]);
    if (notificationsError) throw notificationsError;
    if (countError) throw countError;

    const actorIds = [...new Set((notifications || []).map((notification) => notification.actor_user_id).filter(Boolean))];
    const actorMap = new Map();
    if (actorIds.length > 0) {
      const { data: actors, error: actorsError } = await supabase
        .from('users')
        .select('user_id, username')
        .in('user_id', actorIds);
      if (actorsError) throw actorsError;
      (actors || []).forEach((actor) => actorMap.set(String(actor.user_id), actor.username));
    }

    res.set('Cache-Control', 'no-store');
    res.json({
      notifications: (notifications || []).map((notification) => ({
        ...notification,
        actor_username: notification.actor_user_id ? actorMap.get(String(notification.actor_user_id)) || null : null,
      })),
      unread_count: unreadCount || 0,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.patch('/user/:user_id/notifications/:notification_id/read', requireUserSession, requireOwnUserId, async (req, res) => {
  try {
    const userId = normalizeUserId(req.params.user_id);
    const notificationId = normalizeUserId(req.params.notification_id);
    if (!userId || !notificationId) return res.status(400).json({ error: 'User ID and notification ID must be valid integers' });

    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('recipient_user_id', userId)
      .select('id, read_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Notification not found' });
    res.json(data);
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

app.post('/user/:user_id/notifications/read-all', requireUserSession, requireOwnUserId, async (req, res) => {
  try {
    const userId = normalizeUserId(req.params.user_id);
    if (!userId) return res.status(400).json({ error: 'User ID must be a valid integer' });

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_user_id', userId)
      .is('read_at', null);
    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

// Get event leaderboard
app.get('/events/:id/leaderboard', async (req, res) => {
  try {
    const { id } = req.params;
    const userCache = await fetchUsersWithPlayercards();
    const { leaderboard } = await buildEventLeaderboard(id, { userCache });
    const currentYear = new Date().getFullYear();
    const leaderboardUserIds = leaderboard.map(entry => entry.user_id);
    const [eventWinCounts, humanEventWinCounts] = await Promise.all([
      fetchEventWinCounts(leaderboardUserIds, currentYear),
      fetchHumanEventWinCounts(leaderboardUserIds, currentYear, userCache),
    ]);
    let leaderboardWithCrowns = addEventWinCounts(leaderboard, eventWinCounts);
    leaderboardWithCrowns = addEventWinCounts(leaderboardWithCrowns, humanEventWinCounts, 'event_win_count_human');
    res.json(leaderboardWithCrowns);
  } catch (error) {
    console.error('Error processing event leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to process event leaderboard',
      details: error.message 
    });
  }
});

// Compare the signed-in user's visible picks with one human participant on this card.
app.get('/events/:id/friend-comparison', requireUserSession, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const eventId = normalizeUserId(req.params.id);
    const friendUserId = req.query.friend_user_id
      ? normalizeUserId(req.query.friend_user_id)
      : null;
    if (!eventId) return res.status(400).json({ error: 'Invalid event id' });
    if (req.query.friend_user_id && !friendUserId) {
      return res.status(400).json({ error: 'Invalid friend user id' });
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, date, is_completed')
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const [users, fightRows] = await Promise.all([
      fetchAllUsers(`
        user_id,
        username,
        is_bot,
        avatar_config,
        selected_playercard_id,
        playercards!selected_playercard_id (id, name, image_url, category)
      `),
      fetchAllFromSupabase(
        supabase
          .from('ufc_full_fight_card')
          .select('FightId, FightOrder, CardSegment, FightStatus, FighterId, FirstName, LastName, Corner')
          .eq('EventId', eventId)
      ),
    ]);
    const fightIds = [...new Set(
      (fightRows || []).map((row) => Number(row.FightId)).filter(Number.isFinite)
    )];
    const [predictions, predictionResults, fightResults] = fightIds.length > 0
      ? await Promise.all([
          fetchAllFromSupabase(
            supabase
              .from('predictions')
              .select('fight_id, fighter_id, user_id, username')
              .in('fight_id', fightIds)
          ),
          fetchAllFromSupabase(
            supabase
              .from('prediction_results')
              .select('fight_id, user_id, username, predicted_correctly, points')
              .eq('event_id', eventId)
          ),
          fetchAllFromSupabase(
            supabase
              .from('fight_results')
              .select('fight_id, fighter_id, is_completed, result_type')
              .in('fight_id', fightIds)
          ),
        ])
      : [[], [], []];

    const comparison = buildEventFriendComparison({
      event,
      viewerUserId: req.authenticatedUser.user_id,
      friendUserId,
      users,
      fightRows,
      predictions,
      predictionResults,
      fightResults,
    });
    if (friendUserId && !comparison.selected_friend) {
      return res.status(404).json({ error: 'That friend has no picks on this event' });
    }
    return res.json(comparison);
  } catch (error) {
    console.error('Error building friend comparison:', error);
    return res.status(500).json({ error: 'Failed to build friend comparison' });
  }
});

// Build a human-only social recap after an event is finalized.
app.get('/events/:id/recap', async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isFinite(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, date, is_completed, image_url')
      .eq('id', eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (!event.is_completed) {
      return res.json(buildEventRecap({ event }));
    }

    const userCache = await fetchUsersWithPlayercards();
    const [leaderboardResult, fightRows, predictionResults] = await Promise.all([
      buildEventLeaderboard(eventId, { userCache }),
      fetchAllFromSupabase(
        supabase
          .from('ufc_full_fight_card')
          .select('FightId, FightOrder, CardSegment, FighterId, FirstName, LastName, Corner')
          .eq('EventId', eventId)
      ),
      fetchAllFromSupabase(
        supabase
          .from('prediction_results')
          .select('fight_id, user_id, username, predicted_correctly, points')
          .eq('event_id', eventId)
      ),
    ]);
    const fightIds = [...new Set(
      (fightRows || []).map((row) => Number(row.FightId)).filter(Number.isFinite)
    )];
    const [predictions, fightResults] = fightIds.length > 0
      ? await Promise.all([
          fetchAllFromSupabase(
            supabase
              .from('predictions')
              .select('fight_id, fighter_id, betting_odds, user_id, username')
              .in('fight_id', fightIds)
          ),
          fetchAllFromSupabase(
            supabase
              .from('fight_results')
              .select('fight_id, fighter_id, is_completed, result_type')
              .in('fight_id', fightIds)
          ),
        ])
      : [[], []];

    return res.json(buildEventRecap({
      event,
      leaderboard: leaderboardResult.leaderboard,
      predictions,
      predictionResults,
      fightRows,
      fightResults,
      users: userCache.users,
    }));
  } catch (error) {
    console.error('Error building event recap:', error);
    return res.status(500).json({ error: 'Failed to build event recap' });
  }
});

// Finalize an event, update Supabase status, and persist winners
app.post('/events/:id/finalize', requireAdminSession, async (req, res) => {
  try {
    const { id } = req.params;
    const eventId = Number(id);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const targetStatus = (req.body && req.body.status) ? String(req.body.status) : 'Final';

    // Ensure the event exists
    const { data: eventRecord, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .single();

    if (eventError || !eventRecord) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Mark event as completed
    const { error: updateEventError } = await supabase
      .from('events')
      .update({ is_completed: true })
      .eq('id', eventId);

    if (updateEventError) {
      console.error('Error updating event record:', updateEventError);
      return res.status(500).json({ error: 'Failed to update event status' });
    }

    // Update EventStatus on the fight card rows
    const { error: updateCardError } = await supabase
      .from('ufc_full_fight_card')
      .update({ EventStatus: targetStatus })
      .eq('EventId', eventId);

    if (updateCardError) {
      console.error('Error updating EventStatus:', updateCardError);
      return res.status(500).json({ error: 'Failed to update fight card status' });
    }

    const userCache = await fetchUsersWithPlayercards();
    const userIds = buildUserIdList(userCache.users);
    let winnerSummary = { leaderboard: [], winners: [] };

    if (userIds.length > 0) {
      const allTimeResults = await fetchAllFromSupabase(
        supabase
          .from('prediction_results')
          .select('user_id, predicted_correctly, created_at')
          .in('user_id', userIds)
      );
      winnerSummary = await buildEventLeaderboard(eventId, {
        allTimeResults,
        userCache,
      });

      await clearEventWinnersForEvent(eventId);

      if (winnerSummary.winners.length > 0) {
        const payload = winnerSummary.winners.map((winner) => ({
          event_id: eventId,
          user_id: winner.user_id,
          points: winner.total_points
        }));

        const { error: insertError } = await supabase
          .from('event_winners')
          .insert(payload);

        if (insertError) {
          console.error('Error inserting event winners:', insertError);
          return res.status(500).json({ error: 'Failed to save event winners' });
        }
      }
    }

    await logAdminAction(req, {
      action: 'event.finalize',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        status: targetStatus,
        leaderboard_size: winnerSummary.leaderboard.length,
        winner_count: winnerSummary.winners.length,
      },
    });

    res.json({
      event_id: eventId,
      status: targetStatus,
      winners: winnerSummary.winners
    });
  } catch (error) {
    console.error('Error finalizing event:', error);
    await logAdminAction(req, {
      action: 'event.finalize',
      status: 'error',
      targetType: 'event',
      targetId: req.params.id,
      eventId: Number(req.params.id),
      metadata: {
        message: error.message,
      },
    });
    res.status(500).json({ 
      error: 'Failed to finalize event',
      details: error.message
    });
  }
});

// Backfill event winners for events that are already Final/completed
app.post('/events/backfill-winners', requireAdminSession, async (req, res) => {
  try {
    const body = req.body || {};
    let targetIds = [];

    if (Array.isArray(body.eventIds) && body.eventIds.length > 0) {
      targetIds = Array.from(new Set(
        body.eventIds
          .map(id => Number(id))
          .filter(id => !Number.isNaN(id))
      ));
    } else {
      const candidateIds = new Set();

      // Events marked completed in events table
      const { data: completedEvents, error: completedError } = await supabase
        .from('events')
        .select('id')
        .eq('is_completed', true);

      if (completedError) {
        console.warn('Unable to fetch completed events:', completedError);
      } else {
        (completedEvents || []).forEach(event => {
          const eventId = Number(event.id);
          if (!Number.isNaN(eventId)) {
            candidateIds.add(eventId);
          }
        });
      }

      // Events with EventStatus already set to Final on the fight card table
      const { data: finalCards, error: finalCardsError } = await supabase
        .from('ufc_full_fight_card')
        .select('EventId, EventStatus')
        .eq('EventStatus', 'Final');

      if (finalCardsError) {
        console.warn('Unable to fetch final fight cards:', finalCardsError);
      } else {
        (finalCards || []).forEach(row => {
          const eventId = Number(row.EventId);
          if (!Number.isNaN(eventId)) {
            candidateIds.add(eventId);
          }
        });
      }

      targetIds = Array.from(candidateIds);
    }

    if (!targetIds.length) {
      return res.json({
        processed: 0,
        skipped: [],
        message: 'No events found that require backfilling'
      });
    }

    const userCache = await fetchUsersWithPlayercards();
    const userIds = buildUserIdList(userCache.users);
    const allTimeResults = userIds.length > 0
      ? await fetchAllFromSupabase(
        supabase
          .from('prediction_results')
          .select('user_id, predicted_correctly, created_at')
          .in('user_id', userIds)
      )
      : [];

    const processed = [];
    const skipped = [];

    for (const eventId of targetIds) {
      try {
        if (userIds.length === 0) {
          skipped.push({ event_id: eventId, reason: 'No eligible winners (did users submit picks?)' });
          continue;
        }

        const { winners } = await buildEventLeaderboard(eventId, {
          allTimeResults,
          userCache,
        });

        await clearEventWinnersForEvent(eventId);

        if (winners.length === 0) {
          skipped.push({ event_id: eventId, reason: 'No eligible winners (did users submit picks?)' });
          continue;
        }

        const payload = winners.map((winner) => ({
          event_id: eventId,
          user_id: winner.user_id,
          points: winner.total_points
        }));

        const { error: insertError } = await supabase
          .from('event_winners')
          .insert(payload);

        if (insertError) {
          throw new Error(`Failed to save winners: ${insertError.message}`);
        }

        processed.push({
          event_id: eventId,
          winner_count: winners.length,
        });
      } catch (eventError) {
        console.error(`Failed to process event ${eventId}:`, eventError);
        skipped.push({ event_id: eventId, reason: eventError.message });
      }
    }

    await logAdminAction(req, {
      action: 'event.backfill_winners',
      status: 'success',
      targetType: 'event_batch',
      metadata: {
        requested_event_ids: targetIds,
        processed_count: processed.length,
        skipped_count: skipped.length,
      },
    });

    res.json({
      processed: processed.length,
      processed_events: processed,
      skipped
    });
  } catch (error) {
    console.error('Error backfilling event winners:', error);
    await logAdminAction(req, {
      action: 'event.backfill_winners',
      status: 'error',
      targetType: 'event_batch',
      metadata: {
        message: error.message,
      },
    });
    res.status(500).json({
      error: 'Failed to backfill event winners',
      details: error.message
    });
  }
});

app.get('/ufc_full_fight_card/:id', async (req, res) => {
  try {
    const { id } = req.params;
    debugLog('Fetching fight data for ID:', id);

    // First get the fight data (remove .single() here)
    const { data: fightData, error: getFightError } = await supabase
      .from('ufc_full_fight_card')
      .select(FIGHT_CARD_FIGHT_SELECT)
      .eq('FightId', id);

    if (getFightError) {
      console.error('Error fetching fight data:', getFightError);
      return res.status(500).json({ error: 'Failed to fetch fight data' });
    }

    if (!fightData || fightData.length === 0) {
      return res.status(404).json({ error: 'Fight not found' });
    }

    // Get the event_id and fighter IDs
    const event_id = fightData[0].EventId;
    const redFighter = fightData.find(f => f.Corner === 'Red');
    const blueFighter = fightData.find(f => f.Corner === 'Blue');

    if (!redFighter || !blueFighter) {
      return res.status(404).json({ error: 'Missing fighter data' });
    }

    // Get the fight result (keep .single() here)
    const { data: fightResult, error: getResultError } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed, result_type')
      .eq('fight_id', id)
      .single();

    if (getResultError && getResultError.code !== 'PGRST116') {
      console.error('Error fetching fight result:', getResultError);
      return res.status(500).json({ error: 'Failed to fetch fight result' });
    }

    const weightclassMap = await getWeightclassMapping();
    const transformedFight = buildFightResponse({
      fightId: id,
      eventId: event_id,
      redFighter,
      blueFighter,
      result: fightResult,
      weightclassMap,
    });

    res.json(transformedFight);
  } catch (error) {
    console.error('Error fetching fight data:', error);
    res.status(500).json({ error: 'Failed to fetch fight data' });
  }
});

// Legacy migration endpoint, disabled unless ENABLE_LEGACY_ADMIN_MIGRATION_ROUTES=true.
app.post('/migrate/fight-results', requireLegacyAdminMigrationRoutes, requireAdminSession, async (req, res) => {
  try {
    // Get all fight results
    const { data: fightResults, error: resultsError } = await supabase
      .from('fight_results')
      .select('*');

    if (resultsError) {
      console.error('Error fetching fight results:', resultsError);
      return res.status(500).json({ error: 'Failed to fetch fight results' });
    }

    // Get all fights
    const { data: fights, error: fightsError } = await supabase
      .from('ufc_full_fight_card')
      .select('*');

    if (fightsError) {
      console.error('Error fetching fights:', fightsError);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    // Create a map of fight IDs to their fighters
    const fightMap = new Map();
    fights.forEach(fighter => {
      if (!fightMap.has(fighter.FightId)) {
        fightMap.set(fighter.FightId, {
          red: null,
          blue: null
        });
      }
      
      const corner = fighter.Corner?.toLowerCase();
      if (corner === 'red') {
        fightMap.get(fighter.FightId).red = fighter;
      } else if (corner === 'blue') {
        fightMap.get(fighter.FightId).blue = fighter;
      }
    });

    // Update each fight result
    const updates = [];
    for (const result of fightResults) {
      debugLog('Processing fight result:', {
        fight_id: result.fight_id,
        current_winner: result.winner,
        winner_type: typeof result.winner
      });

      const fighters = fightMap.get(result.fight_id);
      if (!fighters || !fighters.red || !fighters.blue) {
        debugLog('Skipping fight - missing fighter data:', result.fight_id);
        continue;
      }

      // If winner is already a number (fighter_id), keep it as is
      if (typeof result.winner === 'number') {
        debugLog('Winner is already a fighter_id:', result.winner);
        continue;
      }

      // Create all possible name formats for each fighter
      const redFighterFormats = [
        fighters.red.FirstName + ' ' + fighters.red.LastName,
        fighters.red.FirstName + ' "' + fighters.red.Nickname + '" ' + fighters.red.LastName,
        fighters.red.FirstName + ' ' + fighters.red.Nickname + ' ' + fighters.red.LastName
      ].filter(Boolean);

      const blueFighterFormats = [
        fighters.blue.FirstName + ' ' + fighters.blue.LastName,
        fighters.blue.FirstName + ' "' + fighters.blue.Nickname + '" ' + fighters.blue.LastName,
        fighters.blue.FirstName + ' ' + fighters.blue.Nickname + ' ' + fighters.blue.LastName
      ].filter(Boolean);

      debugLog('Fighter name formats:', {
        fight_id: result.fight_id,
        red: redFighterFormats,
        blue: blueFighterFormats,
        winner: result.winner
      });

      let winner_id = null;
      if (redFighterFormats.includes(result.winner)) {
        winner_id = fighters.red.FighterId;
        debugLog('Matched red fighter:', {
          fight_id: result.fight_id,
          winner_name: result.winner,
          winner_id: winner_id
        });
      } else if (blueFighterFormats.includes(result.winner)) {
        winner_id = fighters.blue.FighterId;
        debugLog('Matched blue fighter:', {
          fight_id: result.fight_id,
          winner_name: result.winner,
          winner_id: winner_id
        });
      } else {
        debugLog('No match found for winner:', {
          fight_id: result.fight_id,
          winner: result.winner
        });
      }

      if (winner_id !== null) {
        updates.push({
          fight_id: result.fight_id,
          fighter_id: winner_id,
          is_completed: result.is_completed
        });
      }
    }

    // Batch update the fight results
    if (updates.length > 0) {
      const { error: updateError } = await supabase
        .from('fight_results')
        .upsert(updates, {
          onConflict: ['fight_id']
        });

      if (updateError) {
        console.error('Error updating fight results:', updateError);
        return res.status(500).json({ error: 'Failed to update fight results' });
      }
    }

    await logAdminAction(req, {
      action: 'migration.fight_results',
      status: 'success',
      targetType: 'migration',
      metadata: {
        updated_count: updates.length,
      },
    });

    res.json({ message: `Successfully updated ${updates.length} fight results` });
  } catch (error) {
    console.error('Error in migration:', error);
    await logAdminAction(req, {
      action: 'migration.fight_results',
      status: 'error',
      targetType: 'migration',
      metadata: {
        message: error.message,
      },
    });
    res.status(500).json({ error: 'Migration failed' });
  }
});

// Get user profile by username
app.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const user = await fetchSingleUserProfile('username', username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('User profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile by user_id
app.get('/user/by-id/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    const user = await fetchSingleUserProfile('user_id', user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('User profile by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get per-event stats for a user (avoids client-side N+1 requests)
app.get('/user/:user_id/event-stats', async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const resultsQuery = supabase
      .from('prediction_results')
      .select('event_id, predicted_correctly, points')
      .eq('user_id', user_id);
    let results = [];
    try {
      results = await fetchAllFromSupabase(resultsQuery);
    } catch (error) {
      console.error('Error fetching prediction_results for event stats:', error);
      return res.status(500).json({ error: 'Failed to fetch prediction results' });
    }

    if (!results || results.length === 0) {
      return res.json([]);
    }

    const statsByEvent = new Map();
    results.forEach(result => {
      const eventId = Number(result.event_id);
      if (Number.isNaN(eventId)) {
        return;
      }
      if (!statsByEvent.has(eventId)) {
        statsByEvent.set(eventId, {
          event_id: eventId,
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0
        });
      }
      const stat = statsByEvent.get(eventId);
      stat.total_predictions += 1;
      if (result.predicted_correctly) {
        stat.correct_predictions += 1;
      }
      stat.total_points += (result.points || 0);
    });

    const eventIds = Array.from(statsByEvent.keys()).filter(id => !Number.isNaN(id));
    if (eventIds.length === 0) {
      return res.json([]);
    }

    const eventsQuery = supabase
      .from('events')
      .select('id, name, date, venue, location_city, location_state, location_country')
      .in('id', eventIds);
    let events = [];
    try {
      events = await fetchAllFromSupabase(eventsQuery);
    } catch (error) {
      console.error('Error fetching events for event stats:', error);
      return res.status(500).json({ error: 'Failed to fetch events for stats' });
    }
    const eventMap = new Map((events || []).map(event => [Number(event.id), event]));

    const stats = Array.from(statsByEvent.values())
      .map(stat => {
        const accuracy = stat.total_predictions > 0
          ? ((stat.correct_predictions / stat.total_predictions) * 100).toFixed(2)
          : '0.00';
        return {
          event: eventMap.get(stat.event_id) || { id: stat.event_id },
          total_predictions: stat.total_predictions,
          correct_predictions: stat.correct_predictions,
          total_points: stat.total_points,
          accuracy
        };
      })
      .sort((a, b) => {
        const aDate = a.event?.date ? new Date(a.event.date) : 0;
        const bDate = b.event?.date ? new Date(b.event.date) : 0;
        return bDate - aDate;
      });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching user event stats:', error);
    res.status(500).json({ error: 'Failed to fetch user event stats' });
  }
});

const isMissingReminderTypeColumnError = (error) => {
  const message = [
    error?.message || '',
    error?.details || '',
    error?.hint || '',
  ]
    .join(' ')
    .toLowerCase();

  return (
    message.includes('reminder_type') &&
    (message.includes('column') || error?.code === '42703' || error?.code === 'PGRST204')
  );
};

app.get('/user/:user_id/vote-reminders', requireUserSession, requireOwnUserId, async (req, res) => {
  try {
    const normalizedUserId = Number.parseInt(String(req.params.user_id), 10);
    if (!Number.isFinite(normalizedUserId)) {
      return res.status(400).json({ error: 'User ID must be a valid integer' });
    }

    const { data, error } = await supabase
      .from('fighter_vote_reminders')
      .select('fighter_id, fighter_name, reminder_type, created_at, updated_at')
      .eq('user_id', normalizedUserId)
      .order('updated_at', { ascending: false });

    if (error && isMissingReminderTypeColumnError(error)) {
      const fallback = await supabase
        .from('fighter_vote_reminders')
        .select('fighter_id, fighter_name, created_at, updated_at')
        .eq('user_id', normalizedUserId)
        .order('updated_at', { ascending: false });

      if (fallback.error) {
        console.error('Error fetching vote reminders (fallback):', fallback.error);
        return res.status(500).json({ error: 'Failed to fetch vote reminders' });
      }

      const normalizedFallback = (fallback.data || []).map((row) => ({
        ...row,
        reminder_type: 'broken_heart'
      }));
      return res.json(normalizedFallback);
    }

    if (error) {
      console.error('Error fetching vote reminders:', error);
      return res.status(500).json({ error: 'Failed to fetch vote reminders' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Vote reminders fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/user/:user_id/vote-reminders/:fighter_id', requireUserSession, requireOwnUserId, async (req, res) => {
  try {
    const normalizedUserId = Number.parseInt(String(req.params.user_id), 10);
    const normalizedFighterId = Number.parseInt(String(req.params.fighter_id), 10);
    const fighterName = typeof req.body?.fighter_name === 'string'
      ? req.body.fighter_name.trim()
      : '';
    const reminderTypeRaw = typeof req.body?.reminder_type === 'string'
      ? req.body.reminder_type.trim()
      : '';
    const reminderType = reminderTypeRaw || 'broken_heart';

    if (!Number.isFinite(normalizedUserId)) {
      return res.status(400).json({ error: 'User ID must be a valid integer' });
    }
    if (!Number.isFinite(normalizedFighterId)) {
      return res.status(400).json({ error: 'Fighter ID must be a valid integer' });
    }
    if (!['broken_heart', 'heart_eyes'].includes(reminderType)) {
      return res.status(400).json({ error: 'reminder_type must be "broken_heart" or "heart_eyes"' });
    }

    const { data, error } = await supabase
      .from('fighter_vote_reminders')
      .upsert([{
        user_id: normalizedUserId,
        fighter_id: normalizedFighterId,
        fighter_name: fighterName || null,
        reminder_type: reminderType
      }], { onConflict: 'user_id,fighter_id' })
      .select('fighter_id, fighter_name, reminder_type, created_at, updated_at')
      .single();

    if (error && isMissingReminderTypeColumnError(error)) {
      const fallback = await supabase
        .from('fighter_vote_reminders')
        .upsert([{
          user_id: normalizedUserId,
          fighter_id: normalizedFighterId,
          fighter_name: fighterName || null
        }], { onConflict: 'user_id,fighter_id' })
        .select('fighter_id, fighter_name, created_at, updated_at')
        .single();

      if (fallback.error) {
        console.error('Error saving vote reminder (fallback):', fallback.error);
        return res.status(500).json({ error: 'Failed to save vote reminder' });
      }

      return res.json({
        ...fallback.data,
        reminder_type: reminderType
      });
    }

    if (error) {
      console.error('Error saving vote reminder:', error);
      return res.status(500).json({ error: 'Failed to save vote reminder' });
    }

    res.json(data);
  } catch (error) {
    console.error('Vote reminder save error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/user/:user_id/vote-reminders/:fighter_id', requireUserSession, requireOwnUserId, async (req, res) => {
  try {
    const normalizedUserId = Number.parseInt(String(req.params.user_id), 10);
    const normalizedFighterId = Number.parseInt(String(req.params.fighter_id), 10);

    if (!Number.isFinite(normalizedUserId)) {
      return res.status(400).json({ error: 'User ID must be a valid integer' });
    }
    if (!Number.isFinite(normalizedFighterId)) {
      return res.status(400).json({ error: 'Fighter ID must be a valid integer' });
    }

    const { error } = await supabase
      .from('fighter_vote_reminders')
      .delete()
      .eq('user_id', normalizedUserId)
      .eq('fighter_id', normalizedFighterId);

    if (error) {
      console.error('Error deleting vote reminder:', error);
      return res.status(500).json({ error: 'Failed to delete vote reminder' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Vote reminder delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get season highlights for a user and year
app.get('/user/:user_id/highlights/:year', async (req, res) => {
  try {
    const { user_id, year } = req.params;
    const normalizedPeriod = String(year || '').trim().toLowerCase();
    const isAllTime = normalizedPeriod === 'all-time' || normalizedPeriod === 'alltime' || normalizedPeriod === 'all';
    const numericYear = Number(year);

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!isAllTime && (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100)) {
      return res.status(400).json({ error: 'Year must be a valid 4-digit number or "all-time"' });
    }

    const periodLabel = isAllTime ? 'all-time' : String(numericYear);
    const seasonStart = isAllTime ? null : `${numericYear}-01-01`;
    const nextSeasonStart = isAllTime ? null : `${numericYear + 1}-01-01`;
    const parseOddsValue = (value) => {
      if (value === null || value === undefined) return null;
      const parsed = Number.parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const roundTo = (value, decimals = 2) => Number(Number(value || 0).toFixed(decimals));
    const formatCardTier = (tier) => {
      if (!tier) return 'Unknown';
      if (tier === 'Prelims1') return 'Prelims';
      if (tier === 'Prelims2') return 'Early Prelims';
      return tier;
    };
    const normalizeWeightclassLabel = (value) => {
      const raw = (value || '').toString().trim();
      if (!raw) return 'Unknown';
      const lower = raw.toLowerCase();
      if (lower === 'unknown' || lower === 'n/a' || lower === 'na' || lower === 'null' || lower === 'none') {
        return 'Unknown';
      }
      return raw;
    };
    const normalizeCornerLabel = (value) => {
      const lower = (value || '').toString().trim().toLowerCase();
      if (lower === 'red') return 'Red';
      if (lower === 'blue') return 'Blue';
      return 'Unknown';
    };
    const normalizeUsernameKey = (value) => (value || '').toString().trim().toLowerCase();
    const isBotFlag = (value) => {
      if (value === true || value === 1) return true;
      const normalized = (value || '').toString().trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === 'yes';
    };
    const buildBenchmarkMetric = (entries, targetUserId, key, decimals = 2) => {
      if (!entries || entries.length === 0) {
        return null;
      }

      const totalUsers = entries.length;
      const values = entries.map((entry) => Number(entry[key]) || 0);
      const sum = values.reduce((acc, value) => acc + value, 0);
      const average = totalUsers > 0 ? roundTo(sum / totalUsers, decimals) : 0;
      const targetEntry = entries.find((entry) => String(entry.user_id) === String(targetUserId));
      const rawUserValue = targetEntry ? (Number(targetEntry[key]) || 0) : 0;
      const userValue = roundTo(rawUserValue, decimals);
      const rank = values.filter((value) => value > rawUserValue).length + 1;
      const topPercent = totalUsers > 0
        ? Number(((rank / totalUsers) * 100).toFixed(1))
        : 100;

      return {
        average,
        user_value: userValue,
        difference_from_average: roundTo(userValue - average, decimals),
        rank,
        total_users: totalUsers,
        top_percent: topPercent
      };
    };
    const buildEmptyPayload = () => ({
      user_id: String(user_id),
      period: periodLabel,
      year: isAllTime ? null : numericYear,
      generated_at: new Date().toISOString(),
      summary: {
        total_predictions: 0,
        correct_predictions: 0,
        incorrect_predictions: 0,
        accuracy: 0,
        total_points: 0,
        events_played: 0,
        event_wins: 0,
        average_points_per_event: 0,
        longest_win_streak: 0
      },
      best_event: null,
      toughest_event: null,
      events: [],
      fighter_insights: {
        most_trusted_fighter: null,
        most_profitable_fighter: null,
        biggest_underdog_hit: null
      },
      style_insights: {
        best_card_tier: null,
        best_weightclass: null,
        corner_performance: {
          red_corner: {
            total_picks: 0,
            correct_picks: 0,
            accuracy: 0
          },
          blue_corner: {
            total_picks: 0,
            correct_picks: 0,
            accuracy: 0
          },
          favorite_corner: null
        },
        momentum: {
          first_half_accuracy: 0,
          second_half_accuracy: 0,
          delta: 0,
          total_predictions: 0
        }
      },
      rivalry_insights: {
        biggest_nemesis: null,
        head_to_head: null,
        pick_twin: null
      },
      community_insights: {
        most_voted_fighter: null,
        community_cash_cow_fighter: null,
        most_faded_fighter: null,
        crowd_favorite_corner: null,
        biggest_whiff_fight: null
      },
      benchmarks: {
        cohort_label: 'active human users',
        cohort_size: 0,
        metrics: {
          total_predictions: null,
          accuracy: null,
          total_points: null,
          events_played: null,
          event_wins: null,
          average_points_per_event: null
        }
      },
      leaderboards: {
        longest_win_streak: []
      }
    });
    const targetUser = await fetchUserById(user_id, 'user_id, username');
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    const users = await fetchAllUsers(`
      user_id,
      username,
      is_bot,
      selected_playercard_id,
      playercards!selected_playercard_id (id, name, image_url, category)
    `);

    const eventsQuery = supabase
      .from('events')
      .select('id, name, date, image_url');
    const eventsForPeriod = isAllTime
      ? await fetchAllFromSupabase(eventsQuery)
      : await fetchAllFromSupabase(
        eventsQuery
          .gte('date', seasonStart)
          .lt('date', nextSeasonStart)
      );
    const normalizedEvents = (eventsForPeriod || []).map(event => ({
      id: Number(event.id),
      name: event.name || `Event ${event.id}`,
      date: event.date || null,
      image_url: event.image_url || null
    }));
    const validEvents = normalizedEvents.filter(event => Number.isFinite(event.id));
    const eventIds = validEvents.map(event => event.id);
    const eventMap = new Map(validEvents.map(event => [event.id, event]));

    if (eventIds.length === 0) {
      return res.json(buildEmptyPayload());
    }

    const weightclassMap = await getWeightclassMapping();
    const weightclassByLbs = new Map();
    weightclassMap.forEach((value) => {
      const lbs = Number(value?.weight_lbs);
      if (!Number.isFinite(lbs) || lbs <= 0) {
        return;
      }
      if (!weightclassByLbs.has(lbs)) {
        weightclassByLbs.set(lbs, value?.gay_weightclass || value?.official_weightclass || null);
      }
    });
    const resolveWeightclassLabel = (rawLabel, rawLbs) => {
      const raw = (rawLabel || '').toString().trim();
      const normalizedRaw = normalizeWeightclass(raw);
      if (normalizedRaw) {
        const mapped = weightclassMap.get(normalizedRaw);
        if (mapped) {
          return normalizeWeightclassLabel(mapped.gay_weightclass || mapped.official_weightclass || raw);
        }
      }

      const normalizedLabel = normalizeWeightclassLabel(raw);
      if (normalizedLabel !== 'Unknown') {
        return normalizedLabel;
      }

      const lbs = Number(rawLbs);
      if (Number.isFinite(lbs) && lbs > 0 && weightclassByLbs.has(lbs)) {
        return normalizeWeightclassLabel(weightclassByLbs.get(lbs));
      }

      return 'Unknown';
    };

    const seasonFightRows = await fetchAllFromSupabase(
      supabase
        .from('ufc_full_fight_card')
        .select('EventId, FightId, CardSegment, FighterWeightClass, Weight_lbs, Corner, FighterId, FirstName, LastName, odds')
        .in('EventId', eventIds)
    );
    const fightMetaMap = new Map();
    (seasonFightRows || []).forEach(row => {
      const fightId = Number(row.FightId);
      const eventId = Number(row.EventId);
      const fighterId = Number(row.FighterId);
      if (!Number.isFinite(fightId) || !Number.isFinite(eventId)) {
        return;
      }
      if (!fightMetaMap.has(fightId)) {
        fightMetaMap.set(fightId, {
          fight_id: fightId,
          event_id: eventId,
          card_tier: formatCardTier(row.CardSegment),
          weightclass: resolveWeightclassLabel(row.FighterWeightClass, row.Weight_lbs),
          fighters: new Map()
        });
      }
      const fightMeta = fightMetaMap.get(fightId);
      const normalizedWeightclass = resolveWeightclassLabel(row.FighterWeightClass, row.Weight_lbs);
      if (fightMeta.weightclass === 'Unknown' && normalizedWeightclass !== 'Unknown') {
        fightMeta.weightclass = normalizedWeightclass;
      }
      if (Number.isFinite(fighterId)) {
        fightMetaMap.get(fightId).fighters.set(fighterId, {
          fighter_id: fighterId,
          fighter_name: `${row.FirstName || ''} ${row.LastName || ''}`.trim() || `Fighter ${fighterId}`,
          odds: parseOddsValue(row.odds),
          corner: normalizeCornerLabel(row.Corner)
        });
      }
    });

    const seasonResults = await fetchAllFromSupabase(
      supabase
        .from('prediction_results')
        .select('event_id, fight_id, predicted_correctly, points, created_at')
        .eq('user_id', user_id)
        .in('event_id', eventIds)
    );

    const rows = (seasonResults || []).map(row => ({
      event_id: Number(row.event_id),
      fight_id: Number.isFinite(Number(row.fight_id)) ? Number(row.fight_id) : 0,
      predicted_correctly: Boolean(row.predicted_correctly),
      points: Number(row.points) || 0,
      created_at: row.created_at || null
    }))
      .filter(row => Number.isFinite(row.event_id));

    if (rows.length === 0) {
      return res.json(buildEmptyPayload());
    }

    const userFightIds = Array.from(new Set(
      rows
        .map(row => Number(row.fight_id))
        .filter(fightId => Number.isFinite(fightId) && fightId > 0)
    ));
    const usernameForUser = targetUser.username || null;
    const humanUsers = (users || []).filter(candidate => !isBotFlag(candidate?.is_bot));
    const humanUserSet = new Set(humanUsers.map(candidate => String(candidate.user_id)));
    const userIdToUsername = new Map((users || []).map(candidate => [String(candidate.user_id), candidate.username || `User ${candidate.user_id}`]));
    const userIdToPlayercard = new Map((users || []).map(candidate => [String(candidate.user_id), candidate.playercards || null]));
    const userIdToAvatarConfig = new Map((users || []).map(candidate => [String(candidate.user_id), candidate.avatar_config || null]));

    let userPredictions = [];
    if (userFightIds.length > 0) {
      const predictionsByUserId = await fetchAllFromSupabase(
        supabase
          .from('predictions')
          .select('fight_id, fighter_id, betting_odds, user_id, username')
          .eq('user_id', user_id)
          .in('fight_id', userFightIds)
      );
      const predictionsByUsername = usernameForUser
        ? await fetchAllFromSupabase(
          supabase
            .from('predictions')
            .select('fight_id, fighter_id, betting_odds, user_id, username')
            .eq('username', usernameForUser)
            .in('fight_id', userFightIds)
        )
        : [];

      // Prefer user_id-linked rows over username-only rows when duplicates exist.
      const mergedByFight = new Map();
      const mergePrediction = (prediction, priority) => {
        const fightId = Number(prediction?.fight_id);
        if (!Number.isFinite(fightId)) {
          return;
        }
        const existing = mergedByFight.get(fightId);
        if (!existing) {
          mergedByFight.set(fightId, { ...prediction, __priority: priority });
          return;
        }
        if (priority > existing.__priority) {
          mergedByFight.set(fightId, { ...prediction, __priority: priority });
          return;
        }
        if (priority === existing.__priority) {
          const existingOdds = parseOddsValue(existing.betting_odds);
          const nextOdds = parseOddsValue(prediction.betting_odds);
          if (existingOdds === null && nextOdds !== null) {
            mergedByFight.set(fightId, { ...prediction, __priority: priority });
          }
        }
      };

      (predictionsByUsername || []).forEach((prediction) => mergePrediction(prediction, 0));
      (predictionsByUserId || []).forEach((prediction) => mergePrediction(prediction, 1));
      userPredictions = [...mergedByFight.values()].map((item) => {
        const { __priority, ...prediction } = item;
        return prediction;
      });
    }
    const myPredictionByFight = new Map(
      (userPredictions || [])
        .map(prediction => {
          const fightId = Number(prediction.fight_id);
          const fighterId = Number(prediction.fighter_id);
          if (!Number.isFinite(fightId) || !Number.isFinite(fighterId)) {
            return null;
          }
          return [
            fightId,
            {
              fight_id: fightId,
              fighter_id: fighterId,
              betting_odds: parseOddsValue(prediction.betting_odds)
            }
          ];
        })
        .filter(Boolean)
    );

    const byEvent = new Map();
    rows.forEach(row => {
      if (!byEvent.has(row.event_id)) {
        byEvent.set(row.event_id, {
          event_id: row.event_id,
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0
        });
      }
      const bucket = byEvent.get(row.event_id);
      bucket.total_predictions += 1;
      if (row.predicted_correctly) {
        bucket.correct_predictions += 1;
      }
      bucket.total_points += row.points;
    });

    const eventStats = Array.from(byEvent.values())
      .map(stat => {
        const event = eventMap.get(stat.event_id) || { id: stat.event_id, name: `Event ${stat.event_id}`, date: null };
        const accuracy = stat.total_predictions > 0
          ? Number(((stat.correct_predictions / stat.total_predictions) * 100).toFixed(2))
          : 0;
        return {
          event_id: stat.event_id,
          event_name: event.name,
          event_date: event.date,
          event_image_url: event.image_url || null,
          total_predictions: stat.total_predictions,
          correct_predictions: stat.correct_predictions,
          total_points: stat.total_points,
          accuracy
        };
      })
      .sort((a, b) => {
        const aTime = a.event_date ? Date.parse(a.event_date) : Number.NEGATIVE_INFINITY;
        const bTime = b.event_date ? Date.parse(b.event_date) : Number.NEGATIVE_INFINITY;
        return aTime - bTime;
      });

    const totalPredictions = rows.length;
    const correctPredictions = rows.reduce((sum, row) => sum + (row.predicted_correctly ? 1 : 0), 0);
    const totalPoints = rows.reduce((sum, row) => sum + row.points, 0);
    const eventsPlayed = eventStats.length;
    const accuracy = totalPredictions > 0
      ? Number(((correctPredictions / totalPredictions) * 100).toFixed(2))
      : 0;
    const averagePointsPerEvent = eventsPlayed > 0
      ? Number((totalPoints / eventsPlayed).toFixed(2))
      : 0;

    const orderedForStreak = [...rows].sort((a, b) => {
      const aEventDate = eventMap.get(a.event_id)?.date;
      const bEventDate = eventMap.get(b.event_id)?.date;
      const aEventTime = aEventDate ? Date.parse(aEventDate) : Number.NEGATIVE_INFINITY;
      const bEventTime = bEventDate ? Date.parse(bEventDate) : Number.NEGATIVE_INFINITY;
      if (aEventTime !== bEventTime) {
        return aEventTime - bEventTime;
      }
      const aCreated = a.created_at ? Date.parse(a.created_at) : Number.NEGATIVE_INFINITY;
      const bCreated = b.created_at ? Date.parse(b.created_at) : Number.NEGATIVE_INFINITY;
      if (aCreated !== bCreated) {
        return aCreated - bCreated;
      }
      return a.fight_id - b.fight_id;
    });
    const accuracyForRows = (items) => {
      if (!items || items.length === 0) return 0;
      const correct = items.reduce((sum, item) => sum + (item.predicted_correctly ? 1 : 0), 0);
      return Number(((correct / items.length) * 100).toFixed(2));
    };
    const splitPoint = Math.ceil(orderedForStreak.length / 2);
    const firstHalfRows = orderedForStreak.slice(0, splitPoint);
    const secondHalfRows = orderedForStreak.slice(splitPoint);
    const firstHalfAccuracy = accuracyForRows(firstHalfRows);
    const secondHalfAccuracy = accuracyForRows(secondHalfRows);
    const momentumDelta = Number((secondHalfAccuracy - firstHalfAccuracy).toFixed(2));

    const longestWinStreak = calculateLongestWinStreak(orderedForStreak);

    const seasonEventWinsByUser = await fetchHumanEventWinCounts(
      Array.from(humanUserSet),
      isAllTime ? undefined : numericYear
    );
    const eventWins = seasonEventWinsByUser[String(user_id)] || 0;

    const bestEvent = eventStats.length > 0
      ? [...eventStats].sort((a, b) =>
        b.total_points - a.total_points ||
        b.accuracy - a.accuracy ||
        b.correct_predictions - a.correct_predictions
      )[0]
      : null;

    const toughestEvent = eventStats.length > 0
      ? [...eventStats].sort((a, b) =>
        a.accuracy - b.accuracy ||
        a.total_points - b.total_points ||
        b.total_predictions - a.total_predictions
      )[0]
      : null;

    // Fighter insights
    const fighterBuckets = new Map();
    const underdogHits = [];
    const cardTierBuckets = new Map();
    const weightclassBuckets = new Map();
    const cornerBuckets = new Map([
      ['Red', { corner: 'Red', total_picks: 0, correct_picks: 0 }],
      ['Blue', { corner: 'Blue', total_picks: 0, correct_picks: 0 }]
    ]);

    rows.forEach(row => {
      const fightId = Number(row.fight_id);
      const fightMeta = fightMetaMap.get(fightId);
      const myPick = myPredictionByFight.get(fightId);

      if (myPick) {
        const fighterInfo = fightMeta?.fighters?.get(myPick.fighter_id);
        const fighterName = fighterInfo?.fighter_name || `Fighter ${myPick.fighter_id}`;
        const pickedCorner = normalizeCornerLabel(fighterInfo?.corner);
        if (!fighterBuckets.has(myPick.fighter_id)) {
          fighterBuckets.set(myPick.fighter_id, {
            fighter_id: myPick.fighter_id,
            fighter_name: fighterName,
            picks: 0,
            correct_picks: 0,
            points_from_wins: 0
          });
        }
        const bucket = fighterBuckets.get(myPick.fighter_id);
        bucket.picks += 1;
        if (row.predicted_correctly) {
          bucket.correct_picks += 1;
          bucket.points_from_wins += row.points;
        }

        const fallbackOdds = fighterInfo?.odds ?? null;
        const selectedOdds = myPick.betting_odds ?? fallbackOdds;
        if (row.predicted_correctly && selectedOdds !== null && selectedOdds > 0) {
          const event = eventMap.get(row.event_id);
          underdogHits.push({
            fight_id: fightId,
            fighter_id: myPick.fighter_id,
            fighter_name: fighterName,
            odds: selectedOdds,
            points: row.points,
            event_id: row.event_id,
            event_name: event?.name || `Event ${row.event_id}`,
            event_date: event?.date || null
          });
        }

        if (pickedCorner !== 'Unknown' && cornerBuckets.has(pickedCorner)) {
          const cornerBucket = cornerBuckets.get(pickedCorner);
          cornerBucket.total_picks += 1;
          if (row.predicted_correctly) {
            cornerBucket.correct_picks += 1;
          }
        }
      }

      const cardTierKey = fightMeta?.card_tier || 'Unknown';
      if (!cardTierBuckets.has(cardTierKey)) {
        cardTierBuckets.set(cardTierKey, { label: cardTierKey, total_predictions: 0, correct_predictions: 0 });
      }
      const cardTierStat = cardTierBuckets.get(cardTierKey);
      cardTierStat.total_predictions += 1;
      if (row.predicted_correctly) {
        cardTierStat.correct_predictions += 1;
      }

      const weightclassKey = normalizeWeightclassLabel(fightMeta?.weightclass);
      if (weightclassKey !== 'Unknown') {
        if (!weightclassBuckets.has(weightclassKey)) {
          weightclassBuckets.set(weightclassKey, { label: weightclassKey, total_predictions: 0, correct_predictions: 0 });
        }
        const weightclassStat = weightclassBuckets.get(weightclassKey);
        weightclassStat.total_predictions += 1;
        if (row.predicted_correctly) {
          weightclassStat.correct_predictions += 1;
        }
      }
    });

    const mostTrustedFighter = fighterBuckets.size > 0
      ? [...fighterBuckets.values()].sort((a, b) =>
        b.picks - a.picks ||
        b.points_from_wins - a.points_from_wins ||
        b.correct_picks - a.correct_picks
      )[0]
      : null;

    const mostProfitableFighter = fighterBuckets.size > 0
      ? [...fighterBuckets.values()].sort((a, b) =>
        b.points_from_wins - a.points_from_wins ||
        b.correct_picks - a.correct_picks ||
        b.picks - a.picks
      )[0]
      : null;

    const biggestUnderdogHit = underdogHits.length > 0
      ? [...underdogHits].sort((a, b) =>
        b.odds - a.odds ||
        b.points - a.points
      )[0]
      : null;

    const bestCardTier = cardTierBuckets.size > 0
      ? [...cardTierBuckets.values()]
        .map(item => ({
          card_tier: item.label,
          total_predictions: item.total_predictions,
          correct_predictions: item.correct_predictions,
          accuracy: item.total_predictions > 0
            ? Number(((item.correct_predictions / item.total_predictions) * 100).toFixed(2))
            : 0
        }))
        .sort((a, b) =>
          b.accuracy - a.accuracy ||
          b.total_predictions - a.total_predictions
        )[0]
      : null;

    const bestWeightclass = (() => {
      if (weightclassBuckets.size === 0) {
        return null;
      }
      const stats = [...weightclassBuckets.values()]
        .map(item => ({
          weightclass: item.label,
          total_predictions: item.total_predictions,
          correct_predictions: item.correct_predictions,
          accuracy: item.total_predictions > 0
            ? Number(((item.correct_predictions / item.total_predictions) * 100).toFixed(2))
            : 0
        }));
      const minimumSamples = 3;
      const sufficientlySampled = stats.filter(item => item.total_predictions >= minimumSamples);
      const pool = sufficientlySampled.length > 0
        ? sufficientlySampled
        : stats;
      return pool.sort((a, b) =>
        b.accuracy - a.accuracy ||
        b.total_predictions - a.total_predictions
      )[0] || null;
    })();

    const redCorner = cornerBuckets.get('Red') || { corner: 'Red', total_picks: 0, correct_picks: 0 };
    const blueCorner = cornerBuckets.get('Blue') || { corner: 'Blue', total_picks: 0, correct_picks: 0 };
    const redCornerSummary = {
      total_picks: redCorner.total_picks,
      correct_picks: redCorner.correct_picks,
      accuracy: redCorner.total_picks > 0
        ? Number(((redCorner.correct_picks / redCorner.total_picks) * 100).toFixed(2))
        : 0
    };
    const blueCornerSummary = {
      total_picks: blueCorner.total_picks,
      correct_picks: blueCorner.correct_picks,
      accuracy: blueCorner.total_picks > 0
        ? Number(((blueCorner.correct_picks / blueCorner.total_picks) * 100).toFixed(2))
        : 0
    };
    const totalKnownCornerPicks = redCornerSummary.total_picks + blueCornerSummary.total_picks;
    const favoriteCorner = (() => {
      if (totalKnownCornerPicks === 0) {
        return null;
      }
      const ordered = [
        { corner: 'Red', ...redCornerSummary },
        { corner: 'Blue', ...blueCornerSummary }
      ].sort((a, b) =>
        b.total_picks - a.total_picks ||
        b.accuracy - a.accuracy
      );
      const winner = ordered[0];
      return {
        corner: winner.corner,
        total_picks: winner.total_picks,
        correct_picks: winner.correct_picks,
        accuracy: winner.accuracy,
        pick_share: Number(((winner.total_picks / totalKnownCornerPicks) * 100).toFixed(2))
      };
    })();

    // Rivalry insights (humans only)
    const myResultsByFight = new Map(
      rows
        .map(row => {
          const fightId = Number(row.fight_id);
          if (!Number.isFinite(fightId) || fightId <= 0) {
            return null;
          }
          return [
            fightId,
            {
              predicted_correctly: Boolean(row.predicted_correctly),
              event_id: row.event_id
            }
          ];
        })
        .filter(Boolean)
    );

    const getOpponentBucket = (map, opponentId) => {
      const key = String(opponentId);
      if (!map.has(key)) {
        map.set(key, {
          user_id: key,
          username: userIdToUsername.get(key) || `User ${key}`,
          shared_fights: 0,
          they_right_you_wrong: 0,
          you_right_they_wrong: 0,
          same_picks: 0,
          shared_pick_fights: 0
        });
      }
      return map.get(key);
    };

    const opponentMap = new Map();

    const seasonHumanResults = await fetchAllFromSupabase(
      supabase
        .from('prediction_results')
        .select('user_id, username, event_id, fight_id, predicted_correctly, points, created_at')
        .in('event_id', eventIds)
        .in('user_id', Array.from(humanUserSet))
    );
    (seasonHumanResults || []).forEach(row => {
      const opponentId = String(row.user_id);
      if (opponentId === String(user_id) || !humanUserSet.has(opponentId)) {
        return;
      }
      const fightId = Number(row.fight_id);
      if (!Number.isFinite(fightId) || !myResultsByFight.has(fightId)) {
        return;
      }
      const mine = myResultsByFight.get(fightId);
      const theirsCorrect = Boolean(row.predicted_correctly);
      const bucket = getOpponentBucket(opponentMap, opponentId);
      bucket.shared_fights += 1;
      if (theirsCorrect && !mine.predicted_correctly) {
        bucket.they_right_you_wrong += 1;
      } else if (!theirsCorrect && mine.predicted_correctly) {
        bucket.you_right_they_wrong += 1;
      }
    });

    const seasonHumanPredictions = userFightIds.length > 0
      ? await fetchAllFromSupabase(
        supabase
          .from('predictions')
          .select('user_id, fight_id, fighter_id')
          .in('fight_id', userFightIds)
      )
      : [];
    (seasonHumanPredictions || []).forEach(row => {
      const opponentId = String(row.user_id);
      if (opponentId === String(user_id) || !humanUserSet.has(opponentId)) {
        return;
      }
      const fightId = Number(row.fight_id);
      const fighterId = Number(row.fighter_id);
      const myPick = myPredictionByFight.get(fightId);
      if (!Number.isFinite(fightId) || !Number.isFinite(fighterId) || !myPick) {
        return;
      }
      const bucket = getOpponentBucket(opponentMap, opponentId);
      bucket.shared_pick_fights += 1;
      if (Number(myPick.fighter_id) === fighterId) {
        bucket.same_picks += 1;
      }
    });

    const rivalryRows = [...opponentMap.values()];
    const {
      biggestNemesis,
      headToHead,
      pickTwin,
      sampleRequirements: rivalrySampleRequirements,
    } = buildRivalryRankings(rivalryRows, {
      totalUserPickFights: myPredictionByFight.size,
      totalUserResultFights: myResultsByFight.size,
    });

    // Cohort benchmarks (active human users for this season)
    const cohortByUser = new Map();
    (seasonHumanResults || []).forEach((row) => {
      const candidateUserId = String(row.user_id);
      if (!humanUserSet.has(candidateUserId)) {
        return;
      }
      const eventId = Number(row.event_id);
      if (!Number.isFinite(eventId)) {
        return;
      }
      if (!cohortByUser.has(candidateUserId)) {
        cohortByUser.set(candidateUserId, {
          user_id: candidateUserId,
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0,
          event_ids: new Set()
        });
      }
      const bucket = cohortByUser.get(candidateUserId);
      bucket.total_predictions += 1;
      if (row.predicted_correctly) {
        bucket.correct_predictions += 1;
      }
      bucket.total_points += Number(row.points) || 0;
      bucket.event_ids.add(eventId);
    });

    const cohortEntries = [...cohortByUser.values()].map((entry) => {
      const eventsPlayedForUser = entry.event_ids.size;
      const accuracyForUser = entry.total_predictions > 0
        ? roundTo((entry.correct_predictions / entry.total_predictions) * 100, 2)
        : 0;
      const averagePointsPerEventForUser = eventsPlayedForUser > 0
        ? roundTo(entry.total_points / eventsPlayedForUser, 2)
        : 0;
      return {
        user_id: entry.user_id,
        total_predictions: entry.total_predictions,
        accuracy: accuracyForUser,
        total_points: entry.total_points,
        events_played: eventsPlayedForUser,
        event_wins: seasonEventWinsByUser[entry.user_id] || 0,
        average_points_per_event: averagePointsPerEventForUser
      };
    });

    const longestStreakLeaderboard = (() => {
      if (!seasonHumanResults || seasonHumanResults.length === 0) {
        return [];
      }
      const resultsByUser = new Map();
      (seasonHumanResults || []).forEach((row) => {
        const candidateUserId = String(row.user_id);
        const eventId = Number(row.event_id);
        const fightId = Number(row.fight_id);
        if (!humanUserSet.has(candidateUserId) || !Number.isFinite(eventId) || !Number.isFinite(fightId)) {
          return;
        }
        if (!resultsByUser.has(candidateUserId)) {
          resultsByUser.set(candidateUserId, []);
        }
        resultsByUser.get(candidateUserId).push({
          event_id: eventId,
          fight_id: fightId,
          predicted_correctly: Boolean(row.predicted_correctly),
          created_at: row.created_at || null
        });
      });

      return [...resultsByUser.entries()]
        .map(([candidateUserId, userRows]) => {
          const orderedRows = [...userRows].sort((a, b) => {
            const aEventDate = eventMap.get(a.event_id)?.date;
            const bEventDate = eventMap.get(b.event_id)?.date;
            const aEventTime = aEventDate ? Date.parse(aEventDate) : Number.NEGATIVE_INFINITY;
            const bEventTime = bEventDate ? Date.parse(bEventDate) : Number.NEGATIVE_INFINITY;
            if (aEventTime !== bEventTime) {
              return aEventTime - bEventTime;
            }
            const aCreated = a.created_at ? Date.parse(a.created_at) : Number.NEGATIVE_INFINITY;
            const bCreated = b.created_at ? Date.parse(b.created_at) : Number.NEGATIVE_INFINITY;
            if (aCreated !== bCreated) {
              return aCreated - bCreated;
            }
            return a.fight_id - b.fight_id;
          });
          const totalPredictionsForUser = orderedRows.length;
          const correctPredictionsForUser = orderedRows.reduce(
            (sum, item) => sum + (item.predicted_correctly ? 1 : 0),
            0
          );
          return {
            user_id: candidateUserId,
            username: userIdToUsername.get(candidateUserId) || `User ${candidateUserId}`,
            longest_win_streak: calculateLongestWinStreak(orderedRows),
            total_predictions: totalPredictionsForUser,
            accuracy: totalPredictionsForUser > 0
              ? roundTo((correctPredictionsForUser / totalPredictionsForUser) * 100, 2)
              : 0
          };
        })
        .sort((a, b) =>
          b.longest_win_streak - a.longest_win_streak ||
          b.accuracy - a.accuracy ||
          b.total_predictions - a.total_predictions ||
          (a.username || '').localeCompare(b.username || '')
        )
        .map((item, index) => ({
          ...item,
          rank: index + 1
        }))
        .slice(0, 50);
    })();

    const benchmarkMetrics = {
      total_predictions: buildBenchmarkMetric(cohortEntries, user_id, 'total_predictions', 0),
      accuracy: buildBenchmarkMetric(cohortEntries, user_id, 'accuracy', 2),
      total_points: buildBenchmarkMetric(cohortEntries, user_id, 'total_points', 0),
      events_played: buildBenchmarkMetric(cohortEntries, user_id, 'events_played', 0),
      event_wins: buildBenchmarkMetric(cohortEntries, user_id, 'event_wins', 0),
      average_points_per_event: buildBenchmarkMetric(cohortEntries, user_id, 'average_points_per_event', 2)
    };
    const averagePointsByEvent = {};
    const eventUserPointsMap = new Map();
    (seasonHumanResults || []).forEach((row) => {
      const candidateUserId = String(row.user_id);
      if (!humanUserSet.has(candidateUserId)) {
        return;
      }
      const eventId = Number(row.event_id);
      if (!Number.isFinite(eventId)) {
        return;
      }
      if (!eventUserPointsMap.has(eventId)) {
        eventUserPointsMap.set(eventId, new Map());
      }
      const userPointsForEvent = eventUserPointsMap.get(eventId);
      userPointsForEvent.set(
        candidateUserId,
        (userPointsForEvent.get(candidateUserId) || 0) + (Number(row.points) || 0)
      );
    });
    eventUserPointsMap.forEach((userPointsForEvent, eventId) => {
      const totals = [...userPointsForEvent.values()];
      if (totals.length === 0) {
        averagePointsByEvent[eventId] = null;
        return;
      }
      const sum = totals.reduce((acc, value) => acc + value, 0);
      averagePointsByEvent[eventId] = roundTo(sum / totals.length, 2);
    });
    const eventStatsWithAverages = eventStats.map((stat) => ({
      ...stat,
      average_points_all_users: averagePointsByEvent[Number(stat.event_id)] ?? null
    }));

    const formatCommunityPct = (value) => Number((Number(value || 0)).toFixed(2));
    const seasonFightIdsFromResults = Array.from(new Set(
      (seasonHumanResults || [])
        .map((row) => Number(row?.fight_id))
        .filter((fightId) => Number.isFinite(fightId) && fightId > 0)
    ));
    const seasonFightIds = seasonFightIdsFromResults.length > 0
      ? seasonFightIdsFromResults
      : Array.from(fightMetaMap.keys()).filter((fightId) => Number.isFinite(Number(fightId)) && Number(fightId) > 0);
    const usernameToUserId = new Map(
      humanUsers
        .map((candidate) => [normalizeUsernameKey(candidate.username), String(candidate.user_id)])
        .filter(([username]) => Boolean(username))
    );
    const resolvePredictionUserId = (prediction) => {
      const directUserId = String(prediction?.user_id || '');
      if (directUserId && humanUserSet.has(directUserId)) {
        return directUserId;
      }
      const mappedUserId = usernameToUserId.get(normalizeUsernameKey(prediction?.username));
      if (mappedUserId && humanUserSet.has(mappedUserId)) {
        return mappedUserId;
      }
      return null;
    };
    const buildFightLabel = (fightId) => {
      const fightMeta = fightMetaMap.get(Number(fightId));
      if (!fightMeta?.fighters || fightMeta.fighters.size === 0) {
        return `Fight ${fightId}`;
      }
      const fighters = [...fightMeta.fighters.values()];
      const red = fighters.find((fighter) => normalizeCornerLabel(fighter?.corner) === 'Red');
      const blue = fighters.find((fighter) => normalizeCornerLabel(fighter?.corner) === 'Blue');
      if (red?.fighter_name && blue?.fighter_name) {
        return `${red.fighter_name} vs ${blue.fighter_name}`;
      }
      if (fighters.length >= 2) {
        return `${fighters[0].fighter_name} vs ${fighters[1].fighter_name}`;
      }
      return fighters[0]?.fighter_name || `Fight ${fightId}`;
    };

    const seasonAllPredictionsRaw = seasonFightIds.length > 0
      ? await fetchAllFromSupabase(
        supabase
          .from('predictions')
          .select('fight_id, fighter_id, user_id, username')
          .in('fight_id', seasonFightIds)
      )
      : [];

    const communityPredictionByUserFight = new Map();
    (seasonAllPredictionsRaw || []).forEach((prediction) => {
      const fightId = Number(prediction?.fight_id);
      const fighterId = Number(prediction?.fighter_id);
      const resolvedUserId = resolvePredictionUserId(prediction);
      if (!resolvedUserId || !Number.isFinite(fightId) || fightId <= 0 || !Number.isFinite(fighterId) || fighterId <= 0) {
        return;
      }
      const key = `${resolvedUserId}:${fightId}`;
      const priority = prediction?.user_id ? 1 : 0;
      const existing = communityPredictionByUserFight.get(key);
      if (!existing || priority > existing.priority) {
        communityPredictionByUserFight.set(key, {
          key,
          user_id: resolvedUserId,
          fight_id: fightId,
          fighter_id: fighterId,
          priority
        });
      }
    });

    const communityResultByUserFight = new Map();
    (seasonHumanResults || []).forEach((row) => {
      const candidateUserId = String(row.user_id);
      const fightId = Number(row.fight_id);
      if (!humanUserSet.has(candidateUserId) || !Number.isFinite(fightId) || fightId <= 0) {
        return;
      }
      communityResultByUserFight.set(`${candidateUserId}:${fightId}`, {
        predicted_correctly: Boolean(row.predicted_correctly),
        points: Number(row.points) || 0
      });
    });

    const communityFighterBuckets = new Map();
    const communityCornerBuckets = new Map([
      ['Red', { corner: 'Red', total_votes: 0, correct_picks: 0 }],
      ['Blue', { corner: 'Blue', total_votes: 0, correct_picks: 0 }]
    ]);

    const getCommunityFighterBucket = (fighterId, fighterName, corner) => {
      const key = String(fighterId);
      if (!communityFighterBuckets.has(key)) {
        communityFighterBuckets.set(key, {
          fighter_id: Number(fighterId),
          fighter_name: fighterName || `Fighter ${fighterId}`,
          corner: normalizeCornerLabel(corner),
          total_votes: 0,
          correct_picks: 0,
          incorrect_picks: 0,
          points_won: 0
        });
      }
      return communityFighterBuckets.get(key);
    };

    communityPredictionByUserFight.forEach((prediction, key) => {
      const fightMeta = fightMetaMap.get(Number(prediction.fight_id));
      const fighterInfo = fightMeta?.fighters?.get(Number(prediction.fighter_id));
      const fighterName = fighterInfo?.fighter_name || `Fighter ${prediction.fighter_id}`;
      const fighterCorner = normalizeCornerLabel(fighterInfo?.corner);

      const fighterBucket = getCommunityFighterBucket(prediction.fighter_id, fighterName, fighterCorner);
      fighterBucket.total_votes += 1;

      if (fighterCorner !== 'Unknown' && communityCornerBuckets.has(fighterCorner)) {
        const cornerBucket = communityCornerBuckets.get(fighterCorner);
        cornerBucket.total_votes += 1;
      }

      const result = communityResultByUserFight.get(key);
      if (!result) {
        return;
      }
      if (result.predicted_correctly) {
        fighterBucket.correct_picks += 1;
        fighterBucket.points_won += result.points;
        if (fighterCorner !== 'Unknown' && communityCornerBuckets.has(fighterCorner)) {
          const cornerBucket = communityCornerBuckets.get(fighterCorner);
          cornerBucket.correct_picks += 1;
        }
      } else {
        fighterBucket.incorrect_picks += 1;
      }
    });

    const communityFighterStats = [...communityFighterBuckets.values()].map((bucket) => ({
      ...bucket,
      pick_share: communityPredictionByUserFight.size > 0
        ? formatCommunityPct((bucket.total_votes / communityPredictionByUserFight.size) * 100)
        : 0,
      accuracy: bucket.total_votes > 0
        ? formatCommunityPct((bucket.correct_picks / bucket.total_votes) * 100)
        : 0,
      fade_rate: bucket.total_votes > 0
        ? formatCommunityPct((bucket.incorrect_picks / bucket.total_votes) * 100)
        : 0
    }));

    const mostVotedFighter = communityFighterStats.length > 0
      ? [...communityFighterStats].sort((a, b) =>
        b.total_votes - a.total_votes ||
        b.correct_picks - a.correct_picks ||
        b.points_won - a.points_won
      )[0]
      : null;

    const communityCashCowFighter = communityFighterStats.length > 0
      ? [...communityFighterStats].sort((a, b) =>
        b.points_won - a.points_won ||
        b.correct_picks - a.correct_picks ||
        b.total_votes - a.total_votes
      )[0]
      : null;

    const mostFadedFighter = (() => {
      const sufficientlySampled = communityFighterStats.filter((item) => item.total_votes >= 8);
      const pool = sufficientlySampled.length > 0 ? sufficientlySampled : communityFighterStats;
      if (pool.length === 0) {
        return null;
      }
      return [...pool].sort((a, b) =>
        b.incorrect_picks - a.incorrect_picks ||
        b.fade_rate - a.fade_rate ||
        b.total_votes - a.total_votes
      )[0];
    })();

    const crowdFavoriteCorner = (() => {
      const stats = [...communityCornerBuckets.values()].map((bucket) => ({
        corner: bucket.corner,
        total_votes: bucket.total_votes,
        correct_picks: bucket.correct_picks,
        accuracy: bucket.total_votes > 0
          ? formatCommunityPct((bucket.correct_picks / bucket.total_votes) * 100)
          : 0
      }));
      const totalCornerVotes = stats.reduce((sum, item) => sum + item.total_votes, 0);
      if (totalCornerVotes === 0) {
        return null;
      }
      const winner = [...stats].sort((a, b) =>
        b.total_votes - a.total_votes ||
        b.accuracy - a.accuracy
      )[0];
      return {
        ...winner,
        pick_share: formatCommunityPct((winner.total_votes / totalCornerVotes) * 100)
      };
    })();

    const communityFightBuckets = new Map();
    communityResultByUserFight.forEach((result, key) => {
      const [, fightIdValue] = key.split(':');
      const fightId = Number(fightIdValue);
      if (!Number.isFinite(fightId) || fightId <= 0) {
        return;
      }
      if (!communityFightBuckets.has(fightId)) {
        communityFightBuckets.set(fightId, {
          fight_id: fightId,
          total_predictions: 0,
          wrong_picks: 0
        });
      }
      const bucket = communityFightBuckets.get(fightId);
      bucket.total_predictions += 1;
      if (!result.predicted_correctly) {
        bucket.wrong_picks += 1;
      }
    });

    const biggestWhiffFight = communityFightBuckets.size > 0
      ? [...communityFightBuckets.values()]
        .map((bucket) => {
          const fightMeta = fightMetaMap.get(bucket.fight_id);
          const event = eventMap.get(fightMeta?.event_id);
          return {
            ...bucket,
            wrong_rate: bucket.total_predictions > 0
              ? formatCommunityPct((bucket.wrong_picks / bucket.total_predictions) * 100)
              : 0,
            fight_label: buildFightLabel(bucket.fight_id),
            event_id: fightMeta?.event_id || null,
            event_name: event?.name || null,
            event_date: event?.date || null
          };
        })
        .sort((a, b) =>
          b.wrong_picks - a.wrong_picks ||
          b.wrong_rate - a.wrong_rate ||
          b.total_predictions - a.total_predictions
        )[0]
      : null;

    return res.json({
      user_id: String(user_id),
      period: periodLabel,
      year: isAllTime ? null : numericYear,
      generated_at: new Date().toISOString(),
      summary: {
        total_predictions: totalPredictions,
        correct_predictions: correctPredictions,
        incorrect_predictions: Math.max(totalPredictions - correctPredictions, 0),
        accuracy,
        total_points: totalPoints,
        events_played: eventsPlayed,
        event_wins: eventWins,
        average_points_per_event: averagePointsPerEvent,
        longest_win_streak: longestWinStreak
      },
      best_event: bestEvent,
      toughest_event: toughestEvent,
      events: eventStatsWithAverages,
      fighter_insights: {
        most_trusted_fighter: mostTrustedFighter,
        most_profitable_fighter: mostProfitableFighter,
        biggest_underdog_hit: biggestUnderdogHit
      },
      style_insights: {
        best_card_tier: bestCardTier,
        best_weightclass: bestWeightclass,
        corner_performance: {
          red_corner: redCornerSummary,
          blue_corner: blueCornerSummary,
          favorite_corner: favoriteCorner
        },
        momentum: {
          first_half_accuracy: firstHalfAccuracy,
          second_half_accuracy: secondHalfAccuracy,
          delta: momentumDelta,
          total_predictions: rows.length
        }
      },
      rivalry_insights: {
        biggest_nemesis: biggestNemesis
          ? {
            user_id: biggestNemesis.user_id,
            username: biggestNemesis.username,
            playercard: userIdToPlayercard.get(String(biggestNemesis.user_id)) || null,
            avatar_config: userIdToAvatarConfig.get(String(biggestNemesis.user_id)) || null,
            times_they_were_right_you_wrong: biggestNemesis.they_right_you_wrong,
            you_right_they_wrong: biggestNemesis.you_right_they_wrong,
            shared_fights: biggestNemesis.shared_fights,
            decisive_swing_fights: biggestNemesis.decisive_swing_fights,
            nemesis_edge: biggestNemesis.nemesis_edge,
            swing_pct: biggestNemesis.nemesis_swing_pct,
            confidence_score: biggestNemesis.nemesis_score,
            minimum_shared_fights: rivalrySampleRequirements.nemesis_min_shared_fights,
            minimum_swing_fights: rivalrySampleRequirements.nemesis_min_swing_fights
          }
          : null,
        head_to_head: headToHead
          ? {
            user_id: headToHead.user_id,
            username: headToHead.username,
            you_right_they_wrong: headToHead.you_right_they_wrong,
            they_right_you_wrong: headToHead.they_right_you_wrong,
            net_edge: headToHead.net_edge,
            shared_fights: headToHead.shared_fights
          }
          : null,
        pick_twin: pickTwin
          ? {
            user_id: pickTwin.user_id,
            username: pickTwin.username,
            playercard: userIdToPlayercard.get(String(pickTwin.user_id)) || null,
            avatar_config: userIdToAvatarConfig.get(String(pickTwin.user_id)) || null,
            overlap_pct: pickTwin.pick_overlap_pct,
            shared_fights: pickTwin.shared_pick_fights,
            same_picks: pickTwin.same_picks,
            confidence_score: pickTwin.pick_twin_score,
            minimum_shared_fights: rivalrySampleRequirements.pick_twin_min_shared_picks
          }
          : null,
        sample_requirements: rivalrySampleRequirements
      },
      community_insights: {
        most_voted_fighter: mostVotedFighter,
        community_cash_cow_fighter: communityCashCowFighter,
        most_faded_fighter: mostFadedFighter,
        crowd_favorite_corner: crowdFavoriteCorner,
        biggest_whiff_fight: biggestWhiffFight
      },
      benchmarks: {
        cohort_label: 'active human users',
        cohort_size: cohortEntries.length,
        metrics: benchmarkMetrics
      },
      leaderboards: {
        longest_win_streak: longestStreakLeaderboard
      }
    });
  } catch (error) {
    console.error('Error fetching user highlights:', error);
    return res.status(500).json({ error: 'Failed to fetch user highlights' });
  }
});

// Admin endpoint to set user type (for development/setup purposes)
app.post('/admin/set-user-type', requireAdminSession, async (req, res) => {
  try {
    const { username, user_type } = req.body;
    
    if (!username || !user_type) {
      return res.status(400).json({ error: 'Username and user_type are required' });
    }
    
    if (!['user', 'admin'].includes(user_type)) {
      return res.status(400).json({ error: 'user_type must be either "user" or "admin"' });
    }
    
    const { data, error } = await supabase
      .from('users')
      .update({ user_type })
      .eq('username', username)
      .select('user_id, username, user_type')
      .single();
    
    if (error) {
      console.error('Error updating user type:', error);
      return res.status(500).json({ error: 'Failed to update user type' });
    }
    
    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user_type !== 'admin') {
      await revokeAdminSessionsForUser({
        supabase,
        userId: data.user_id,
        reason: 'user_role_changed',
      });
    }

    await logAdminAction(req, {
      action: 'user.role.update',
      status: 'success',
      targetType: 'user',
      targetId: data.user_id,
      metadata: {
        username: data.username,
        user_type: data.user_type,
      },
    });
    
    res.json({ 
      message: `User ${username} has been set to ${user_type}`,
      user: data
    });
  } catch (error) {
    console.error('Set user type error:', error);
    await logAdminAction(req, {
      action: 'user.role.update',
      status: 'error',
      targetType: 'user',
      targetId: req.body?.username || null,
      metadata: {
        message: error.message,
        requested_user_type: req.body?.user_type || null,
      },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all available playercards
app.get('/playercards', async (req, res) => {
  try {
    const { user_id } = req.query;
    
    const { data: playercards, error } = await supabase
      .from('playercards')
      .select('id, name, image_url, category, unlock_requirements, is_premium, created_at, required_event_id')
      .order('category', { ascending: true })
      .order('name', { ascending: true });
    
    if (error) {
      console.error('Error fetching playercards:', error);
      return res.status(500).json({ error: 'Failed to fetch playercards' });
    }
    
    // If user_id is provided, check which playercards they can access
    if (user_id) {
      // Get all events the user has voted in
      const { data: userPredictions, error: predictionsError } = await supabase
        .from('predictions')
        .select('fight_id')
        .eq('user_id', user_id);
      
      if (predictionsError) {
        console.error('Error fetching user predictions:', predictionsError);
        return res.status(500).json({ error: 'Failed to fetch user predictions' });
      }
      
      // Get fight-to-event mapping
      const { data: fights, error: fightsError } = await supabase
        .from('ufc_full_fight_card')
        .select('FightId, EventId');
      
      if (fightsError) {
        console.error('Error fetching fights:', fightsError);
        return res.status(500).json({ error: 'Failed to fetch fights data' });
      }
      
      // Create set of events user has voted in
      // Convert fight_ids to numbers for comparison since predictions store them as strings
      const userVotedFightIds = new Set(userPredictions.map(p => parseInt(p.fight_id)));
      const userVotedEventIds = new Set();
      
      fights.forEach(fight => {
        if (userVotedFightIds.has(fight.FightId)) {
          userVotedEventIds.add(fight.EventId);
        }
      });
      
      // Add availability status to each playercard
      const playercardswithAvailability = playercards.map(card => ({
        ...card,
        is_available: !card.required_event_id || userVotedEventIds.has(card.required_event_id),
        required_event_id: card.required_event_id
      }));
      
      res.json(playercardswithAvailability);
    } else {
      res.json(playercards || []);
    }
  } catch (error) {
    console.error('Playercards error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update the authenticated user's squid avatar.
app.patch('/user/:user_id/avatar', requireUserSession, requireOwnUserId, async (req, res) => {
  try {
    const validation = validateAvatarConfig(req.body?.avatar_config);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({ avatar_config: validation.value })
      .eq('user_id', req.authenticatedUser.user_id)
      .select('user_id, avatar_config')
      .maybeSingle();

    if (error) {
      console.error('Error updating user avatar:', error);
      return res.status(500).json({ error: 'Failed to save avatar' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'Avatar updated successfully',
      avatar_config: user.avatar_config,
    });
  } catch (error) {
    console.error('Avatar update error:', error);
    return res.status(500).json({ error: 'Failed to save avatar' });
  }
});

// Update user's selected playercard
app.patch('/user/:user_id/playercard', requireUserSession, requireOwnUserId, async (req, res) => {
  try {
    const { user_id } = req.params;
    const { playercard_id } = req.body;
    
    debugLog('Playercard update request:', { user_id, playercard_id });
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    if (!playercard_id) {
      return res.status(400).json({ error: 'Playercard ID is required' });
    }
    
    // Verify the playercard exists and get its requirements
    let playercard;
    try {
      const { data, error: playercardError } = await supabase
        .from('playercards')
        .select('id, required_event_id')
        .eq('id', playercard_id)
        .single();
      
      if (playercardError || !data) {
        console.error('Playercard not found:', playercardError);
        return res.status(404).json({ error: 'Playercard not found' });
      }
      
      playercard = data;
    } catch (error) {
      console.error('Error fetching playercard:', error);
      return res.status(500).json({ error: 'Failed to fetch playercard' });
    }
    
    // If playercard requires an event, check if user voted in that event
    if (playercard.required_event_id !== null && playercard.required_event_id !== undefined) {
      try {
        // Get all user predictions
        const { data: userPredictions, error: predictionsError } = await supabase
          .from('predictions')
          .select('fight_id')
          .eq('user_id', user_id);
        
        if (predictionsError) {
          console.error('Error fetching user predictions:', predictionsError);
          return res.status(500).json({ error: 'Failed to verify voting eligibility' });
        }
        
        // Get fight-to-event mapping
        const { data: fights, error: fightsError } = await supabase
          .from('ufc_full_fight_card')
          .select('FightId, EventId')
          .eq('EventId', playercard.required_event_id);
        
        if (fightsError) {
          console.error('Error fetching fights:', fightsError);
          return res.status(500).json({ error: 'Failed to verify voting eligibility' });
        }
        
        // Check if user voted in any fight from the required event
        const requiredEventFightIds = new Set(fights.map(f => f.FightId));
        // Convert fight_ids to numbers for comparison since predictions store them as strings
        const userVotedFightIds = new Set(userPredictions.map(p => parseInt(p.fight_id)));
        
        const hasVotedInRequiredEvent = [...requiredEventFightIds].some(fightId => 
          userVotedFightIds.has(fightId)
        );
        
        if (!hasVotedInRequiredEvent) {
          return res.status(403).json({ 
            error: 'You must vote in the required event to unlock this playercard',
            required_event_id: playercard.required_event_id
          });
        }
      } catch (error) {
        console.error('Error during event verification:', error);
        return res.status(500).json({ error: 'Failed to verify voting eligibility' });
      }
    }
    
    // Update the user's selected playercard
    debugLog('Attempting to update user', user_id, 'to playercard', playercard_id);
    
    // First verify the user exists
    let existingUser;
    try {
      const { data, error: userCheckError } = await supabase
        .from('users')
        .select('user_id, username, selected_playercard_id')
        .eq('user_id', user_id)
        .single();
      
      if (userCheckError || !data) {
        console.error('User not found:', userCheckError);
        return res.status(404).json({ error: 'User not found' });
      }
      
      existingUser = data;
      debugLog('User exists:', existingUser);
    } catch (error) {
      console.error('Error checking user existence:', error);
      return res.status(500).json({ error: 'Failed to verify user' });
    }
    
    // Use the service-role client so this update is not blocked by RLS.
    try {
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ selected_playercard_id: parseInt(playercard_id) })
        .eq('user_id', parseInt(user_id))
        .select('user_id, username, selected_playercard_id');
      
      debugLog('Update result:', updatedUser);
      debugLog('Update error:', updateError);
      
      if (updateError) {
        console.error('Error updating user playercard:', updateError);
        return res.status(500).json({ 
          error: 'Failed to update playercard', 
          details: updateError.message,
          code: updateError.code 
        });
      }
      
      // If the update didn't return data, try to fetch the user again to verify the update worked
      if (!updatedUser || updatedUser.length === 0) {
        debugLog('Update returned empty, checking if update actually succeeded...');
        try {
          const { data: verifyUser, error: verifyError } = await supabase
            .from('users')
            .select('user_id, username, selected_playercard_id')
            .eq('user_id', parseInt(user_id))
            .single();
          
          debugLog('Verification result:', verifyUser);
          debugLog('Verification error:', verifyError);
          
          if (verifyError) {
            console.error('Error verifying user update:', verifyError);
            return res.status(500).json({ error: 'Failed to verify update' });
          }
          
          if (verifyUser && verifyUser.selected_playercard_id == playercard_id) {
            debugLog('Update actually succeeded, using verification data');
            return res.json({
              message: 'Playercard updated successfully',
              user: verifyUser
            });
          } else {
            console.error('Update verification failed - playercard not updated');
            return res.status(500).json({ error: 'Update failed to persist' });
          }
        } catch (error) {
          console.error('Error during update verification:', error);
          return res.status(500).json({ error: 'Failed to verify update' });
        }
      }
      
      const user = updatedUser[0];
      debugLog('Playercard update completed successfully');
      
      return res.json({
        message: 'Playercard updated successfully',
        user: user
      });
      
    } catch (error) {
      console.error('Error during user update:', error);
      return res.status(500).json({ error: 'Failed to update user' });
    }
    
  } catch (error) {
    console.error('Update playercard error - top level:', error);
    // Make sure we always return a response
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Legacy migration endpoint, disabled unless ENABLE_LEGACY_ADMIN_MIGRATION_ROUTES=true.
app.post('/migrate/add-playercard-event-requirements', requireLegacyAdminMigrationRoutes, requireAdminSession, async (req, res) => {
  try {
    // Add required_event_id column to playercards table
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE playercards 
        ADD COLUMN IF NOT EXISTS required_event_id INTEGER REFERENCES events(id);
      `
    });
    
    if (error) {
      console.error('Migration error:', error);
      return res.status(500).json({ error: 'Migration failed', details: error.message });
    }
    
    await logAdminAction(req, {
      action: 'migration.playercard_event_requirements',
      status: 'success',
      targetType: 'migration',
    });

    res.json({ message: 'Migration completed successfully' });
  } catch (error) {
    console.error('Migration error:', error);
    await logAdminAction(req, {
      action: 'migration.playercard_event_requirements',
      status: 'error',
      targetType: 'migration',
      metadata: {
        message: error.message,
      },
    });
    res.status(500).json({ error: 'Migration failed', details: error.message });
  }
});

// Endpoint to set event requirements for specific playercards
app.patch('/playercards/:id/event-requirement', requireAdminSession, async (req, res) => {
  try {
    const { id } = req.params;
    const { required_event_id } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Playercard ID is required' });
    }
    
    // Verify the event exists if provided
    if (required_event_id !== null && required_event_id !== undefined) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('id', required_event_id)
        .single();
      
      if (eventError || !event) {
        return res.status(404).json({ error: 'Event not found' });
      }
    }
    
    // Update the playercard
    const { data: updatedCard, error: updateError } = await supabase
      .from('playercards')
      .update({ required_event_id })
      .eq('id', id)
      .select('id, name, image_url, category, unlock_requirements, is_premium, created_at, required_event_id')
      .single();
    
    if (updateError) {
      console.error('Error updating playercard:', updateError);
      return res.status(500).json({ error: 'Failed to update playercard' });
    }
    
    if (!updatedCard) {
      return res.status(404).json({ error: 'Playercard not found' });
    }
    
    await logAdminAction(req, {
      action: 'playercard.event_requirement.update',
      status: 'success',
      targetType: 'playercard',
      targetId: id,
      eventId: required_event_id,
      metadata: {
        required_event_id,
        playercard_name: updatedCard.name,
      },
    });

    res.json({
      message: 'Playercard event requirement updated successfully',
      playercard: updatedCard
    });
  } catch (error) {
    console.error('Update playercard requirement error:', error);
    await logAdminAction(req, {
      action: 'playercard.event_requirement.update',
      status: 'error',
      targetType: 'playercard',
      targetId: req.params.id,
      eventId: req.body?.required_event_id,
      metadata: {
        message: error.message,
      },
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  runStartupSupabaseCheck();
});
