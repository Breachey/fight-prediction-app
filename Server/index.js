const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://rnixnohdeayspegtrfds.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaXhub2hkZWF5c3BlZ3RyZmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMyODE3NzksImV4cCI6MjA1ODg1Nzc3OX0.quxIKY4BIWXAxSXVUSP353-sR_NBTCcrVZ8Fuj6hmiE'
);

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://fight-prediction-app.vercel.app',
      'https://fight-prediction-app-git-breachey-brandons-projects-a1d75233.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(express.json());

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

    console.log('Supabase connection test successful');
    return true;
  } catch (error) {
    console.error('Error testing Supabase connection:', error);
    return false;
  }
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
        { phone_number: phoneNumber, username: username }
      ])
      .select('user_id, username, phone_number')
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

    res.json({
      user_id: newUser.user_id,
      username: newUser.username,
      phoneNumber: newUser.phone_number
    });
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
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (error) {
      console.error('Error finding user:', error);
      return res.status(500).json({ error: 'Failed to find user' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user_id: user.user_id,
      username: user.username,
      phoneNumber: user.phone_number
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    style: fighter.Stance || 'N/A',
    image: fighter.ImageURL,
    rank: fighter.Rank || null,
    odds: formattedOdds,
    country: fighter.FightingOutOf_Country || 'N/A',
    age: fighter.Age !== undefined ? fighter.Age : null,
    weight: fighter.Weight_lbs || null,
    height: fighter.Height_in || null,
    reach: fighter.Reach_in || null,
    streak: fighter.Streak
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
      .from('ufc_events')
      .select('*')
      .order('date', { ascending: false })
      .limit(1);

    if (eventError) {
      console.error('Error fetching latest event:', eventError);
      return res.status(500).json({ error: 'Failed to fetch latest event' });
    }

    // Get all fights for the latest event
    const { data: fights, error: fightsError } = await supabase
      .from('ufc_full_fight_card')
      .select('*')
      .eq('EventId', latestEvent[0].id);

    if (fightsError) {
      console.error('Error fetching fights:', fightsError);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    // Debug log for raw fight data
    console.log('Sample fight data from database:', fights.slice(0, 1).map(f => ({
      name: `${f.FirstName} ${f.LastName}`,
      odds: f.odds,
      oddsType: typeof f.odds
    })));

    // Get fight results
    const { data: fightResults, error: resultsError } = await supabase
      .from('fight_results')
      .select('*');

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
        fighter1_stance: redFighter.style,
        fighter1_style: redFighter.style,
        fighter1_image: redFighter.image,
        fighter1_country: redFighter.country,
        fighter1_age: redFighter.age,
        fighter1_rank: redFighter.rank,
        fighter1_odds: redFighter.odds,
        fighter1_streak: redFighter.streak,
        fighter2_id: blueFighter.id,
        fighter2_name: blueFighter.name,
        fighter2_firstName: blueFighter.firstName,
        fighter2_lastName: blueFighter.lastName,
        fighter2_nickname: blueFighter.nickname,
        fighter2_record: blueFighter.record,
        fighter2_height: blueFighter.height,
        fighter2_weight: blueFighter.weight,
        fighter2_reach: blueFighter.reach,
        fighter2_stance: blueFighter.style,
        fighter2_style: blueFighter.style,
        fighter2_image: blueFighter.image,
        fighter2_country: blueFighter.country,
        fighter2_age: blueFighter.age,
        fighter2_rank: blueFighter.rank,
        fighter2_odds: blueFighter.odds,
        fighter2_streak: blueFighter.streak,
        winner: result || null,
        is_completed: result ? true : false,
        card_tier: displayCardTier,
        weightclass: fighters.weightclass,
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
      .select('*')
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
    let checkQuery = supabase.from('predictions').select('*').eq('fight_id', fightId);
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
    let query = supabase.from('predictions').select('*');
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

app.get('/predictions/filter', async (req, res) => {
  const { fight_id, fighter_id } = req.query;

  if (!fight_id || !fighter_id) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // Get predictions
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('*')
      .eq('fight_id', fight_id)
      .eq('fighter_id', fighter_id);

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
      return res.status(500).json({ error: "Error fetching predictions" });
    }

    // Get user information including is_bot status
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('user_id, username, is_bot');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ error: "Error fetching user data" });
    }

    // Get leaderboard data for rankings
    const { data: results, error: resultsError } = await supabase
      .from('prediction_results')
      .select('*');

    if (resultsError) {
      console.error('Error fetching prediction results:', resultsError);
      return res.status(500).json({ error: "Error fetching leaderboard data" });
    }

    // Process leaderboard data
    const userStats = {};
    results.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!userStats[userIdStr]) {
        userStats[userIdStr] = {
          user_id: userIdStr,
          username: result.user_id, // Store username since user_id is actually the username
          is_bot: result.is_bot || false,
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

    // Create maps for user data - use username instead of user_id for rankMap
    const userMap = new Map(users.map(user => [user.username, user.is_bot]));
    const rankMap = new Map(leaderboard.map((user, index) => [user.username, index + 1]));

    // Add is_bot status and ranking to each prediction
    const predictionsWithMetadata = predictions.map(prediction => ({
      ...prediction,
      is_bot: userMap.get(prediction.username) || false,
      rank: rankMap.get(prediction.username) || null
    }));

    res.status(200).json(predictionsWithMetadata);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'API is running' });
});

