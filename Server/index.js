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

/* const fights = [
    {
      id: 1,
      fighter1: {
        name: "John Doe",
        rank: 1,
        record: "12-1",
        odds: "+140",
        style: "Striker",
        image: "https://via.placeholder.com/100x100"
      },
      fighter2: {
        name: "David Smith",
        rank: 2,
        record: "10-2",
        odds: "-160",
        style: "Grappler",
        image: "https://via.placeholder.com/100x100"
      }
    }
  ]; */

  app.get('/fights', (req, res) => {
    res.json(fights);
  });

 /* app.post('/predict', (req, res) => {
    const { fightId, selectedFighter } = req.body;
  
    if (!fightId || !selectedFighter) {
      return res.status(400).json({ message: "Missing data" });
    }
  
    console.log(`User selected ${selectedFighter} for fight #${fightId}`);
    
    res.status(200).json({ message: "Prediction received!" });
  });
  */

  app.post('/predict', async (req, res) => {
    const { fightId, selectedFighter } = req.body;
  
    if (!fightId || !selectedFighter) {
      return res.status(400).json({ message: "Missing data" });
    }
  
    // Insert the prediction into the predictions table
    const { data, error } = await supabase
      .from('predictions')
      .insert([
        { fight_id: fightId, selected_fighter: selectedFighter }
      ]);
  
    if (error) {
      console.error(error);
      return res.status(500).json({ message: "Error saving prediction" });
    }
  
    res.status(200).json({ message: "Prediction received!", data });
  });

app.get('/', (req, res) => {
  res.send('API is running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });