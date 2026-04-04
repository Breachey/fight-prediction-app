const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();
const {
  createRequireAdminSession,
  issueAdminSession,
  readBearerToken,
  revokeAdminSession,
  revokeAdminSessionsForUser,
} = require('./lib/adminSessionAuth');
const {
  writeAdminAuditLog,
} = require('./lib/adminAuditLog');
const {
  syncFighterStyleFromFightCardRows,
} = require('./lib/fighterStyleSync');
const {
  backfillEventImageIfMissing,
  buildOddsRefreshPlan,
  buildFightCardPreview,
  cleanupExpiredFightCardPreviews,
  deleteFightCardPreview,
  getFightCardPreview,
  parseFightCardCsvFile,
  replaceFightCardPreview,
  removePreviewAssets,
  runFightCardScraper,
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

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const app = express();
const PORT = process.env.PORT || 3001;
const REPO_ROOT = path.resolve(__dirname, '..');

// Enable gzip compression
app.use(compression());

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
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(express.json());

const DEFAULT_IMAGE_PROXY_ALLOWED_HOSTS = ['images.tapology.com'];
const IMAGE_PROXY_ALLOWED_HOSTS = (process.env.IMAGE_PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
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

// Cache headers for frequently accessed, mostly-read endpoints
const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const LEADERBOARD_CACHE_CONTROL = 'no-store';
app.use((req, res, next) => {
  const path = req.path;
  const isEvents = path === '/events';
  const isLeaderboard = path.startsWith('/leaderboard');
  const isEventLeaderboard = /^\/events\/[^/]+\/leaderboard$/.test(path);
  const isPlayercards = path === '/playercards';
  const isHighlights = /^\/user\/[^/]+\/highlights\/(\d{4}|all-time)$/.test(path);

  if (isLeaderboard || isEventLeaderboard) {
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

function normalizeAudience(value) {
  return value === 'test' ? 'test' : 'live';
}

function getAudienceForUserRecord(user) {
  return normalizeBooleanFlag(user?.is_test_account) ? 'test' : 'live';
}

async function fetchUserById(userId, selectClause = 'user_id, username, phone_number, user_type, is_test_account, linked_live_user_id') {
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

async function resolveAudienceForUserId(userId) {
  const user = await fetchUserById(userId, 'user_id, is_test_account');
  return getAudienceForUserRecord(user);
}

async function fetchAudienceUsers(selectClause, audience = 'live') {
  const normalizedAudience = normalizeAudience(audience);
  const usersQuery = supabase
    .from('users')
    .select(selectClause)
    .eq('is_test_account', normalizedAudience === 'test');

  return fetchAllFromSupabase(usersQuery);
}

function buildAudienceUserMaps(users) {
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

function resolveAudienceUserForRow(row, userMaps) {
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

function filterRowsToAudience(rows, audienceUsers) {
  const userMaps = buildAudienceUserMaps(audienceUsers);
  return (rows || []).filter(row => Boolean(resolveAudienceUserForRow(row, userMaps)));
}

function buildAudienceUserIdList(audienceUsers) {
  return Array.from(
    new Set((audienceUsers || []).map(user => String(user.user_id)).filter(Boolean))
  );
}

async function generateUniqueSandboxUsername(baseUsername) {
  const sanitizedBase = (baseUsername || 'user')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';

  const baseCandidate = `${sanitizedBase}-test`;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0
      ? baseCandidate
      : `${baseCandidate}-${attempt + 1}`;

    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', candidate)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique sandbox username');
}

async function generateUniqueSandboxPhoneNumber(liveUserId) {
  const preferredSeed = normalizeUserId(liveUserId) || Date.now();
  const preferredCandidate = `88${String(preferredSeed % 100000000).padStart(8, '0')}`;
  const candidates = [preferredCandidate];

  for (let attempt = 0; attempt < 49; attempt += 1) {
    candidates.push(`88${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`);
  }

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('users')
      .select('phone_number')
      .eq('phone_number', candidate)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique sandbox phone number');
}

async function clearEventWinnersForAudience(eventId, audienceUsers) {
  const audienceUserIds = buildAudienceUserIdList(audienceUsers);
  if (!eventId || audienceUserIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('event_winners')
    .delete()
    .eq('event_id', eventId)
    .in('user_id', audienceUserIds);

  if (error) {
    throw error;
  }
}

// Add connection test
async function testSupabaseConnection() {
  try {
    console.log('Testing Supabase connection...');
    
    // First test basic connection
    const { data: countData, error: countError } = await supabase
      .from('ufc_full_fight_card')
      .select('count')
      .limit(1);

    if (countError) {
      console.error('Supabase connection test failed:', countError);
      return false;
    }

    // Get table structure
    const { data, error } = await supabase
      .from('ufc_full_fight_card')
      .select()
      .limit(1);

    if (error) {
      console.error('Failed to get table structure:', error);
    } else if (data && data.length > 0) {
      console.log('Available columns in ufc_full_fight_card:', Object.keys(data[0]).join(', '));
    }

    // Test service-role permissions
    try {
      console.log('Testing service-role permissions...');
      const { data: adminTestData, error: adminTestError } = await supabase
        .from('users')
        .select('user_id')
        .limit(1);
      
      if (adminTestError) {
        console.warn('Service-role test failed:', adminTestError);
      } else {
        console.log('Service-role test successful');
      }
    } catch (adminError) {
      console.warn('Service-role test error:', adminError);
    }

    console.log('Supabase connection test successful');
    return true;
  } catch (error) {
    console.error('Error testing Supabase connection:', error);
    return false;
  }
}

async function buildAuthenticatedUserResponse(user) {
  const baseResponse = {
    user_id: user.user_id,
    username: user.username,
    phoneNumber: user.phone_number,
    user_type: user.user_type || 'user',
    is_test_account: normalizeBooleanFlag(user.is_test_account),
    linked_live_user_id: user.linked_live_user_id || null,
  };

  if (baseResponse.user_type !== 'admin') {
    return baseResponse;
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
app.post('/register', async (req, res) => {
  try {
    const { phoneNumber, username } = req.body;

    // Validate input
    if (!phoneNumber || !username) {
      return res.status(400).json({ error: 'Phone number and username are required' });
    }

    if (phoneNumber.length !== 10 || !/^\d+$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if username already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Try to insert the user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        { phone_number: phoneNumber, username: username, user_type: 'user' }
      ])
      .select('user_id, username, phone_number, user_type, is_test_account, linked_live_user_id')
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
app.post('/login', async (req, res) => {
  try {
    const { phoneNumber } = req.body;

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
      .select('user_id, username, phone_number, user_type, is_test_account, linked_live_user_id')
      .eq('phone_number', phoneNumber)
      .single();

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

app.post('/auth/test-mode', async (req, res) => {
  try {
    const currentUserId = normalizeUserId(req.body?.user_id);
    if (!currentUserId) {
      return res.status(400).json({ error: 'A valid user_id is required' });
    }

    const currentUser = await fetchUserById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const linkedLiveUser = normalizeBooleanFlag(currentUser.is_test_account) && currentUser.linked_live_user_id
      ? await fetchUserById(currentUser.linked_live_user_id)
      : null;
    const isAdminEligible = currentUser.user_type === 'admin' || linkedLiveUser?.user_type === 'admin';

    if (!isAdminEligible) {
      return res.status(403).json({ error: 'Only admins can use test mode' });
    }

    if (normalizeBooleanFlag(currentUser.is_test_account)) {
      if (!currentUser.linked_live_user_id) {
        return res.status(400).json({ error: 'This test account is not linked to a live account' });
      }

      const liveUser = linkedLiveUser || await fetchUserById(currentUser.linked_live_user_id);
      if (!liveUser) {
        return res.status(404).json({ error: 'Linked live account could not be found' });
      }

      return res.json(await buildAuthenticatedUserResponse(liveUser));
    }

    const { data: existingSandbox, error: existingSandboxError } = await supabase
      .from('users')
      .select('user_id, username, phone_number, user_type, is_test_account, linked_live_user_id')
      .eq('linked_live_user_id', currentUser.user_id)
      .eq('is_test_account', true)
      .maybeSingle();

    if (existingSandboxError) {
      console.error('Error checking for existing sandbox account:', existingSandboxError);
      return res.status(500).json({ error: 'Failed to check for an existing test account' });
    }

    if (existingSandbox) {
      return res.json(await buildAuthenticatedUserResponse(existingSandbox));
    }

    const sandboxUsername = await generateUniqueSandboxUsername(currentUser.username);
    const sandboxPhoneNumber = await generateUniqueSandboxPhoneNumber(currentUser.user_id);

    const { data: createdSandbox, error: createSandboxError } = await supabase
      .from('users')
      .insert([
        {
          phone_number: sandboxPhoneNumber,
          username: sandboxUsername,
          user_type: currentUser.user_type || 'user',
          is_test_account: true,
          linked_live_user_id: currentUser.user_id,
        }
      ])
      .select('user_id, username, phone_number, user_type, is_test_account, linked_live_user_id')
      .single();

    if (createSandboxError) {
      console.error('Error creating sandbox account:', createSandboxError);
      return res.status(500).json({ error: 'Failed to create a test account' });
    }

    return res.status(201).json(await buildAuthenticatedUserResponse(createdSandbox));
  } catch (error) {
    console.error('Error switching test mode:', error);
    return res.status(500).json({ error: 'Failed to switch test mode' });
  }
});

app.post('/admin/session/logout', requireAdminSession, async (req, res) => {
  try {
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

// Helper function to normalize weightclass strings (case/spacing insensitive)
function normalizeWeightclass(str) {
  return (str || '').toString().toLowerCase().replace(/[^a-z]/g, '');
}

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
    
    // Debug: log the first weightclass to see what columns are available
    if (weightclasses.length > 0) {
      console.log('Available weightclass columns:', Object.keys(weightclasses[0]));
    }

    // Standard UFC weight class limits (in lbs)
    const standardWeights = {
      'flyweight': 125,
      'bantamweight': 135,
      'featherweight': 145,
      'lightweight': 155,
      'welterweight': 170,
      'middleweight': 185,
      'lightheavyweight': 205,
      'heavyweight': 265,
      'womensatomweight': 105,
      'womensstrawweight': 115,
      'womensflyweight': 125,
      'womensbantamweight': 135,
      'womensfeatherweight': 145
    };

    // Create a mapping from official_weightclass to gay_weightclass (case-insensitive)
    const weightclassMap = new Map();
    weightclasses.forEach(wc => {
      // Use lowercase keys for case-insensitive matching
      const normalizedKey = normalizeWeightclass(wc.official_weightclass);
      const weightLbs = wc.weight_lbs || standardWeights[normalizedKey] || null;
      
      weightclassMap.set(normalizedKey, {
        gay_weightclass: wc.gay_weightclass,
        official_weightclass: wc.official_weightclass,
        weight_lbs: weightLbs
      });
    });
    
    return weightclassMap;
  } catch (error) {
    console.error('Error in getWeightclassMapping:', error);
    return new Map();
  }
}

// Helper function to transform fighter data
function transformFighterData(fighter) {
  const record = `${fighter.Record_Wins}-${fighter.Record_Losses}${fighter.Record_Draws > 0 ? `-${fighter.Record_Draws}` : ''}${fighter.Record_NoContests > 0 ? ` (${fighter.Record_NoContests}NC)` : ''}`;
  
  // Debug log for raw fighter data
  console.log('Raw fighter data:', {
    name: `${fighter.FirstName} ${fighter.LastName}`,
    odds: fighter.odds,
    oddsType: typeof fighter.odds,
    streak: fighter.Streak
  });
  
  // Format odds to include + sign for positive values
  let formattedOdds = null;
  if (fighter.odds !== null && fighter.odds !== undefined) {
    const oddsNum = parseInt(fighter.odds);
    formattedOdds = oddsNum > 0 ? `+${fighter.odds}` : fighter.odds;
  }
  
  const transformedFighter = {
    id: fighter.FighterId,
    name: `${fighter.FirstName} ${fighter.LastName}`,
    firstName: fighter.FirstName,
    lastName: fighter.LastName,
    nickname: fighter.Nickname || null,
    record: record,
    stance: fighter.Stance || 'N/A',
    // Use whichever case variant of style is present
    style: fighter.Style || fighter.style || 'N/A',
    image: fighter.ImageURL,
    rank: (fighter.Rank !== undefined && fighter.Rank !== null) ? fighter.Rank : null,
    odds: formattedOdds,
    country: fighter.FightingOutOf_Country || 'N/A',
    age: fighter.Age !== undefined ? fighter.Age : null,
    weight: fighter.Weight_lbs || null,
    height: fighter.Height_in || null,
    reach: fighter.Reach_in || null,
    streak: fighter.Streak,
    koTkoWins: fighter.KO_TKO_Wins ?? null,
    koTkoLosses: fighter.KO_TKO_Losses ?? null,
    submissionWins: fighter.Submission_Wins ?? null,
    submissionLosses: fighter.Submission_Losses ?? null,
    decisionWins: fighter.Decision_Wins ?? null,
    decisionLosses: fighter.Decision_Losses ?? null
  };

  // Debug log for transformed fighter data
  console.log('Transformed fighter:', {
    name: transformedFighter.name,
    odds: transformedFighter.odds
  });

  return transformedFighter;
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
      .select('FightId, EventId, Corner, FighterId, FirstName, LastName, Nickname, Record_Wins, Record_Losses, Record_Draws, Record_NoContests, Stance, style, ImageURL, Rank, odds, FightingOutOf_Country, Age, Weight_lbs, Height_in, Reach_in, Streak, KO_TKO_Wins, KO_TKO_Losses, Submission_Wins, Submission_Losses, Decision_Wins, Decision_Losses, card_tier, CardSegment, FighterWeightClass, FightOrder, FightStatus')
      .eq('EventId', latestEvent[0].id);

    if (fightsError) {
      console.error('Error fetching fights:', fightsError);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    // Get weightclass mapping
    const weightclassMap = await getWeightclassMapping();

    // Debug log for raw fight data
    console.log('Sample fight data from database:', fights.slice(0, 1).map(f => ({
      name: `${f.FirstName} ${f.LastName}`,
      odds: f.odds,
      oddsType: typeof f.odds
    })));

    // Get fight results
    const { data: fightResults, error: resultsError } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id');

    if (resultsError) {
      console.error('Error fetching fight results:', resultsError);
      return res.status(500).json({ error: 'Failed to fetch fight results' });
    }

    // Create a map of fight results
    const fightResultsMap = new Map();
    fightResults.forEach(result => {
      const { fight_id, fighter_id } = result;
      fightResultsMap.set(fight_id, fighter_id);
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
      const redFighter = transformFighterData(fighters.red);
      const blueFighter = transformFighterData(fighters.blue);

      // Map card segment names
      let displayCardTier = fighters.card_tier;
      if (fighters.card_tier === 'Prelims1') {
        displayCardTier = 'Prelims';
      } else if (fighters.card_tier === 'Prelims2') {
        displayCardTier = 'Early Prelims';
      }

      // Map the weightclass using the weightclasses table
      const weightclassData = weightclassMap.get(normalizeWeightclass(fighters.red.FighterWeightClass)) || {};
      const displayWeightclass = weightclassData.gay_weightclass || weightclassData.official_weightclass || fighters.red.FighterWeightClass;

      const transformedFight = {
        id: fightId,
        event_id: latestEvent[0].id,
        fighter1_id: redFighter.id,
        fighter1_name: redFighter.name,
        fighter1_firstName: redFighter.firstName,
        fighter1_lastName: redFighter.lastName,
        fighter1_nickname: redFighter.nickname,
        fighter1_record: redFighter.record,
        fighter1_height: redFighter.height,
        fighter1_weight: redFighter.weight,
        fighter1_reach: redFighter.reach,
        fighter1_stance: redFighter.stance,
        fighter1_style: redFighter.style,
        fighter1_image: redFighter.image,
        fighter1_country: redFighter.country,
        fighter1_age: redFighter.age,
        fighter1_rank: redFighter.rank,
        fighter1_odds: redFighter.odds,
        fighter1_streak: redFighter.streak,
        fighter1_ko_tko_wins: redFighter.koTkoWins,
        fighter1_ko_tko_losses: redFighter.koTkoLosses,
        fighter1_submission_wins: redFighter.submissionWins,
        fighter1_submission_losses: redFighter.submissionLosses,
        fighter1_decision_wins: redFighter.decisionWins,
        fighter1_decision_losses: redFighter.decisionLosses,
        fighter2_id: blueFighter.id,
        fighter2_name: blueFighter.name,
        fighter2_firstName: blueFighter.firstName,
        fighter2_lastName: blueFighter.lastName,
        fighter2_nickname: blueFighter.nickname,
        fighter2_record: blueFighter.record,
        fighter2_height: blueFighter.height,
        fighter2_weight: blueFighter.weight,
        fighter2_reach: blueFighter.reach,
        fighter2_stance: blueFighter.stance,
        fighter2_style: blueFighter.style,
        fighter2_image: blueFighter.image,
        fighter2_country: blueFighter.country,
        fighter2_age: blueFighter.age,
        fighter2_rank: blueFighter.rank,
        fighter2_odds: blueFighter.odds,
        fighter2_streak: blueFighter.streak,
        fighter2_ko_tko_wins: blueFighter.koTkoWins,
        fighter2_ko_tko_losses: blueFighter.koTkoLosses,
        fighter2_submission_wins: blueFighter.submissionWins,
        fighter2_submission_losses: blueFighter.submissionLosses,
        fighter2_decision_wins: blueFighter.decisionWins,
        fighter2_decision_losses: blueFighter.decisionLosses,
        winner: result || null,
        is_completed: result ? true : false,
        card_tier: displayCardTier,
        weightclass: displayWeightclass,
        weightclass_official: weightclassData.official_weightclass || fighters.red.FighterWeightClass,
        weightclass_lbs: weightclassData.weight_lbs || fighters.red.Weight_lbs,
        bout_order: fighters.red.FightOrder
      };

      transformedFights.push(transformedFight);
    });

    res.json(transformedFights);
  } catch (error) {
    console.error('Error fetching fights:', error);
    res.status(500).json({ error: 'Failed to fetch fights' });
  }
});

app.post('/predict', async (req, res) => {
  const { fightId, fighter_id, username, user_id } = req.body;
  if (!fightId || !fighter_id || (!username && !user_id)) {
    return res.status(400).json({ error: "Missing required data" });
  }
  try {
    console.log('Received prediction request:', {
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
    let checkQuery = supabase.from('predictions').select('fight_id').eq('fight_id', fightId);
    if (user_id) {
      checkQuery = checkQuery.eq('user_id', user_id);
    } else if (username) {
      checkQuery = checkQuery.eq('username', username);
    }
    const { data: existingPrediction, error: checkError } = await checkQuery.single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
      console.error('Error checking existing prediction:', checkError);
      return res.status(500).json({ error: "Error checking existing prediction" });
    }

    // Insert or update prediction
    let insertData = {
      fight_id: fightId,
      fighter_id,
      betting_odds,
    };
    if (user_id) {
      insertData.user_id = user_id;
    }
    if (username) {
      insertData.username = username;
    }
    let upsertQuery = supabase.from('predictions').upsert([insertData], { onConflict: ['fight_id', user_id ? 'user_id' : 'username'] });
    const { data: upserted, error: upsertError } = await upsertQuery;

    if (upsertError) {
      console.error('Error inserting/updating prediction:', upsertError);
      return res.status(500).json({ error: 'Failed to submit prediction' });
    }

    console.log('Prediction saved successfully');
    res.status(200).json(upserted);
  } catch (error) {
    console.error('Error in prediction endpoint:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/predictions', async (req, res) => {
  try {
    const { username, user_id } = req.query;
    if (!username && !user_id) {
      return res.status(400).json({ error: 'Username or user_id is required' });
    }
    let query = supabase.from('predictions').select('fight_id, fighter_id, username, user_id');
    if (user_id) {
      query = query.eq('user_id', user_id);
    } else if (username) {
      query = query.eq('username', username);
    }
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

app.get('/predictions/history', async (req, res) => {
  try {
    const { username, user_id } = req.query;
    if (!username && !user_id) {
      return res.status(400).json({ error: 'Username or user_id is required' });
    }

    let predictionsQuery = supabase
      .from('predictions')
      .select('fight_id, fighter_id, username, user_id');
    if (user_id) {
      predictionsQuery = predictionsQuery.eq('user_id', user_id);
    } else if (username) {
      predictionsQuery = predictionsQuery.eq('username', username);
    }

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
      .select('fight_id, fighter_id, is_completed')
      .in('fight_id', fightIds);
    const fightResults = await fetchAllFromSupabase(fightResultsQuery);
    const fightResultMap = new Map(
      (fightResults || []).map(result => [
        Number(result.fight_id),
        {
          winner: result.fighter_id,
          is_completed: Boolean(result.is_completed)
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
          is_completed: isCompleted,
          fighter_won: fighterWon
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

app.get('/predictions/filter', async (req, res) => {
  const { fight_id, fighter_id, viewer_user_id: viewerUserId } = req.query;

  if (!fight_id || !fighter_id) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const audience = await resolveAudienceForUserId(viewerUserId);

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
    const users = await fetchAudienceUsers(`
      user_id, 
      username, 
      is_bot, 
      selected_playercard_id,
      playercards!selected_playercard_id (
        id,
        name,
        image_url,
        category
      )
    `, audience);
    const audienceUsers = users || [];
    const audienceUserMaps = buildAudienceUserMaps(audienceUsers);
    const filteredPredictions = (predictions || []).filter(
      (prediction) => Boolean(resolveAudienceUserForRow(prediction, audienceUserMaps))
    );

    if (filteredPredictions.length === 0) {
      return res.status(200).json([]);
    }

    // Get leaderboard data for rankings
    const audienceUserIds = buildAudienceUserIdList(audienceUsers);
    const { data: results, error: resultsError } = await supabase
      .from('prediction_results')
      .select('user_id, predicted_correctly, points')
      .in('user_id', audienceUserIds);
    const filteredResults = results || [];

    if (resultsError) {
      console.error('Error fetching prediction results:', resultsError);
      return res.status(500).json({ error: "Error fetching leaderboard data" });
    }

    // Process leaderboard data
    const userStats = {};
    filteredResults.forEach(result => {
      const userIdStr = String(result.user_id);
      const user = audienceUserMaps.byId.get(userIdStr);
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
      const predictionUser = resolveAudienceUserForRow(prediction, audienceUserMaps);
      const predictionUserId = predictionUser ? String(predictionUser.user_id) : null;

      return {
        ...prediction,
        user_id: predictionUserId || prediction.user_id || null,
        username: predictionUser?.username || prediction.username || 'Unknown',
        is_bot: Boolean(predictionUser?.is_bot),
        playercard: predictionUser?.playercards || null,
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

app.get('/utils/image-proxy', async (req, res) => {
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
    const upstreamResponse = await fetch(parsedUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'FightPickerImageProxy/1.0'
      }
    });

    if (!upstreamResponse.ok) {
      return res.status(502).json({ error: `Upstream image request failed (${upstreamResponse.status})` });
    }

    const contentType = upstreamResponse.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: 'Upstream resource is not an image' });
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

    console.log('Received request to cancel fight:', { id });

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
      .select('FightId, EventId, Corner, FighterId, FirstName, LastName, Nickname, Record_Wins, Record_Losses, Record_Draws, Record_NoContests, Stance, style, ImageURL, Rank, odds, FightingOutOf_Country, Age, Weight_lbs, Height_in, Reach_in, Streak, KO_TKO_Wins, KO_TKO_Losses, Submission_Wins, Submission_Losses, Decision_Wins, Decision_Losses, CardSegment, FighterWeightClass, FightOrder, FightStatus')
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

    // Get weightclass mapping
    const weightclassMap = await getWeightclassMapping();

    // Map the weightclass using the weightclasses table
    const officialWeightclass = redFighter.FighterWeightClass;
    const displayWeightclass = weightclassMap.get(normalizeWeightclass(officialWeightclass)) || officialWeightclass;

    // Transform the fight data (similar to other endpoints)
    const transformedFight = {
      id: id,
      event_id: event_id,
      fighter1_id: redFighter.FighterId,
      fighter1_name: `${redFighter.FirstName} ${redFighter.LastName}`,
      fighter1_firstName: redFighter.FirstName,
      fighter1_lastName: redFighter.LastName,
      fighter1_nickname: redFighter.Nickname,
      fighter1_record: `${redFighter.Record_Wins}-${redFighter.Record_Losses}${redFighter.Record_Draws > 0 ? `-${redFighter.Record_Draws}` : ''}`,
      fighter1_height: redFighter.Height_in,
      fighter1_weight: redFighter.Weight_lbs,
      fighter1_reach: redFighter.Reach_in,
      fighter1_stance: redFighter.Stance,
      fighter1_style: redFighter.Style,
      fighter1_image: redFighter.ImageURL,
      fighter1_country: redFighter.FightingOutOf_Country,
      fighter1_age: redFighter.Age,
      fighter1_rank: redFighter.rank,
      fighter1_odds: redFighter.odds,
      fighter1_streak: redFighter.Streak,
      fighter1_ko_tko_wins: redFighter.KO_TKO_Wins ?? null,
      fighter1_ko_tko_losses: redFighter.KO_TKO_Losses ?? null,
      fighter1_submission_wins: redFighter.Submission_Wins ?? null,
      fighter1_submission_losses: redFighter.Submission_Losses ?? null,
      fighter1_decision_wins: redFighter.Decision_Wins ?? null,
      fighter1_decision_losses: redFighter.Decision_Losses ?? null,
      fighter2_id: blueFighter.FighterId,
      fighter2_name: `${blueFighter.FirstName} ${blueFighter.LastName}`,
      fighter2_firstName: blueFighter.FirstName,
      fighter2_lastName: blueFighter.LastName,
      fighter2_nickname: blueFighter.Nickname,
      fighter2_record: `${blueFighter.Record_Wins}-${blueFighter.Record_Losses}${blueFighter.Record_Draws > 0 ? `-${blueFighter.Record_Draws}` : ''}`,
      fighter2_height: blueFighter.Height_in,
      fighter2_weight: blueFighter.Weight_lbs,
      fighter2_reach: blueFighter.Reach_in,
      fighter2_stance: blueFighter.Stance,
      fighter2_style: blueFighter.Style,
      fighter2_image: blueFighter.ImageURL,
      fighter2_country: blueFighter.FightingOutOf_Country,
      fighter2_age: blueFighter.Age,
      fighter2_ko_tko_wins: blueFighter.KO_TKO_Wins ?? null,
      fighter2_ko_tko_losses: blueFighter.KO_TKO_Losses ?? null,
      fighter2_submission_wins: blueFighter.Submission_Wins ?? null,
      fighter2_submission_losses: blueFighter.Submission_Losses ?? null,
      fighter2_decision_wins: blueFighter.Decision_Wins ?? null,
      fighter2_decision_losses: blueFighter.Decision_Losses ?? null,
      winner: null, // No winner for canceled fights
      is_completed: false, // Canceled fights are not completed
      is_canceled: true, // Add canceled flag
      fight_status: 'Canceled',
      card_tier: redFighter.CardSegment,
      weightclass: displayWeightclass,
      weightclass_official: weightclassMap.get(normalizeWeightclass(redFighter.FighterWeightClass))?.official_weightclass || redFighter.FighterWeightClass,
      weightclass_lbs: weightclassMap.get(normalizeWeightclass(redFighter.FighterWeightClass))?.weight_lbs || redFighter.Weight_lbs,
      bout_order: redFighter.FightOrder
    };

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
    const { winner } = req.body;

    console.log('Received request to update fight result:', {
      id,
      idType: typeof id,
      idLength: id.length,
      winner,
      winnerType: typeof winner
    });

    // First get the fight data to get the event_id and fighter IDs
    const { data: fightData, error: getFightError } = await supabase
      .from('ufc_full_fight_card')
      .select('FightId, EventId, Corner, FighterId, FirstName, LastName, Nickname, Record_Wins, Record_Losses, Record_Draws, Record_NoContests, Stance, style, ImageURL, Rank, odds, FightingOutOf_Country, Age, Weight_lbs, Height_in, Reach_in, Streak, KO_TKO_Wins, KO_TKO_Losses, Submission_Wins, Submission_Losses, Decision_Wins, Decision_Losses, CardSegment, FighterWeightClass, FightOrder, FightStatus')
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

    // Determine the winner's fighter_id
    let winner_id = winner;  // Use the winner ID directly since that's what we're receiving

    // Update fight_results table with fighter_id
    const { error: updateError } = await supabase
      .from('fight_results')
      .upsert([
        {
          fight_id: id,
          fighter_id: winner_id,
          is_completed: winner_id !== null
        }
      ], {
        onConflict: ['fight_id']
      });

    if (updateError) {
      console.error('Error updating fight result:', updateError);
      return res.status(500).json({ error: 'Failed to update fight result' });
    }

    // If winner is null, also clear prediction results for this fight
    if (winner_id === null) {
      const { error: deleteError } = await supabase
        .from('prediction_results')
        .delete()
        .eq('fight_id', id);

      if (deleteError) {
        console.error('Error clearing prediction results:', deleteError);
        return res.status(500).json({ error: 'Failed to clear prediction results' });
      }
    }

    // Get all predictions for this fight
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('fight_id, fighter_id, betting_odds, user_id, username')
      .eq('fight_id', id);

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
      return res.status(500).json({ error: 'Failed to fetch predictions' });
    }

    // Loop through each prediction and update/insert the result
    for (const prediction of predictions) {
      const isMatch = String(prediction.fighter_id) === String(winner);
      
      // Calculate points based on betting odds if the prediction is correct
      let points = 0;
      if (isMatch) {
        const odds = prediction.betting_odds;
        if (odds !== undefined && odds !== null) {
          // UFC odds: positive is underdog, negative is favorite
          // For a correct pick:
          // Underdog: Points = (odds / 100) + 1
          // Favorite: Points = (100 / abs(odds)) + 1
          points = odds > 0
            ? Math.ceil((odds / 100) + 1)
            : Math.ceil((100 / Math.abs(odds)) + 1);
        } else {
          points = 1; // Default to 1 point if odds are not available
        }
      }
      
      console.log('Prediction comparison:', {
        fight_id: id,
        user_id: prediction.user_id, // Logging the user_id being used
        prediction_fighter_id: prediction.fighter_id,
        winner_id: winner_id,
        isMatch: isMatch
      });

      const { error: resultError } = await supabase
        .from('prediction_results')
        .upsert({
          fight_id: id,
          user_id: prediction.user_id,
          username: prediction.username,
          event_id: event_id,
          predicted_correctly: isMatch,
          points: points,
          created_at: new Date().toISOString()
        }, {
          onConflict: ['fight_id', 'user_id']
        });

      if (resultError) {
        console.error('Error updating prediction results:', resultError);
        return res.status(500).json({ error: 'Failed to update prediction results' });
      }
    }

    // Get the updated fight result
    const { data: updatedResult, error: getResultError } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed')
      .eq('fight_id', id)
      .single();

    if (getResultError) {
      console.error('Error fetching updated fight result:', getResultError);
      return res.status(500).json({ error: 'Failed to fetch updated fight result' });
    }

    // Get weightclass mapping
    const weightclassMap = await getWeightclassMapping();

    // Map the weightclass using the weightclasses table
    const officialWeightclass = redFighter.FighterWeightClass;
    const displayWeightclass = weightclassMap.get(normalizeWeightclass(officialWeightclass)) || officialWeightclass;

    // Transform the fight data
    const transformedFight = {
      id: id,
      event_id: event_id,
      fighter1_id: redFighter.FighterId,
      fighter1_name: redFighter.FirstName + ' ' + redFighter.LastName,
      fighter1_firstName: redFighter.FirstName,
      fighter1_lastName: redFighter.LastName,
      fighter1_nickname: redFighter.Nickname,
      fighter1_record: `${redFighter.Record_Wins}-${redFighter.Record_Losses}${redFighter.Record_Draws > 0 ? `-${redFighter.Record_Draws}` : ''}`,
      fighter1_height: redFighter.Height_in,
      fighter1_weight: redFighter.Weight_lbs,
      fighter1_reach: redFighter.Reach_in,
      fighter1_stance: redFighter.Stance,
      fighter1_style: redFighter.Style,
      fighter1_image: redFighter.ImageURL,
      fighter1_country: redFighter.FightingOutOf_Country,
      fighter1_age: redFighter.Age,
      fighter1_ko_tko_wins: redFighter.KO_TKO_Wins ?? null,
      fighter1_ko_tko_losses: redFighter.KO_TKO_Losses ?? null,
      fighter1_submission_wins: redFighter.Submission_Wins ?? null,
      fighter1_submission_losses: redFighter.Submission_Losses ?? null,
      fighter1_decision_wins: redFighter.Decision_Wins ?? null,
      fighter1_decision_losses: redFighter.Decision_Losses ?? null,
      fighter2_id: blueFighter.FighterId,
      fighter2_name: blueFighter.FirstName + ' ' + blueFighter.LastName,
      fighter2_firstName: blueFighter.FirstName,
      fighter2_lastName: blueFighter.LastName,
      fighter2_nickname: blueFighter.Nickname,
      fighter2_record: `${blueFighter.Record_Wins}-${blueFighter.Record_Losses}${blueFighter.Record_Draws > 0 ? `-${blueFighter.Record_Draws}` : ''}`,
      fighter2_height: blueFighter.Height_in,
      fighter2_weight: blueFighter.Weight_lbs,
      fighter2_reach: blueFighter.Reach_in,
      fighter2_stance: blueFighter.Stance,
      fighter2_style: blueFighter.Style,
      fighter2_image: blueFighter.ImageURL,
      fighter2_country: blueFighter.FightingOutOf_Country,
      fighter2_age: blueFighter.Age,
      fighter2_ko_tko_wins: blueFighter.KO_TKO_Wins ?? null,
      fighter2_ko_tko_losses: blueFighter.KO_TKO_Losses ?? null,
      fighter2_submission_wins: blueFighter.Submission_Wins ?? null,
      fighter2_submission_losses: blueFighter.Submission_Losses ?? null,
      fighter2_decision_wins: blueFighter.Decision_Wins ?? null,
      fighter2_decision_losses: blueFighter.Decision_Losses ?? null,
      winner: updatedResult.fighter_id,
      is_completed: updatedResult.is_completed,
      card_tier: redFighter.CardSegment,
      weightclass: displayWeightclass,
      weightclass_official: weightclassMap.get(normalizeWeightclass(redFighter.FighterWeightClass))?.official_weightclass || redFighter.FighterWeightClass,
      weightclass_lbs: weightclassMap.get(normalizeWeightclass(redFighter.FighterWeightClass))?.weight_lbs || redFighter.Weight_lbs,
      bout_order: redFighter.FightOrder
    };

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
        is_completed: winner_id !== null,
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
    console.log('DEBUG Streak for', username, ':', {
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

/**
 * Fetches all users along with their playercard metadata and returns lookup maps.
 */
async function fetchUsersWithPlayercards(audience = 'live') {
  const users = await fetchAudienceUsers(`
    user_id,
    username,
    is_bot,
    is_test_account,
    selected_playercard_id,
    playercards!selected_playercard_id (
      id,
      name,
      image_url,
      category
    )
  `, audience);
  const safeUsers = users || [];

  return {
    users: safeUsers,
    userIdToUsername: new Map(safeUsers.map(user => [String(user.user_id), user.username])),
    userIdToIsBot: new Map(safeUsers.map(user => [String(user.user_id), user.is_bot])),
    userIdToPlayercard: new Map(safeUsers.map(user => [String(user.user_id), user.playercards]))
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
async function buildEventLeaderboard(eventId, { allTimeResults, userCache, audience = 'live' } = {}) {
  if (!eventId) {
    throw new Error('eventId is required to build leaderboard');
  }

  const numericEventId = Number(eventId);
  const eventIdFilter = Number.isNaN(numericEventId) ? eventId : numericEventId;
  const effectiveUserCache = userCache || await fetchUsersWithPlayercards(audience);
  const audienceUserIds = buildAudienceUserIdList(effectiveUserCache.users);

  if (audienceUserIds.length === 0) {
    return { leaderboard: [], winners: [] };
  }

  const eventResultsQuery = supabase
    .from('prediction_results')
    .select('event_id, user_id, predicted_correctly, points')
    .eq('event_id', eventIdFilter)
    .in('user_id', audienceUserIds);
  const eventResults = await fetchAllFromSupabase(eventResultsQuery);

  const effectiveAllTimeResults = allTimeResults || await fetchAllFromSupabase(
    supabase
      .from('prediction_results')
      .select('user_id, predicted_correctly, created_at')
      .in('user_id', audienceUserIds)
  );
  const { userIdToUsername, userIdToIsBot, userIdToPlayercard } = effectiveUserCache;

  const userStats = {};
  (eventResults || []).forEach(result => {
    const userIdStr = String(result.user_id);
    if (!userStats[userIdStr]) {
      userStats[userIdStr] = {
        user_id: userIdStr,
        username: userIdToUsername.get(userIdStr) || 'Unknown',
        is_bot: userIdToIsBot.get(userIdStr) || false,
        playercard: userIdToPlayercard.get(userIdStr) || null,
        total_predictions: 0,
        correct_predictions: 0,
        total_points: 0
      };
    }
    userStats[userIdStr].total_predictions++;
    if (result.predicted_correctly) {
      userStats[userIdStr].correct_predictions++;
    }
    userStats[userIdStr].total_points += (result.points || 0);
  });

  // Group all-time results by user for streak calculation
  const allTimeUserResultsMap = {};
  (effectiveAllTimeResults || []).forEach(result => {
    const userIdStr = String(result.user_id);
    if (!allTimeUserResultsMap[userIdStr]) {
      allTimeUserResultsMap[userIdStr] = [];
    }
    allTimeUserResultsMap[userIdStr].push(result);
  });

  Object.keys(userStats).forEach(userIdStr => {
    const userResults = allTimeUserResultsMap[userIdStr];
    userStats[userIdStr].streak = calculateUserStreak(userResults);
  });

  const leaderboard = Object.values(userStats)
    .map(user => ({
      ...user,
      accuracy: user.total_predictions > 0
        ? ((user.correct_predictions / user.total_predictions) * 100).toFixed(2)
        : '0.00'
    }))
    .sort((a, b) =>
      b.total_points - a.total_points ||
      b.correct_predictions - a.correct_predictions ||
      parseFloat(b.accuracy) - parseFloat(a.accuracy)
    );

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
 */
async function fetchHumanEventWinCounts(userIds, year) {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return {};
    }

    const uniqueIds = Array.from(new Set(userIds.map(id => String(id))));
    if (uniqueIds.length === 0) {
      return {};
    }

    const usersQuery = supabase
      .from('users')
      .select('user_id, is_bot')
      .in('user_id', uniqueIds);
    const users = await fetchAllFromSupabase(usersQuery);
    const humanUserIds = (users || [])
      .filter(user => !user.is_bot)
      .map(user => String(user.user_id));

    if (humanUserIds.length === 0) {
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

    const events = await fetchAllFromSupabase(eventsQuery);
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
    const audience = await resolveAudienceForUserId(req.query?.viewer_user_id);
    const userCache = await fetchUsersWithPlayercards(audience);
    const audienceUserIds = buildAudienceUserIdList(userCache.users);

    if (audienceUserIds.length === 0) {
      return res.json([]);
    }

    // Get all prediction results using the pagination helper
    const resultsQuery = supabase
      .from('prediction_results')
      .select('user_id, predicted_correctly, points, created_at')
      .in('user_id', audienceUserIds);
    const results = await fetchAllFromSupabase(resultsQuery);

    // Map user_id to username, is_bot, and playercard info
    const { userIdToUsername, userIdToIsBot, userIdToPlayercard } = userCache;

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

    // Calculate streak for each user
    Object.keys(userStats).forEach(userIdStr => {
      const userResults = userResultsMap[userIdStr];
      const username = userIdToUsername.get(userIdStr);
      const streak = calculateUserStreak(userResults);
      userStats[userIdStr].streak = streak;
      
      // Debug logging
      if (username && (username.toLowerCase().includes('breachey') || username.toLowerCase().includes('breach'))) {
        console.log('LEADERBOARD DEBUG - Overall:', {
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
    console.error('Error processing leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to process leaderboard',
      details: error.message 
    });
  }
});

// Get 2025 season leaderboard
app.get('/leaderboard/2025', async (req, res) => {
  try {
    const audience = await resolveAudienceForUserId(req.query?.viewer_user_id);
    const userCache = await fetchUsersWithPlayercards(audience);
    const audienceUserIds = buildAudienceUserIdList(userCache.users);

    if (audienceUserIds.length === 0) {
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
      .in('user_id', audienceUserIds);
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
        .in('user_id', audienceUserIds)
    );

    // Map user_id to username, is_bot, and playercard info
    const { userIdToUsername, userIdToIsBot, userIdToPlayercard } = userCache;

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
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0
        };
      }
      userStats[userIdStr].total_predictions++;
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
    res.status(500).json({ 
      error: 'Failed to process 2025 leaderboard',
      details: error.message 
    });
  }
});

// Get current season (current year) leaderboard
app.get('/leaderboard/season', async (req, res) => {
  try {
    const audience = await resolveAudienceForUserId(req.query?.viewer_user_id);
    const userCache = await fetchUsersWithPlayercards(audience);
    const audienceUserIds = buildAudienceUserIdList(userCache.users);

    if (audienceUserIds.length === 0) {
      return res.json([]);
    }

    const currentYear = new Date().getFullYear();
    const seasonStart = `${currentYear}-01-01`;
    const nextSeasonStart = `${currentYear + 1}-01-01`;

    // Get all events from current year
    const seasonEventsQuery = supabase
      .from('events')
      .select('id')
      .gte('date', seasonStart)
      .lt('date', nextSeasonStart);
    const seasonEvents = await fetchAllFromSupabase(seasonEventsQuery);
    const seasonEventIds = new Set((seasonEvents || []).map(e => Number(e.id)));

    // Get all prediction results for current year events
    const allResultsQuery = supabase
      .from('prediction_results')
      .select('user_id, event_id, predicted_correctly, points')
      .in('user_id', audienceUserIds);
    const allResults = await fetchAllFromSupabase(allResultsQuery);
    
    // Filter results to only current year events
    const results = (allResults || []).filter(result => {
      const eventId = Number(result.event_id);
      return seasonEventIds.has(eventId);
    });

    // Get all-time prediction results for streak calculation (streaks continue from past)
    const allTimeResults = await fetchAllFromSupabase(
      supabase
        .from('prediction_results')
        .select('user_id, predicted_correctly, created_at')
        .in('user_id', audienceUserIds)
    );

    // Map user_id to username, is_bot, and playercard info
    const { userIdToUsername, userIdToIsBot, userIdToPlayercard } = userCache;

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
          total_predictions: 0,
          correct_predictions: 0,
          total_points: 0
        };
      }
      userStats[userIdStr].total_predictions++;
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
      .map(user => ({
        ...user,
        accuracy: user.total_predictions > 0 
          ? ((user.correct_predictions / user.total_predictions) * 100).toFixed(2)
          : '0.00',
        total_points: user.total_points,
      }))
      .sort((a, b) =>
        b.total_points - a.total_points ||
        b.correct_predictions - a.correct_predictions ||
        parseFloat(b.accuracy) - parseFloat(a.accuracy)
      );

    const eventWinCounts = await fetchEventWinCounts(leaderboard.map(user => user.user_id), currentYear);
    const humanEventWinCounts = await fetchHumanEventWinCounts(leaderboard.map(user => user.user_id), currentYear);
    leaderboard = addEventWinCounts(leaderboard, eventWinCounts);
    leaderboard = addEventWinCounts(leaderboard, humanEventWinCounts, 'event_win_count_human');

    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing season leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to process season leaderboard',
      details: error.message 
    });
  }
});

// Get monthly leaderboard
app.get('/leaderboard/monthly', async (req, res) => {
  try {
    const audience = await resolveAudienceForUserId(req.query?.viewer_user_id);
    const userCache = await fetchUsersWithPlayercards(audience);
    const audienceUserIds = buildAudienceUserIdList(userCache.users);

    if (audienceUserIds.length === 0) {
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
      .in('user_id', audienceUserIds);
    const results = await fetchAllFromSupabase(resultsQuery);

    // Get all-time prediction results for streak calculation
    const allTimeResultsQuery = supabase
      .from('prediction_results')
      .select('user_id, predicted_correctly, created_at')
      .in('user_id', audienceUserIds);
    const allTimeResults = await fetchAllFromSupabase(allTimeResultsQuery);

    // Map user_id to username, is_bot, and playercard info
    const { userIdToUsername, userIdToIsBot, userIdToPlayercard } = userCache;

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
    res.status(500).json({ 
      error: 'Failed to process monthly leaderboard',
      details: error.message 
    });
  }
});

// Get all events
app.get('/events', async (req, res) => {
  try {
    console.log('Attempting to fetch events from Supabase...');

    // Fetch events from the events table (this is the primary source now)
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('id, name, date, is_completed, image_url, venue, location_city, location_state, location_country')
      .order('date', { ascending: false });

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return res.status(500).json({ error: 'Failed to fetch events', details: eventsError.message });
    }

    if (!eventsData || eventsData.length === 0) {
      console.log('No events found in events table');
      return res.status(404).json({ error: 'No events found' });
    }

    // Get unique EventIds from ufc_full_fight_card to check which events have fight data
    const { data: fightCardData, error: fightCardError } = await supabase
      .from('ufc_full_fight_card')
      .select('EventId, StartTime')
      .order('EventId', { ascending: false });

    if (fightCardError) {
      console.error('Error fetching fight card data:', fightCardError);
      // Continue without fight data check - events will still be shown
    }

    // Create a set of EventIds that have fight data
    const eventIdsWithFights = new Set();
    const eventStartTimes = new Map();
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
      });
    }

    console.log(`Successfully fetched ${eventsData.length} events from events table`);
    console.log(`Found ${eventIdsWithFights.size} events with fight data`);

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
      return res.status(500).json({ error: 'Failed to fetch event start time', details: error.message });
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
        .select('fight_id, fighter_id, is_completed')
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

    const preview = getFightCardPreview(previewToken, eventId);
    if (!preview) {
      return res.status(404).json({ error: 'Preview token was not found or has expired' });
    }

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

    await deleteFightCardPreview(previewToken);

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

  let scraperOutput = null;

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

    scraperOutput = await runFightCardScraper({
      eventId,
      repoRoot: REPO_ROOT,
    });

    const parsedCsv = await parseFightCardCsvFile(scraperOutput.csvPath);
    if (parsedCsv.headerErrors.length > 0) {
      await logAdminAction(req, {
        action: 'fight_card.refresh_odds',
        status: 'error',
        targetType: 'event',
        targetId: eventId,
        eventId,
        metadata: {
          blockerCount: parsedCsv.headerErrors.length,
          blockers: parsedCsv.headerErrors,
        },
      });
      return res.status(400).json({
        error: 'Scraper CSV headers were invalid',
        blockers: parsedCsv.headerErrors,
      });
    }

    const refreshPlan = buildOddsRefreshPlan({
      eventId,
      scrapedRows: parsedCsv.rows,
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
        warningCount: refreshPlan.warnings.length,
        warnings: refreshPlan.warnings,
      },
    });

    return res.json({
      eventId,
      updatedCount: refreshPlan.updatedCount,
      unchangedCount: refreshPlan.unchangedCount,
      missingOddsCount: refreshPlan.missingOddsCount,
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
  } finally {
    if (scraperOutput?.scratchDir) {
      await removePreviewAssets(scraperOutput.scratchDir);
    }
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
      .select('FightId, EventId, Corner, FighterId, FirstName, LastName, Nickname, Record_Wins, Record_Losses, Record_Draws, Record_NoContests, Stance, style, ImageURL, Rank, odds, FightingOutOf_Country, Age, Weight_lbs, Height_in, Reach_in, Streak, KO_TKO_Wins, KO_TKO_Losses, Submission_Wins, Submission_Losses, Decision_Wins, Decision_Losses, CardSegment, FighterWeightClass, FightOrder, FightStatus')
      .eq('EventId', id)
      .order('FightOrder');

    if (error) {
      console.error('Error fetching fights for event:', error);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    // If no fight data exists, return empty array (this allows future events to be displayed)
    if (!data || data.length === 0) {
      console.log(`No fight data found for event ${id}, returning empty array`);
      return res.json([]);
    }

    // Get fight results
    const { data: fightResults, error: resultsError } = await supabase
      .from('fight_results')
      .select('fight_id, fighter_id, is_completed');

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
        is_completed: result.is_completed
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
      const redFighter = transformFighterData(fighters.red);
      const blueFighter = transformFighterData(fighters.blue);

      // Map card segment names
      let displayCardTier = fighters.card_tier;
      if (fighters.card_tier === 'Prelims1') {
          displayCardTier = 'Prelims';
      } else if (fighters.card_tier === 'Prelims2') {
          displayCardTier = 'Early Prelims';
      }

      // Map the weightclass using the weightclasses table
      const weightclassData = weightclassMap.get(normalizeWeightclass(fighters.weightclass)) || {};
      const displayWeightclass = weightclassData.gay_weightclass || weightclassData.official_weightclass || fighters.weightclass;

      const transformedFight = {
        id: fightId,
        event_id: id,
        event_date: eventData.date || null,
        fighter1_id: redFighter.id,
        fighter1_name: redFighter.name,
        fighter1_firstName: redFighter.firstName,
        fighter1_lastName: redFighter.lastName,
        fighter1_nickname: redFighter.nickname,
        fighter1_record: redFighter.record,
        fighter1_height: redFighter.height,
        fighter1_weight: redFighter.weight,
        fighter1_reach: redFighter.reach,
        fighter1_stance: redFighter.stance,
        fighter1_style: redFighter.style,
        fighter1_image: redFighter.image,
        fighter1_country: redFighter.country,
        fighter1_age: redFighter.age,
        fighter1_rank: redFighter.rank,
        fighter1_odds: redFighter.odds,
        fighter1_streak: redFighter.streak,
        fighter1_ko_tko_wins: redFighter.koTkoWins,
        fighter1_ko_tko_losses: redFighter.koTkoLosses,
        fighter1_submission_wins: redFighter.submissionWins,
        fighter1_submission_losses: redFighter.submissionLosses,
        fighter1_decision_wins: redFighter.decisionWins,
        fighter1_decision_losses: redFighter.decisionLosses,
        fighter2_id: blueFighter.id,
        fighter2_name: blueFighter.name,
        fighter2_firstName: blueFighter.firstName,
        fighter2_lastName: blueFighter.lastName,
        fighter2_nickname: blueFighter.nickname,
        fighter2_record: blueFighter.record,
        fighter2_height: blueFighter.height,
        fighter2_weight: blueFighter.weight,
        fighter2_reach: blueFighter.reach,
        fighter2_stance: blueFighter.stance,
        fighter2_style: blueFighter.style,
        fighter2_image: blueFighter.image,
        fighter2_country: blueFighter.country,
        fighter2_age: blueFighter.age,
        fighter2_rank: blueFighter.rank,
        fighter2_odds: blueFighter.odds,
        fighter2_streak: blueFighter.streak,
        fighter2_ko_tko_wins: blueFighter.koTkoWins,
        fighter2_ko_tko_losses: blueFighter.koTkoLosses,
        fighter2_submission_wins: blueFighter.submissionWins,
        fighter2_submission_losses: blueFighter.submissionLosses,
        fighter2_decision_wins: blueFighter.decisionWins,
        fighter2_decision_losses: blueFighter.decisionLosses,
        winner: result?.winner || null,
        is_completed: result?.is_completed || false,
        is_canceled: fighters.red.FightStatus === 'Canceled' || fighters.blue.FightStatus === 'Canceled',
        fight_status: fighters.red.FightStatus || 'Scheduled',
        card_tier: displayCardTier,
        weightclass: displayWeightclass,
        weightclass_official: weightclassData.official_weightclass || fighters.weightclass,
        weightclass_lbs: weightclassData.weight_lbs || fighters.Weight_lbs,
        bout_order: fighters.red.FightOrder
      };

      transformedFights.push(transformedFight);
    }

    res.json(transformedFights);
  } catch (error) {
    console.error('Error in GET /events/:id/fights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get vote counts for all fights in an event (total + human counts)
app.get('/events/:id/vote-counts', async (req, res) => {
  try {
    const { id } = req.params;
    const audience = await resolveAudienceForUserId(req.query?.viewer_user_id);
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

    const audienceUsers = await fetchAudienceUsers('user_id, username, is_bot', audience);
    const audienceUserMaps = buildAudienceUserMaps(audienceUsers);
    const filteredPredictions = (predictions || []).filter(
      (prediction) => Boolean(resolveAudienceUserForRow(prediction, audienceUserMaps))
    );

    if (filteredPredictions.length === 0) {
      return res.json({});
    }

    const counts = {};
    filteredPredictions.forEach(pred => {
      const fightIdStr = String(pred.fight_id);
      const fighterIdStr = String(pred.fighter_id);
      const predictionUser = resolveAudienceUserForRow(pred, audienceUserMaps);
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

// Get event leaderboard
app.get('/events/:id/leaderboard', async (req, res) => {
  try {
    const { id } = req.params;
    const audience = await resolveAudienceForUserId(req.query?.viewer_user_id);
    const { leaderboard } = await buildEventLeaderboard(id, { audience });
    const currentYear = new Date().getFullYear();
    const eventWinCounts = await fetchEventWinCounts(leaderboard.map(entry => entry.user_id), currentYear);
    const humanEventWinCounts = await fetchHumanEventWinCounts(leaderboard.map(entry => entry.user_id), currentYear);
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

    const winnerSummary = {
      live: { leaderboard: [], winners: [] },
      test: { leaderboard: [], winners: [] },
    };

    for (const audience of ['live', 'test']) {
      const userCache = await fetchUsersWithPlayercards(audience);
      const audienceUserIds = buildAudienceUserIdList(userCache.users);

      if (audienceUserIds.length === 0) {
        continue;
      }

      const allTimeResults = await fetchAllFromSupabase(
        supabase
          .from('prediction_results')
          .select('user_id, predicted_correctly, created_at')
          .in('user_id', audienceUserIds)
      );
      const { leaderboard, winners } = await buildEventLeaderboard(eventId, {
        audience,
        allTimeResults,
        userCache,
      });

      await clearEventWinnersForAudience(eventId, userCache.users);

      if (winners.length > 0) {
        const payload = winners.map(winner => ({
          event_id: eventId,
          user_id: winner.user_id,
          points: winner.total_points
        }));

        const { error: insertError } = await supabase
          .from('event_winners')
          .insert(payload);

        if (insertError) {
          console.error(`Error inserting ${audience} event winners:`, insertError);
          return res.status(500).json({ error: 'Failed to save event winners' });
        }
      }

      winnerSummary[audience] = { leaderboard, winners };
    }

    await logAdminAction(req, {
      action: 'event.finalize',
      status: 'success',
      targetType: 'event',
      targetId: eventId,
      eventId,
      metadata: {
        status: targetStatus,
        live_leaderboard_size: winnerSummary.live.leaderboard.length,
        live_winner_count: winnerSummary.live.winners.length,
        test_leaderboard_size: winnerSummary.test.leaderboard.length,
        test_winner_count: winnerSummary.test.winners.length,
      },
    });

    res.json({
      event_id: eventId,
      status: targetStatus,
      winners: winnerSummary.live.winners,
      live_winners: winnerSummary.live.winners,
      test_winners: winnerSummary.test.winners
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

    const audienceCaches = {
      live: await fetchUsersWithPlayercards('live'),
      test: await fetchUsersWithPlayercards('test'),
    };
    const audienceAllTimeResults = {};

    for (const audience of ['live', 'test']) {
      const audienceUserIds = buildAudienceUserIdList(audienceCaches[audience].users);
      audienceAllTimeResults[audience] = audienceUserIds.length > 0
        ? await fetchAllFromSupabase(
          supabase
            .from('prediction_results')
            .select('user_id, predicted_correctly, created_at')
            .in('user_id', audienceUserIds)
        )
        : [];
    }

    const processed = [];
    const skipped = [];

    for (const eventId of targetIds) {
      try {
        const audienceWinnerCounts = { live: 0, test: 0 };

        for (const audience of ['live', 'test']) {
          const userCache = audienceCaches[audience];
          const audienceUserIds = buildAudienceUserIdList(userCache.users);

          if (audienceUserIds.length === 0) {
            continue;
          }

          const { winners } = await buildEventLeaderboard(eventId, {
            audience,
            allTimeResults: audienceAllTimeResults[audience],
            userCache,
          });

          await clearEventWinnersForAudience(eventId, userCache.users);

          if (winners.length === 0) {
            continue;
          }

          const payload = winners.map(winner => ({
            event_id: eventId,
            user_id: winner.user_id,
            points: winner.total_points
          }));

          const { error: insertError } = await supabase
            .from('event_winners')
            .insert(payload);

          if (insertError) {
            throw new Error(`Failed to save ${audience} winners: ${insertError.message}`);
          }

          audienceWinnerCounts[audience] = winners.length;
        }

        if (audienceWinnerCounts.live === 0 && audienceWinnerCounts.test === 0) {
          skipped.push({ event_id: eventId, reason: 'No eligible winners (did users submit picks?)' });
          continue;
        }

        processed.push({
          event_id: eventId,
          winner_count_live: audienceWinnerCounts.live,
          winner_count_test: audienceWinnerCounts.test,
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
    console.log('Fetching fight data for ID:', id);

    // First get the fight data (remove .single() here)
    const { data: fightData, error: getFightError } = await supabase
      .from('ufc_full_fight_card')
      .select('FightId, EventId, Corner, FighterId, FirstName, LastName, Nickname, Record_Wins, Record_Losses, Record_Draws, Record_NoContests, Stance, style, ImageURL, Rank, odds, FightingOutOf_Country, Age, Weight_lbs, Height_in, Reach_in, Streak, KO_TKO_Wins, KO_TKO_Losses, Submission_Wins, Submission_Losses, Decision_Wins, Decision_Losses, CardSegment, FighterWeightClass, FightOrder, FightStatus')
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
      .select('fight_id, fighter_id, is_completed')
      .eq('fight_id', id)
      .single();

    if (getResultError && getResultError.code !== 'PGRST116') {
      console.error('Error fetching fight result:', getResultError);
      return res.status(500).json({ error: 'Failed to fetch fight result' });
    }

    // Get weightclass mapping
    const weightclassMap = await getWeightclassMapping();

    // Map the weightclass using the weightclasses table
    const officialWeightclass = redFighter.FighterWeightClass;
    const displayWeightclass = weightclassMap.get(normalizeWeightclass(officialWeightclass)) || officialWeightclass;

    // Transform the fight data
    const transformedFight = {
      id: id,
      event_id: event_id,
      fighter1_id: redFighter.FighterId,
      fighter1_name: `${redFighter.FirstName} ${redFighter.LastName}`,
      fighter1_firstName: redFighter.FirstName,
      fighter1_lastName: redFighter.LastName,
      fighter1_nickname: redFighter.Nickname,
      fighter1_record: `${redFighter.Record_Wins}-${redFighter.Record_Losses}${redFighter.Record_Draws > 0 ? `-${redFighter.Record_Draws}` : ''}`,
      fighter1_height: redFighter.Height_in,
      fighter1_weight: redFighter.Weight_lbs,
      fighter1_reach: redFighter.Reach_in,
      fighter1_stance: redFighter.Stance,
      fighter1_style: redFighter.Style,
      fighter1_image: redFighter.ImageURL,
      fighter1_country: redFighter.FightingOutOf_Country,
      fighter1_age: redFighter.Age,
      fighter1_rank: redFighter.rank,
      fighter1_odds: redFighter.odds,
      fighter1_streak: redFighter.Streak,
      fighter1_ko_tko_wins: redFighter.KO_TKO_Wins ?? null,
      fighter1_ko_tko_losses: redFighter.KO_TKO_Losses ?? null,
      fighter1_submission_wins: redFighter.Submission_Wins ?? null,
      fighter1_submission_losses: redFighter.Submission_Losses ?? null,
      fighter1_decision_wins: redFighter.Decision_Wins ?? null,
      fighter1_decision_losses: redFighter.Decision_Losses ?? null,
      fighter2_id: blueFighter.FighterId,
      fighter2_name: `${blueFighter.FirstName} ${blueFighter.LastName}`,
      fighter2_firstName: blueFighter.FirstName,
      fighter2_lastName: blueFighter.LastName,
      fighter2_nickname: blueFighter.Nickname,
      fighter2_record: `${blueFighter.Record_Wins}-${blueFighter.Record_Losses}${blueFighter.Record_Draws > 0 ? `-${blueFighter.Record_Draws}` : ''}`,
      fighter2_height: blueFighter.Height_in,
      fighter2_weight: blueFighter.Weight_lbs,
      fighter2_reach: blueFighter.Reach_in,
      fighter2_stance: blueFighter.Stance,
      fighter2_style: blueFighter.Style,
      fighter2_image: blueFighter.ImageURL,
      fighter2_country: blueFighter.FightingOutOf_Country,
      fighter2_age: blueFighter.Age,
      fighter2_rank: blueFighter.rank,
      fighter2_odds: blueFighter.odds,
      fighter2_streak: blueFighter.Streak,
      fighter2_ko_tko_wins: blueFighter.KO_TKO_Wins ?? null,
      fighter2_ko_tko_losses: blueFighter.KO_TKO_Losses ?? null,
      fighter2_submission_wins: blueFighter.Submission_Wins ?? null,
      fighter2_submission_losses: blueFighter.Submission_Losses ?? null,
      fighter2_decision_wins: blueFighter.Decision_Wins ?? null,
      fighter2_decision_losses: blueFighter.Decision_Losses ?? null,
      winner: fightResult?.fighter_id || null,
      is_completed: fightResult?.is_completed || false,
      card_tier: redFighter.CardSegment,
      weightclass: displayWeightclass,
      weightclass_official: weightclassMap.get(normalizeWeightclass(redFighter.FighterWeightClass))?.official_weightclass || redFighter.FighterWeightClass,
      weightclass_lbs: weightclassMap.get(normalizeWeightclass(redFighter.FighterWeightClass))?.weight_lbs || redFighter.Weight_lbs,
      bout_order: redFighter.FightOrder
    };

    res.json(transformedFight);
  } catch (error) {
    console.error('Error fetching fight data:', error);
    res.status(500).json({ error: 'Failed to fetch fight data' });
  }
});

// Migration endpoint to fix fight results
app.post('/migrate/fight-results', requireAdminSession, async (req, res) => {
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
      console.log('Processing fight result:', {
        fight_id: result.fight_id,
        current_winner: result.winner,
        winner_type: typeof result.winner
      });

      const fighters = fightMap.get(result.fight_id);
      if (!fighters || !fighters.red || !fighters.blue) {
        console.log('Skipping fight - missing fighter data:', result.fight_id);
        continue;
      }

      // If winner is already a number (fighter_id), keep it as is
      if (typeof result.winner === 'number') {
        console.log('Winner is already a fighter_id:', result.winner);
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

      console.log('Fighter name formats:', {
        fight_id: result.fight_id,
        red: redFighterFormats,
        blue: blueFighterFormats,
        winner: result.winner
      });

      let winner_id = null;
      if (redFighterFormats.includes(result.winner)) {
        winner_id = fighters.red.FighterId;
        console.log('Matched red fighter:', {
          fight_id: result.fight_id,
          winner_name: result.winner,
          winner_id: winner_id
        });
      } else if (blueFighterFormats.includes(result.winner)) {
        winner_id = fighters.blue.FighterId;
        console.log('Matched blue fighter:', {
          fight_id: result.fight_id,
          winner_name: result.winner,
          winner_id: winner_id
        });
      } else {
        console.log('No match found for winner:', {
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
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        username, 
        phone_number, 
        user_type,
        is_test_account,
        linked_live_user_id,
        created_at, 
        selected_playercard_id,
        playercards!selected_playercard_id (
          id,
          name,
          image_url,
          category
        )
      `)
      .eq('username', username)
      .single();
    if (error) {
      console.error('Error fetching user profile:', error);
      return res.status(500).json({ error: 'Failed to fetch user profile' });
    }
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
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        username, 
        phone_number, 
        user_type,
        is_test_account,
        linked_live_user_id,
        created_at, 
        selected_playercard_id,
        playercards!selected_playercard_id (
          id,
          name,
          image_url,
          category
        )
      `)
      .eq('user_id', user_id)
      .single();
    if (error) {
      console.error('Error fetching user profile by ID:', error);
      return res.status(500).json({ error: 'Failed to fetch user profile' });
    }
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
      return res.status(500).json({ error: 'Failed to fetch prediction results', details: error.message });
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
      return res.status(500).json({ error: 'Failed to fetch events for stats', details: error.message });
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

app.get('/user/:user_id/vote-reminders', async (req, res) => {
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

app.put('/user/:user_id/vote-reminders/:fighter_id', async (req, res) => {
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

app.delete('/user/:user_id/vote-reminders/:fighter_id', async (req, res) => {
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
    const targetUser = await fetchUserById(user_id, 'user_id, username, is_test_account');
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    const audience = getAudienceForUserRecord(targetUser);
    const audienceUsers = await fetchAudienceUsers('user_id, username, is_bot, is_test_account', audience);

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

    const eventWinners = await fetchAllFromSupabase(
      supabase
        .from('event_winners')
        .select('event_id')
        .eq('user_id', user_id)
        .in('event_id', eventIds)
    );
    const eventWins = (eventWinners || []).length;

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
    const users = audienceUsers;
    const humanUsers = (users || []).filter(candidate => !isBotFlag(candidate?.is_bot));
    const humanUserSet = new Set(humanUsers.map(candidate => String(candidate.user_id)));
    const userIdToUsername = new Map((users || []).map(candidate => [String(candidate.user_id), candidate.username || `User ${candidate.user_id}`]));

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

    const rivalryRows = [...opponentMap.values()]
      .map(item => ({
        ...item,
        net_edge: item.you_right_they_wrong - item.they_right_you_wrong,
        pick_overlap_pct: item.shared_pick_fights > 0
          ? Number(((item.same_picks / item.shared_pick_fights) * 100).toFixed(2))
          : 0
      }))
      .filter(item => item.shared_fights > 0 || item.shared_pick_fights > 0);

    const biggestNemesis = rivalryRows.length > 0
      ? [...rivalryRows].sort((a, b) =>
        b.they_right_you_wrong - a.they_right_you_wrong ||
        b.shared_fights - a.shared_fights
      )[0]
      : null;

    const headToHead = rivalryRows.length > 0
      ? [...rivalryRows].sort((a, b) =>
        b.shared_fights - a.shared_fights ||
        Math.abs(b.net_edge) - Math.abs(a.net_edge)
      )[0]
      : null;

    const pickTwin = rivalryRows.length > 0
      ? [...rivalryRows]
        .filter(item => item.shared_pick_fights >= 3)
        .sort((a, b) =>
          b.pick_overlap_pct - a.pick_overlap_pct ||
          b.shared_pick_fights - a.shared_pick_fights
        )[0] || null
      : null;

    // Cohort benchmarks (active human users for this season)
    const seasonEventWinners = await fetchAllFromSupabase(
      supabase
        .from('event_winners')
        .select('user_id, event_id')
        .in('event_id', eventIds)
    );
    const seasonEventWinsByUser = {};
    (seasonEventWinners || []).forEach((row) => {
      const candidateUserId = String(row.user_id);
      if (!humanUserSet.has(candidateUserId)) {
        return;
      }
      seasonEventWinsByUser[candidateUserId] = (seasonEventWinsByUser[candidateUserId] || 0) + 1;
    });

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
            times_they_were_right_you_wrong: biggestNemesis.they_right_you_wrong,
            shared_fights: biggestNemesis.shared_fights
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
            overlap_pct: pickTwin.pick_overlap_pct,
            shared_fights: pickTwin.shared_pick_fights,
            same_picks: pickTwin.same_picks
          }
          : null
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
    return res.status(500).json({
      error: 'Failed to fetch user highlights',
      details: error.message
    });
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

// Update user's selected playercard
app.patch('/user/:user_id/playercard', async (req, res) => {
  try {
    const { user_id } = req.params;
    const { playercard_id } = req.body;
    
    console.log('Playercard update request:', { user_id, playercard_id });
    
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
    console.log('Attempting to update user', user_id, 'to playercard', playercard_id);
    
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
      console.log('User exists:', existingUser);
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
      
      console.log('Update result:', updatedUser);
      console.log('Update error:', updateError);
      
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
        console.log('Update returned empty, checking if update actually succeeded...');
        try {
          const { data: verifyUser, error: verifyError } = await supabase
            .from('users')
            .select('user_id, username, selected_playercard_id')
            .eq('user_id', parseInt(user_id))
            .single();
          
          console.log('Verification result:', verifyUser);
          console.log('Verification error:', verifyError);
          
          if (verifyError) {
            console.error('Error verifying user update:', verifyError);
            return res.status(500).json({ error: 'Failed to verify update' });
          }
          
          if (verifyUser && verifyUser.selected_playercard_id == playercard_id) {
            console.log('Update actually succeeded, using verification data');
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
      console.log('Playercard update completed successfully');
      
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

// Database migration endpoint (run once to add required_event_id column)
app.post('/migrate/add-playercard-event-requirements', requireAdminSession, async (req, res) => {
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

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const connectionSuccess = await testSupabaseConnection();
  if (!connectionSuccess) {
    console.error('WARNING: Failed to connect to Supabase on startup');
  }
});
