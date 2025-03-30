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

  // Insert the prediction into the predictions table along with username
  const { data, error } = await supabase
    .from('predictions')
    .insert([
      { 
        fight_id: fightId, 
        selected_fighter: selectedFighter,
        username: username 
      }
    ]);

  if (error) {
    console.error(error);
    return res.status(500).json({ message: "Error saving prediction" });
  }

  res.status(200).json({ message: "Prediction received!", data });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});