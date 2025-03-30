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

app.get('/fights', async (req, res) => {
  const { data, error } = await supabase.from('fights').select('*');

  if (error) {
    console.error(error);
    return res.status(500).json({ message: "Error fetching fights" });
  }

  res.json(data);
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
    const { error: updateError } = await supabase
      .from('fights')
      .update({
        winner: winner,
        is_completed: true
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating fight:', updateError);
      return res.status(500).json({ error: 'Failed to update fight' });
    }

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

    res.json({ message: 'Fight result updated successfully' });
  } catch (error) {
    console.error('Error updating fight result:', error);
    res.status(500).json({ error: 'Failed to update fight result' });
  }
});

app.get('/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fight_results')
      .select(`
        user_id,
        total_predictions:count(*),
        correct_predictions:count(case when predicted_correctly = true then 1 end)
      `)
      .groupBy('user_id')
      .order('correct_predictions', { ascending: false });

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }

    // Calculate accuracy for each user
    const leaderboardWithAccuracy = data.map(entry => ({
      ...entry,
      accuracy: ((entry.correct_predictions / entry.total_predictions) * 100).toFixed(2)
    }))
    .sort((a, b) => b.correct_predictions - a.correct_predictions || b.accuracy - a.accuracy)
    .slice(0, 10);

    res.json(leaderboardWithAccuracy);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});