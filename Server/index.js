const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://rnixnohdeayspegtrfds.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaXhub2hkZWF5c3BlZ3RyZmRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMyODE3NzksImV4cCI6MjA1ODg1Nzc3OX0.quxIKY4BIWXAxSXVUSP353-sR_NBTCcrVZ8Fuj6hmiE'
);

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

app.get('/fights', async (req, res) => {
  try {
    // Get the latest event
    const { data: latestEvent, error: eventError } = await supabase
      .from('events')
      .select('id')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (eventError) {
      console.error('Error fetching latest event:', eventError);
      return res.status(500).json({ error: 'Failed to fetch latest event' });
    }

    // Get fights for the latest event
    const { data: fights, error: fightsError } = await supabase
      .from('fights')
      .select('*')
      .eq('event_id', latestEvent.id)
      .order('id');

    if (fightsError) {
      console.error('Error fetching fights:', fightsError);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    res.json(fights);
  } catch (error) {
    console.error('Error in GET /fights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/predict', async (req, res) => {
  const { fightId, selectedFighter, username } = req.body;

  if (!fightId || !selectedFighter || !username) {
    return res.status(400).json({ message: "Missing data" });
  }

  try {
    // Convert fightId to integer
    const fight_id = parseInt(fightId, 10);
    if (isNaN(fight_id)) {
      return res.status(400).json({ message: "Invalid fight ID" });
    }

    // Insert the prediction into the predictions table along with username
    const { data, error } = await supabase
      .from('predictions')
      .insert([
        { 
          fight_id, 
          selected_fighter: selectedFighter,
          username: username 
        }
      ]);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ message: "Error saving prediction", error: error.message });
    }

    res.status(200).json({ message: "Prediction received!", data });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ message: "Error saving prediction", error: err.message });
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
    return res.status(400).json({ message: "Missing query parameters" });
  }
  
  const { data, error } = await supabase
    .from('predictions')
    .select('username, created_at')
    .eq('fight_id', fight_id)
    .eq('selected_fighter', selected_fighter);
  
  if (error) {
    console.error(error);
    return res.status(500).json({ message: "Error fetching predictions" });
  }
  
  res.json(data);
});

app.get('/', (req, res) => {
  res.send('API is running');
});

app.post('/fights/:id/result', async (req, res) => {
  try {
    const { id } = req.params;
    const { winner } = req.body;
    
    // Update fight with winner and mark as completed
    // If winner is null, we're unsetting the result
    const { error: updateError } = await supabase
      .from('fights')
      .update({
        winner: winner,
        is_completed: winner !== null
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating fight:', updateError);
      return res.status(500).json({ error: 'Failed to update fight' });
    }

    // If we're unsetting the result, delete any existing fight results
    if (winner === null) {
      const { error: deleteError } = await supabase
        .from('fight_results')
        .delete()
        .eq('fight_id', id);

      if (deleteError) {
        console.error('Error deleting fight results:', deleteError);
        return res.status(500).json({ error: 'Failed to delete fight results' });
      }
    } else {
      // Get all predictions for this fight
      const { data: predictions, error: predictionsError } = await supabase
        .from('predictions')
        .select('username, selected_fighter')
        .eq('fight_id', id);

      if (predictionsError) {
        console.error('Error fetching predictions:', predictionsError);
        return res.status(500).json({ error: 'Failed to fetch predictions' });
      }

      // Update fight_results for each prediction
      for (const prediction of predictions) {
        const predicted_correctly = prediction.selected_fighter === winner;
        
        const { error: resultError } = await supabase
          .from('fight_results')
          .upsert([
            {
              user_id: prediction.username,
              fight_id: id,
              predicted_correctly: predicted_correctly
            }
          ], {
            onConflict: ['user_id', 'fight_id']
          });

        if (resultError) {
          console.error('Error updating fight result:', resultError);
          return res.status(500).json({ error: 'Failed to update fight result' });
        }
      }
    }

    // Get the updated fight data
    const { data: updatedFight, error: getFightError } = await supabase
      .from('fights')
      .select('*')
      .eq('id', id)
      .single();

    if (getFightError) {
      console.error('Error fetching updated fight:', getFightError);
      return res.status(500).json({ error: 'Failed to fetch updated fight' });
    }

    res.json(updatedFight);
  } catch (error) {
    console.error('Error updating fight result:', error);
    res.status(500).json({ error: 'Failed to update fight result' });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    // First get all fight results
    const { data: results, error: resultsError } = await supabase
      .from('fight_results')
      .select('*');

    if (resultsError) {
      console.error('Error fetching fight results:', resultsError);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      if (!userStats[result.user_id]) {
        userStats[result.user_id] = {
          user_id: result.user_id,
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
      )
      .slice(0, 10);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing leaderboard:', error);
    res.status(500).json({ error: 'Failed to process leaderboard' });
  }
});

// Get all events
app.get('/events', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching events:', error);
      return res.status(500).json({ error: 'Failed to fetch events' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in GET /events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get fights for a specific event
app.get('/events/:id/fights', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('fights')
      .select('*')
      .eq('event_id', id)
      .order('id');

    if (error) {
      console.error('Error fetching fights for event:', error);
      return res.status(500).json({ error: 'Failed to fetch fights' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error in GET /events/:id/fights:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get event leaderboard
app.get('/events/:id/leaderboard', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get all fights for this event
    const { data: eventFights, error: fightsError } = await supabase
      .from('fights')
      .select('id')
      .eq('event_id', id);

    if (fightsError) {
      console.error('Error fetching event fights:', fightsError);
      return res.status(500).json({ error: 'Failed to fetch event fights' });
    }

    const fightIds = eventFights.map(fight => fight.id);

    // Get all fight results for these fights
    const { data: results, error: resultsError } = await supabase
      .from('fight_results')
      .select('*')
      .in('fight_id', fightIds);

    if (resultsError) {
      console.error('Error fetching fight results:', resultsError);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    // Process the results to create the leaderboard
    const userStats = {};
    results.forEach(result => {
      if (!userStats[result.user_id]) {
        userStats[result.user_id] = {
          user_id: result.user_id,
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
      )
      .slice(0, 10);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error processing event leaderboard:', error);
    res.status(500).json({ error: 'Failed to process leaderboard' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});