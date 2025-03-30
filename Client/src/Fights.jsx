// client/src/Fights.jsx
import React, { useEffect, useState } from 'react';

function Fights() {
  const [fights, setFights] = useState([]);
  const [selectedFighter, setSelectedFighter] = useState(null);
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [predictions, setPredictions] = useState([]);

  // Fetch fight data when component mounts
  useEffect(() => {
    fetch('https://fight-prediction-app-b0vt.onrender.com/fights')
      .then(response => response.json())
      .then(data => setFights(data))
      .catch(error => console.error('Error fetching fights:', error));
  }, []);

  // Fetch predictions when component mounts and after each submission
  const fetchPredictions = () => {
    fetch('https://fight-prediction-app-b0vt.onrender.com/predictions')
      .then(response => response.json())
      .then(data => setPredictions(data))
      .catch(error => console.error('Error fetching predictions:', error));
  };

  useEffect(() => {
    fetchPredictions();
  }, []);

  // When user clicks a fighter, update the selection
  const handleSelect = (fighterName) => {
    setSelectedFighter(fighterName);
  };

  // Submit the user's prediction along with username
  const handleSubmit = () => {
    if (fights.length === 0 || !selectedFighter || !username) {
      setMessage('Please select a fighter and enter your username');
      return;
    }

    // Assuming one fight (fights[0]) for demonstration.
    const fightId = fights[0].id;

    fetch('https://fight-prediction-app-b0vt.onrender.com/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fightId, selectedFighter, username })
    })
      .then(response => response.json())
      .then(data => {
        setMessage(data.message);
        // Re-fetch predictions after successful submission
        fetchPredictions();
      })
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

      {/* Username Input Field */}
      <div style={{ margin: '20px 0' }}>
        <label>
          Username: 
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            placeholder="Enter your username" 
            style={{ marginLeft: '5px' }}
          />
        </label>
      </div>

      <button onClick={handleSubmit} style={{ marginTop: '20px' }}>Submit Prediction</button>
      {message && <p>{message}</p>}

      {/* Display Predictions */}
      <div style={{ marginTop: '40px' }}>
        <h2>Past Predictions</h2>
        {predictions.length > 0 ? (
          <ul>
            {predictions.map((prediction) => (
              <li key={prediction.id}>
                {prediction.username} predicted {prediction.selected_fighter} for fight {prediction.fight_id} on {new Date(prediction.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        ) : (
          <p>No predictions yet.</p>
        )}
      </div>
    </div>
  );
}

export default Fights;