app.post('/ufc_full_fight_card/:id/result', async (req, res) => {
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
      .select('*')
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
      .select('*')
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
      .select('*')
      .eq('fight_id', id)
      .single();

    if (getResultError) {
      console.error('Error fetching updated fight result:', getResultError);
      return res.status(500).json({ error: 'Failed to fetch updated fight result' });
    }

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
      winner: updatedResult.fighter_id,
      is_completed: updatedResult.is_completed,
      card_tier: redFighter.CardSegment,
      weightclass: redFighter.FighterWeightClass,
      bout_order: redFighter.FightOrder
    };

    res.json(transformedFight);
  } catch (error) {
    console.error('Error updating fight result:', error);
    res.status(500).json({ error: 'Failed to update fight result' });
  }
});

// Get overall leaderboard
app.get('/leaderboard', async (req, res) => {
  try {
    // Get all prediction results using the pagination helper
    const resultsQuery = supabase.from('prediction_results').select('*');
    const results = await fetchAllFromSupabase(resultsQuery);

    // Get all users with their user_id, username, is_bot
    const usersQuery = supabase.from('users').select('user_id, username, is_bot');
    const users = await fetchAllFromSupabase(usersQuery);

    // Map user_id to username and is_bot
    const userIdToUsername = new Map(users.map(user => [String(user.user_id), user.username]));
    const userIdToIsBot = new Map(users.map(user => [String(user.user_id), user.is_bot]));

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!userStats[userIdStr]) {
        userStats[userIdStr] = {
          user_id: userIdStr,
          username: userIdToUsername.get(userIdStr) || 'Unknown',
          is_bot: userIdToIsBot.get(userIdStr) || false,
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
    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to process leaderboard',
      details: error.message 
    });
  }
});

