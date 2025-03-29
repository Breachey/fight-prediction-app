// client/src/Fights.js
import React, { useEffect, useState } from 'react';

function Fights() {
  const [fights, setFights] = useState([]);
  const [selectedFighter, setSelectedFighter] = useState(null);
  const [message, setMessage] = useState('');

  // Fetch fight data when component mounts
  useEffect(() => {
    fetch('https://fight-prediction-app-b0vt.onrender.com/fights')
      .then(response => response.json())
      .then(data => setFights(data))
      .catch(error => console.error('Error fetching fights:', error));
  }, []);

  // When user clicks a fighter, update the selection
  const handleSelect = (fighterName) => {
    setSelectedFighter(fighterName);
  };

  // Submit the user's prediction
  const handleSubmit = () => {
    if (fights.length === 0 || !selectedFighter) {
      setMessage('Please select a fighter');
      return;
    }

    // Here we assume one fight (fight[0]) for demonstration.
    const fightId = fights[0].id;

    fetch('https://fight-prediction-app-b0vt.onrender.com/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fightId, selectedFighter })
    })
      .then(response => response.json())
      .then(data => setMessage(data.message))
      .catch(error => {
        console.error('Error submitting prediction:', error);
        setMessage('Error submitting prediction');
      });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Fight Prediction</h1>
      {fights.length > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {/* Fighter 1 Card */}
          <div
            onClick={() => handleSelect(fights[0].fighter1_name)}
            style={{
              border: selectedFighter === fights[0].fighter1_name ? '2px solid blue' : '1px solid gray',
              padding: '10px',
              cursor: 'pointer'
            }}
          >
            <img src={fights[0].fighter1_image} alt={fights[0].fighter1_name} width="100" />
            <h2>{fights[0].fighter1_name}</h2>
            <p>Rank: {fights[0].fighter1_rank}</p>
            <p>Record: {fights[0].fighter1_record}</p>
            <p>Odds: {fights[0].fighter1_odds}</p>
            <p>Style: {fights[0].fighter1_style}</p>
          </div>

          {/* Fighter 2 Card */}
          <div
            onClick={() => handleSelect(fights[0].fighter2_name)}
            style={{
              border: selectedFighter === fights[0].fighter2_name ? '2px solid blue' : '1px solid gray',
              padding: '10px',
              cursor: 'pointer'
            }}
          >
            <img src={fights[0].fighter2_image} alt={fights[0].fighter2_name} width="100" />
            <h2>{fights[0].fighter2_name}</h2>
            <p>Rank: {fights[0].fighter2_rank}</p>
            <p>Record: {fights[0].fighter2_record}</p>
            <p>Odds: {fights[0].fighter2_odds}</p>
            <p>Style: {fights[0].fighter2_style}</p>
          </div>
        </div>
      ) : (
        <p>Loading fights...</p>
      )}
      <button onClick={handleSubmit} style={{ marginTop: '20px' }}>Submit Prediction</button>
      {message && <p>{message}</p>}
    </div>
  );
}

export default Fights;
