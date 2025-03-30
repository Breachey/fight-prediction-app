// client/src/Fights.js
import React, { useEffect, useState } from 'react';

function Fights({ currentUsername, setCurrentUsername }) {
  const [fights, setFights] = useState([]);
  const [currentFightIndex, setCurrentFightIndex] = useState(0);
  const [selectedFighter, setSelectedFighter] = useState(null);
  const [message, setMessage] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch fight data when component mounts
  useEffect(() => {
    fetch('https://fight-prediction-app-b0vt.onrender.com/fights')
      .then(response => response.json())
      .then(data => setFights(data))
      .catch(error => console.error('Error fetching fights:', error));
  }, []);

  // Fetch predictions when component mounts and after submission
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

  // Submit the user's prediction along with username, then advance to next fight
  const handleSubmit = () => {
    if (fights.length === 0 || !selectedFighter || !currentUsername) {
      setMessage('Please select a fighter and enter your username');
      return;
    }

    setIsLoading(true);
    const fightId = fights[currentFightIndex].id;

    fetch('https://fight-prediction-app-b0vt.onrender.com/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fightId, 
        selectedFighter, 
        username: currentUsername 
      })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to save prediction');
        }
        return response.json();
      })
      .then(data => {
        setMessage(data.message);

        // After successful submission, go to the next fight if available
        if (currentFightIndex < fights.length - 1) {
          setCurrentFightIndex(currentFightIndex + 1);
          setSelectedFighter(null); // Clear selection for next fight
        } else {
          setMessage('All fights completed!');
        }
        // Optionally, re-fetch predictions
        fetchPredictions();
      })
      .catch(error => {
        console.error('Error submitting prediction:', error);
        setMessage('Error saving prediction');
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  // Get the current fight data
  const currentFight = fights[currentFightIndex];

  return (
    <div style={{ padding: '20px' }}>
      <h1>Fight Prediction</h1>
      {fights.length > 0 && currentFight ? (
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {/* Fighter 1 Card */}
          <div
            onClick={() => handleSelect(currentFight.fighter1_name)}
            style={{
              border: selectedFighter === currentFight.fighter1_name ? '2px solid blue' : '1px solid gray',
              padding: '10px',
              cursor: 'pointer'
            }}
          >
            <img src={currentFight.fighter1_image} alt={currentFight.fighter1_name} width="100" />
            <h2>{currentFight.fighter1_name}</h2>
            <p>Rank: {currentFight.fighter1_rank}</p>
            <p>Record: {currentFight.fighter1_record}</p>
            <p>Odds: {currentFight.fighter1_odds}</p>
            <p>Style: {currentFight.fighter1_style}</p>
          </div>

          {/* Fighter 2 Card */}
          <div
            onClick={() => handleSelect(currentFight.fighter2_name)}
            style={{
              border: selectedFighter === currentFight.fighter2_name ? '2px solid blue' : '1px solid gray',
              padding: '10px',
              cursor: 'pointer'
            }}
          >
            <img src={currentFight.fighter2_image} alt={currentFight.fighter2_name} width="100" />
            <h2>{currentFight.fighter2_name}</h2>
            <p>Rank: {currentFight.fighter2_rank}</p>
            <p>Record: {currentFight.fighter2_record}</p>
            <p>Odds: {currentFight.fighter2_odds}</p>
            <p>Style: {currentFight.fighter2_style}</p>
          </div>
        </div>
      ) : (
        <p>Loading fights or no more fights available...</p>
      )}

      {/* Username Input Field */}
      <div style={{ margin: '20px 0' }}>
        <label>
          Username:
          <input
            type="text"
            value={currentUsername}
            onChange={(e) => setCurrentUsername(e.target.value)}
            placeholder="Enter your username"
            style={{ marginLeft: '5px' }}
          />
        </label>
      </div>

      <button 
        onClick={handleSubmit} 
        style={{ 
          marginTop: '20px',
          opacity: isLoading ? 0.7 : 1,
          cursor: isLoading ? 'not-allowed' : 'pointer'
        }}
        disabled={isLoading}
      >
        {isLoading ? 'Submitting...' : 'Submit Prediction'}
      </button>
      {message && <p style={{ color: message.includes('Error') ? '#ef4444' : '#10b981' }}>{message}</p>}

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