// Get monthly leaderboard
app.get('/leaderboard/monthly', async (req, res) => {
  try {
    // Get the first and last day of the current month in ISO format
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const firstDayISO = firstDay.toISOString();
    const nextMonthISO = nextMonth.toISOString();

    // Get all prediction results for the current month using the pagination helper
    const resultsQuery = supabase
      .from('prediction_results')
      .select('*')
      .gte('created_at', firstDayISO)
      .lt('created_at', nextMonthISO);
    const results = await fetchAllFromSupabase(resultsQuery);

    // Get all users with their user_id, username, is_bot
    const usersQuery = supabase.from('users').select('user_id, username, is_bot');
    const users = await fetchAllFromSupabase(usersQuery);

    // Map user_id to username and is_bot
    const userIdToUsername = new Map(users.map(user => [String(user.user_id), user.username]));
    const userIdToIsBot = new Map(users.map(user => [String(user.user_id), user.is_bot]));

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!userStats[userIdStr]) {
        userStats[userIdStr] = {
          user_id: userIdStr,
          username: userIdToUsername.get(userIdStr) || 'Unknown',
          is_bot: userIdToIsBot.get(userIdStr) || false,
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
    // Convert to array and calculate accuracy
    const leaderboard = Object.values(userStats)
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

    const { data, error } = await supabase
      .from('ufc_full_fight_card')
      .select('Event, EventId, StartTime, EventStatus, Venue, Location_City, Location_State')
      .order('EventId', { ascending: false });

    if (error) {
      console.error('Error fetching events:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return res.status(500).json({ error: 'Failed to fetch events', details: error.message });
    }

    if (!data) {
      console.log('No data returned from Supabase');
      return res.status(404).json({ error: 'No events found' });
    }

    // Remove duplicates using Set
    const uniqueEvents = Array.from(
      new Set(data.map(event => JSON.stringify({ 
        id: event.EventId, 
        name: event.Event,
        date: event.StartTime,
        status: event.EventStatus,
        venue: event.Venue,
        location_city: event.Location_City,
        location_state: event.Location_State
      })))
    ).map(str => JSON.parse(str));

    console.log(`Successfully fetched ${uniqueEvents.length} unique events`);

    // Transform the data to match the expected structure
    const transformedEvents = uniqueEvents.map(event => ({
      id: event.id,
      name: event.name,
      date: event.date,
      is_completed: event.status === 'Final',
      status: event.status === 'Final' ? 'Complete' : 'Upcoming',
      venue: event.venue,
      location_city: event.location_city,
      location_state: event.location_state
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

// Get fights for a specific event
app.get('/events/:id/fights', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get fights for the event
    const { data, error } = await supabase
      .from('ufc_full_fight_card')
      .select('*')
      .eq('EventId', id)
      .order('FightOrder');

    if (error) {
      console.error('Error fetching fights for event:', error);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    // Get fight results
    const { data: fightResults, error: resultsError } = await supabase
      .from('fight_results')
      .select('*');

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

      const transformedFight = {
        id: fightId,
        event_id: id,
        fighter1_id: redFighter.id,
        fighter1_name: redFighter.name,
        fighter1_firstName: redFighter.firstName,
        fighter1_lastName: redFighter.lastName,
        fighter1_nickname: redFighter.nickname,
        fighter1_record: redFighter.record,
        fighter1_height: redFighter.height,
        fighter1_weight: redFighter.weight,
        fighter1_reach: redFighter.reach,
        fighter1_stance: redFighter.style,
        fighter1_style: redFighter.style,
        fighter1_image: redFighter.image,
        fighter1_country: redFighter.country,
        fighter1_age: redFighter.age,
        fighter1_rank: redFighter.rank,
        fighter1_odds: redFighter.odds,
        fighter1_streak: redFighter.streak,
        fighter2_id: blueFighter.id,
        fighter2_name: blueFighter.name,
        fighter2_firstName: blueFighter.firstName,
        fighter2_lastName: blueFighter.lastName,
        fighter2_nickname: blueFighter.nickname,
        fighter2_record: blueFighter.record,
        fighter2_height: blueFighter.height,
        fighter2_weight: blueFighter.weight,
        fighter2_reach: blueFighter.reach,
        fighter2_stance: blueFighter.style,
        fighter2_style: blueFighter.style,
        fighter2_image: blueFighter.image,
        fighter2_country: blueFighter.country,
        fighter2_age: blueFighter.age,
        fighter2_rank: blueFighter.rank,
        fighter2_odds: blueFighter.odds,
        fighter2_streak: blueFighter.streak,
        winner: result?.winner || null,
        is_completed: result?.is_completed || false,
        card_tier: displayCardTier,
        weightclass: fighters.weightclass,
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

// Get event leaderboard
app.get('/events/:id/leaderboard', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get all prediction results for this event using the pagination helper
    const resultsQuery = supabase
      .from('prediction_results')
      .select('*')
      .eq('event_id', id);
    const results = await fetchAllFromSupabase(resultsQuery);

    // Get all users with their user_id, username, is_bot
    const usersQuery = supabase.from('users').select('user_id, username, is_bot');
    const users = await fetchAllFromSupabase(usersQuery);
    
    const userIdToUsername = new Map(users.map(user => [String(user.user_id), user.username]));
    const userIdToIsBot = new Map(users.map(user => [String(user.user_id), user.is_bot]));

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      const userIdStr = String(result.user_id);
      if (!userStats[userIdStr]) {
        userStats[userIdStr] = {
          user_id: userIdStr,
          username: userIdToUsername.get(userIdStr) || 'Unknown',
          is_bot: userIdToIsBot.get(userIdStr) || false,
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
    // Convert to array and calculate accuracy
    const leaderboard = Object.values(userStats)
      .map(user => ({
        ...user,
        accuracy: ((user.correct_predictions / user.total_predictions) * 100).toFixed(2),
        total_points: user.total_points
      }))
      .sort((a, b) =>
        b.total_points - a.total_points ||
        b.correct_predictions - a.correct_predictions ||
        parseFloat(b.accuracy) - parseFloat(a.accuracy)
      );
    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing event leaderboard:', error);
    res.status(500).json({ 
      error: 'Failed to process event leaderboard',
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
      .select('*')
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
      .select('*')
      .eq('fight_id', id)
      .single();

    if (getResultError && getResultError.code !== 'PGRST116') {
      console.error('Error fetching fight result:', getResultError);
      return res.status(500).json({ error: 'Failed to fetch fight result' });
    }

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
      fighter1_rank: redFighter.Rank,
      fighter1_odds: redFighter.odds,
      fighter1_streak: redFighter.Streak,
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
      fighter2_rank: blueFighter.Rank,
      fighter2_odds: blueFighter.odds,
      fighter2_streak: blueFighter.Streak,
      winner: fightResult?.fighter_id || null,
      is_completed: fightResult?.is_completed || false,
      card_tier: redFighter.CardSegment,
      weightclass: redFighter.FighterWeightClass,
      bout_order: redFighter.FightOrder
    };

    res.json(transformedFight);
  } catch (error) {
    console.error('Error fetching fight data:', error);
    res.status(500).json({ error: 'Failed to fetch fight data' });
  }
});

// Migration endpoint to fix fight results
app.post('/migrate/fight-results', async (req, res) => {
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

    res.json({ message: `Successfully updated ${updates.length} fight results` });
  } catch (error) {
    console.error('Error in migration:', error);
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
      .select('username, phone_number, created_at')
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
      .select('username, phone_number, created_at')
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

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const connectionSuccess = await testSupabaseConnection();
  if (!connectionSuccess) {
    console.error('WARNING: Failed to connect to Supabase on startup');
  }
});