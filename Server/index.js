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
  origin: [
    'https://fight-prediction-app.vercel.app',
    'https://fight-prediction-app-git-breachey-brandons-projects-a1d75233.vercel.app',
    'http://localhost:3000',  // For local development
    'http://localhost:5173'   // For Vite's default port
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Add connection test
async function testSupabaseConnection() {
  try {
    console.log('Testing Supabase connection...');
    
    // First test basic connection
    const { data: countData, error: countError } = await supabase
      .from('ufc_fight_card')
      .select('count')
      .limit(1);

    if (countError) {
      console.error('Supabase connection test failed:', countError);
      return false;
    }

    // Get table structure
    const { data, error } = await supabase
      .from('ufc_fight_card')
      .select()
      .limit(1);

    if (error) {
      console.error('Failed to get table structure:', error);
    } else if (data && data.length > 0) {
      console.log('Available columns in ufc_fight_card:', Object.keys(data[0]).join(', '));
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
      .select()
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
  const fullName = fighter.Nickname ? 
    `${fighter.FirstName} "${fighter.Nickname}" ${fighter.LastName}` : 
    `${fighter.FirstName} ${fighter.LastName}`;
  
  // Format odds to include + sign for positive values
  let formattedOdds = null;
  if (fighter.Odds) {
    const oddsNum = parseInt(fighter.Odds);
    formattedOdds = oddsNum > 0 ? `+${fighter.Odds}` : fighter.Odds;
  }
  
  return {
    name: fullName,
    record: record,
    style: fighter.Stance || 'N/A',
    image: fighter.ImageURL,
    rank: null, // Will be added later
    odds: formattedOdds
  };
}

app.get('/fights', async (req, res) => {
  try {
    // Get the latest event
    const { data: events, error: eventError } = await supabase
      .from('ufc_full_fight_card')
      .select('Event, EventId')
      .order('EventId', { ascending: false })
      .limit(1);

    if (eventError || !events.length) {
      console.error('Error fetching latest event:', eventError);
      return res.status(500).json({ error: 'Failed to fetch latest event' });
    }

    const latestEventId = events[0].EventId;

    // Get fights for the latest event
    const { data, error: fightsError } = await supabase
      .from('ufc_full_fight_card')
      .select('*')
      .eq('EventId', latestEventId)
      .order('FightOrder');

    if (fightsError) {
      console.error('Error fetching fights:', fightsError);
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
    const resultsMap = new Map();
    fightResults.forEach(result => {
      resultsMap.set(result.fight_id, {
        winner: result.winner,
        is_completed: result.winner !== null
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

    // Transform the grouped data into the expected structure
    const transformedFights = Array.from(fightMap.entries())
      .filter(([_, fight]) => fight.red && fight.blue) // Only include complete fights
      .map(([fightId, fight]) => {
        const redFighter = transformFighterData(fight.red);
        const blueFighter = transformFighterData(fight.blue);
        const result = resultsMap.get(`${latestEventId}-${fightId}`) || { winner: null, is_completed: false };

        // Map card segment names
        let displayCardTier = fight.card_tier;
        if (fight.card_tier === 'Prelims1') {
          displayCardTier = 'Prelims';
        } else if (fight.card_tier === 'Prelims2') {
          displayCardTier = 'Early Prelims';
        }

        return {
          id: fightId,
          event_id: latestEventId,
          fighter1_name: redFighter.name,
          fighter1_rank: redFighter.rank,
          fighter1_record: redFighter.record,
          fighter1_odds: redFighter.odds,
          fighter1_style: redFighter.style,
          fighter1_image: redFighter.image,
          fighter2_name: blueFighter.name,
          fighter2_rank: blueFighter.rank,
          fighter2_record: blueFighter.record,
          fighter2_odds: blueFighter.odds,
          fighter2_style: blueFighter.style,
          fighter2_image: blueFighter.image,
          winner: result.winner,
          is_completed: result.is_completed,
          card_tier: displayCardTier,
          weightclass: fight.weightclass,
          bout_order: fight.red.FightOrder // Use FightOrder from the fighter data
        };
      })
      .sort((a, b) => a.bout_order - b.bout_order);

    res.json(transformedFights);
  } catch (error) {
    console.error('Error in GET /fights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/predict', async (req, res) => {
  const { fightId, selectedFighter, username } = req.body;

  if (!fightId || !selectedFighter || !username) {
    return res.status(400).json({ error: "Missing required data" });
  }

  try {
    console.log('Received prediction request:', {
      fightId,
      selectedFighter,
      username
    });

    // Check if prediction already exists
    const { data: existingPrediction, error: checkError } = await supabase
      .from('predictions')
      .select('*')
      .eq('fight_id', fightId)
      .eq('username', username)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows returned
      console.error('Error checking existing prediction:', checkError);
      return res.status(500).json({ error: "Error checking existing prediction" });
    }

    if (existingPrediction) {
      console.log('Updating existing prediction:', existingPrediction);
      // Update existing prediction
      const { error: updateError } = await supabase
        .from('predictions')
        .update({ selected_fighter: selectedFighter })
        .eq('fight_id', fightId)
        .eq('username', username);

      if (updateError) {
        console.error('Error updating prediction:', updateError);
        return res.status(500).json({ error: "Error updating prediction" });
      }

      return res.status(200).json({ message: "Prediction updated successfully" });
    }

    console.log('Inserting new prediction');
    // Insert new prediction
    const { error: insertError } = await supabase
      .from('predictions')
      .insert([{ 
        fight_id: fightId,
        selected_fighter: selectedFighter,
        username 
      }]);

    if (insertError) {
      console.error('Error inserting prediction:', insertError);
      return res.status(500).json({ error: "Error saving prediction" });
    }

    console.log('Prediction saved successfully');
    res.status(200).json({ message: "Prediction saved successfully" });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/predictions', async (req, res) => {
  const { data, error } = await supabase
    .from('predictions')
    .select('*');
  
  if (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error fetching predictions' });
  }
  
  res.json(data);
});

app.get('/predictions/filter', async (req, res) => {
  const { fight_id, selected_fighter } = req.query;
  
  if (!fight_id || !selected_fighter) {
    console.log('Missing parameters:', { fight_id, selected_fighter });
    return res.status(400).json({ message: "Missing query parameters" });
  }

  try {
    console.log('Fetching predictions with params:', {
      fight_id,
      selected_fighter,
      fight_id_type: typeof fight_id,
      selected_fighter_type: typeof selected_fighter
    });
    
    // Get all users with their is_bot status
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('username, is_bot');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ message: "Error fetching user data" });
    }

    // Create a map of username to is_bot status
    const userMap = new Map(users.map(user => [user.username, user.is_bot]));
    
    // Get predictions for this fight with exact match
    const { data: exactMatches, error: exactError } = await supabase
      .from('predictions')
      .select('username, created_at')
      .eq('fight_id', fight_id)
      .eq('selected_fighter', selected_fighter);
    
    if (exactError) {
      console.error('Error fetching predictions (exact match):', exactError);
      return res.status(500).json({ message: "Error fetching predictions" });
    }

    // Add is_bot status to each prediction
    const matchesWithBotStatus = (exactMatches || []).map(match => ({
      ...match,
      is_bot: userMap.get(match.username) || false
    }));
    
    // Try alternative name formats if no exact matches
    if (!matchesWithBotStatus.length) {
      console.log('No exact matches found, checking alternative formats');
      
      // Parse the fighter name components
      const nameParts = selected_fighter.match(/^([^\s"]+)\s+"([^"]+)"\s+([^\s"]+)$/);
      if (nameParts) {
        const [_, firstName, nickname, lastName] = nameParts;
        console.log('Parsed name parts:', { firstName, nickname, lastName });
        
        // Try without nickname
        const simpleName = `${firstName} ${lastName}`;
        console.log('Trying simple name format:', simpleName);
        
        const { data: simpleMatches, error: simpleError } = await supabase
          .from('predictions')
          .select('username, created_at')
          .eq('fight_id', fight_id)
          .eq('selected_fighter', simpleName);
          
        if (simpleError) {
          console.error('Error fetching predictions (simple name):', simpleError);
        } else if (simpleMatches && simpleMatches.length > 0) {
          console.log('Found matches with simple name format');
          // Add is_bot status to simple matches
          return res.json(simpleMatches.map(match => ({
            ...match,
            is_bot: userMap.get(match.username) || false
          })));
        }
      }
    }
    
    console.log('Successfully fetched predictions:', {
      fight_id,
      selected_fighter,
      results: matchesWithBotStatus
    });
    res.json(matchesWithBotStatus);
  } catch (error) {
    console.error('Error in predictions/filter:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'API is running' });
});

app.post('/ufc_fight_card/:id/result', async (req, res) => {
  try {
    const { id } = req.params;
    const { winner } = req.body;

    console.log('Updating fight result:', { id, winner, idType: typeof id });

    // Update fight_results table
    const { error: updateError } = await supabase
      .from('fight_results')
      .upsert([
        {
          fight_id: id,
          winner: winner,
          is_completed: winner !== null
        }
      ], {
        onConflict: ['fight_id']
      });

    if (updateError) {
      console.error('Error updating fight result:', updateError);
      console.error('Error details:', {
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code
      });
      return res.status(500).json({ error: 'Failed to update fight result' });
    }

    // If we're unsetting the result, delete any existing prediction results
    if (winner === null) {
      console.log('Deleting prediction results for fight:', id);
      const { error: deleteError } = await supabase
        .from('prediction_results')
        .delete()
        .eq('fight_id', id);

      if (deleteError) {
        console.error('Error deleting prediction results:', deleteError);
        console.error('Error details:', {
          message: deleteError.message,
          details: deleteError.details,
          hint: deleteError.hint,
          code: deleteError.code
        });
        return res.status(500).json({ error: 'Failed to delete prediction results' });
      }
    } else {
      // Get all predictions for this fight
      console.log('Fetching predictions for fight:', id);
      const { data: predictions, error: predictionsError } = await supabase
        .from('predictions')
        .select('username, selected_fighter')
        .eq('fight_id', id);

      if (predictionsError) {
        console.error('Error fetching predictions:', predictionsError);
        console.error('Error details:', {
          message: predictionsError.message,
          details: predictionsError.details,
          hint: predictionsError.hint,
          code: predictionsError.code
        });
        return res.status(500).json({ error: 'Failed to fetch predictions' });
      }

      console.log('Found predictions for this fight:', predictions);

      // Update prediction_results for each prediction
      for (const prediction of predictions) {
        const predicted_correctly = prediction.selected_fighter === winner;
        const event_id = fight.red.EventId; // Get event_id from the fight data
        console.log('Updating prediction result:', {
          user_id: prediction.username,
          fight_id: id,
          event_id,
          predicted_correctly
        });
        
        const { error: resultError } = await supabase
          .from('prediction_results')
          .upsert([
            {
              user_id: prediction.username,
              fight_id: id,
              event_id: event_id,
              predicted_correctly: predicted_correctly
            }
          ], {
            onConflict: ['user_id', 'fight_id']
          });

        if (resultError) {
          console.error('Error updating prediction result:', resultError);
          console.error('Error details:', {
            message: resultError.message,
            details: resultError.details,
            hint: resultError.hint,
            code: resultError.code
          });
          return res.status(500).json({ error: 'Failed to update prediction result' });
        }
      }
    }

    // Get the updated fight data
    const fightId = id;
    console.log('Fight ID:', fightId);
    
    const { data: fightData, error: getFightError } = await supabase
      .from('ufc_full_fight_card')
      .select('*')
      .eq('FightId', fightId);

    if (getFightError) {
      console.error('Error fetching updated fight:', getFightError);
      return res.status(500).json({ error: 'Failed to fetch updated fight' });
    }

    console.log('Fetched fight data:', fightData);

    // Transform the fight data to match the expected structure
    const fightMap = new Map();
    fightData.forEach(fighter => {
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

    const fight = fightMap.get(fightId);
    if (!fight || !fight.red || !fight.blue) {
      console.error('Fight not found in transformed data:', { fightId, fight });
      return res.status(404).json({ error: 'Fight not found' });
    }

    const redFighter = transformFighterData(fight.red);
    const blueFighter = transformFighterData(fight.blue);

    const transformedFight = {
      id: fightId,
      event_id: fight.red.EventId,
      fighter1_name: redFighter.name,
      fighter1_rank: redFighter.rank,
      fighter1_record: redFighter.record,
      fighter1_odds: redFighter.odds,
      fighter1_style: redFighter.style,
      fighter1_image: redFighter.image,
      fighter2_name: blueFighter.name,
      fighter2_rank: blueFighter.rank,
      fighter2_record: blueFighter.record,
      fighter2_odds: blueFighter.odds,
      fighter2_style: blueFighter.style,
      fighter2_image: blueFighter.image,
      winner: winner,
      is_completed: winner !== null,
      card_tier: fight.card_tier,
      weightclass: fight.weightclass,
      bout_order: fight.red.FightOrder
    };

    console.log('Returning transformed fight:', transformedFight);
    res.json(transformedFight);
  } catch (error) {
    console.error('Error updating fight result:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to update fight result' });
  }
});

// Get overall leaderboard
app.get('/leaderboard', async (req, res) => {
  try {
    // Get all prediction results
    const { data: results, error: resultsError } = await supabase
      .from('prediction_results')
      .select('*');

    if (resultsError) {
      console.error('Error fetching prediction results:', resultsError);
      return res.status(500).json({ 
        error: 'Failed to fetch leaderboard data',
        details: resultsError.message 
      });
    }

    // Get all users with their is_bot status
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('username, is_bot');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ 
        error: 'Failed to fetch user data',
        details: usersError.message 
      });
    }

    // Create a map of username to is_bot status
    const userMap = new Map(users.map(user => [user.username, user.is_bot]));

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      if (!userStats[result.user_id]) {
        userStats[result.user_id] = {
          user_id: result.user_id,
          is_bot: userMap.get(result.user_id) || false,
          total_predictions: 0,
          correct_predictions: 0
        };
      }
      userStats[result.user_id].total_predictions++;
      if (result.predicted_correctly) {
        userStats[result.user_id].correct_predictions++;
      }
    });

    // Convert to array and calculate accuracy
    const leaderboard = Object.values(userStats)
      .map(user => ({
        ...user,
        accuracy: ((user.correct_predictions / user.total_predictions) * 100).toFixed(2)
      }))
      .sort((a, b) => 
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

// Get all events
app.get('/events', async (req, res) => {
  try {
    console.log('Attempting to fetch events from Supabase...');

    const { data, error } = await supabase
      .from('ufc_full_fight_card')
      .select('Event, EventId, StartTime')
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
        date: event.StartTime
      })))
    ).map(str => JSON.parse(str));

    console.log(`Successfully fetched ${uniqueEvents.length} unique events`);

    // Transform the data to match the expected structure
    const transformedEvents = uniqueEvents.map(event => ({
      id: event.id,
      name: event.name,
      date: event.date,
      is_completed: false // We'll need to add this to the database if needed
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
    const resultsMap = new Map();
    fightResults.forEach(result => {
      resultsMap.set(result.fight_id, {
        winner: result.winner,
        is_completed: result.winner !== null
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

    // Transform the grouped data into the expected structure
    const transformedFights = Array.from(fightMap.entries())
      .filter(([_, fight]) => fight.red && fight.blue) // Only include complete fights
      .map(([fightId, fight]) => {
        const redFighter = transformFighterData(fight.red);
        const blueFighter = transformFighterData(fight.blue);
        const result = resultsMap.get(`${id}-${fightId}`) || { winner: null, is_completed: false };

        // Map card segment names
        let displayCardTier = fight.card_tier;
        if (fight.card_tier === 'Prelims1') {
          displayCardTier = 'Prelims';
        } else if (fight.card_tier === 'Prelims2') {
          displayCardTier = 'Early Prelims';
        }

        return {
          id: fightId,
          event_id: id,
          fighter1_name: redFighter.name,
          fighter1_rank: redFighter.rank,
          fighter1_record: redFighter.record,
          fighter1_odds: redFighter.odds,
          fighter1_style: redFighter.style,
          fighter1_image: redFighter.image,
          fighter2_name: blueFighter.name,
          fighter2_rank: blueFighter.rank,
          fighter2_record: blueFighter.record,
          fighter2_odds: blueFighter.odds,
          fighter2_style: blueFighter.style,
          fighter2_image: blueFighter.image,
          winner: result.winner,
          is_completed: result.is_completed,
          card_tier: displayCardTier,
          weightclass: fight.weightclass,
          bout_order: fight.red.FightOrder // Use FightOrder from the fighter data
        };
      })
      .sort((a, b) => a.bout_order - b.bout_order);

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
    
    // Get all prediction results for this event
    const { data: results, error: resultsError } = await supabase
      .from('prediction_results')
      .select('*')
      .eq('event_id', id);

    if (resultsError) {
      console.error('Error fetching prediction results:', resultsError);
      return res.status(500).json({ 
        error: 'Failed to fetch event leaderboard data',
        details: resultsError.message 
      });
    }

    // Get all users with their is_bot status
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('username, is_bot');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return res.status(500).json({ 
        error: 'Failed to fetch user data',
        details: usersError.message 
      });
    }

    // Create a map of username to is_bot status
    const userMap = new Map(users.map(user => [user.username, user.is_bot]));

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      if (!userStats[result.user_id]) {
        userStats[result.user_id] = {
          user_id: result.user_id,
          is_bot: userMap.get(result.user_id) || false,
          total_predictions: 0,
          correct_predictions: 0
        };
      }
      userStats[result.user_id].total_predictions++;
      if (result.predicted_correctly) {
        userStats[result.user_id].correct_predictions++;
      }
    });

    // Convert to array and calculate accuracy
    const leaderboard = Object.values(userStats)
      .map(user => ({
        ...user,
        accuracy: ((user.correct_predictions / user.total_predictions) * 100).toFixed(2)
      }))
      .sort((a, b) => 
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

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const connectionSuccess = await testSupabaseConnection();
  if (!connectionSuccess) {
    console.error('WARNING: Failed to connect to Supabase on startup');
  }
});