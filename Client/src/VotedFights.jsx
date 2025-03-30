// client/src/VotedFights.js
import React, { useEffect, useState } from 'react';

function VotedFights({ currentUsername }) {
  const [userPredictions, setUserPredictions] = useState([]);
  const [voters, setVoters] = useState([]);
  const [selectedPrediction, setSelectedPrediction] = useState(null);
  const [error, setError] = useState('');

  // Fetch all predictions and filter by current username
  useEffect(() => {
    if (!currentUsername) return;
    fetch('https://fight-prediction-app-b0vt.onrender.com/predictions')
      .then(response => response.json())
      .then(data => {
        const filtered = data.filter(
          (pred) => pred.username.toLowerCase() === currentUsername.toLowerCase()
        );
        setUserPredictions(filtered);
      })
      .catch((err) => {
        console.error('Error fetching predictions:', err);
        setError('Error fetching predictions');
      });
  }, [currentUsername]);

  // When a prediction is clicked, fetch all voters for that fight and fighter
  const handlePredictionClick = (prediction) => {
    setSelectedPrediction(prediction);
    fetch(
      `https://fight-prediction-app-b0vt.onrender.com/predictions/filter?fight_id=${prediction.fight_id}&selected_fighter=${encodeURIComponent(
        prediction.selected_fighter
      )}`
    )
      .then((response) => response.json())
      .then((data) => {
        setVoters(data);
      })
      .catch((err) => {
        console.error('Error fetching voters:', err);
        setError('Error fetching voters');
      });
  };

  return (
    <div style={{ padding: '20px', borderTop: '1px solid #ccc', marginTop: '40px' }}>
      <h2>Fights You Voted On</h2>
      {error && <p>{error}</p>}
      {userPredictions.length > 0 ? (
        <ul>
          {userPredictions.map((pred) => (
            <li key={pred.id} style={{ marginBottom: '10px' }}>
              Fight ID: {pred.fight_id} – You voted for: {pred.selected_fighter}{' '}
              <button onClick={() => handlePredictionClick(pred)}>
                View All Voters
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>You haven't voted on any fights yet.</p>
      )}
      {selectedPrediction && voters.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3>
            Voters for {selectedPrediction.selected_fighter} in Fight{' '}
            {selectedPrediction.fight_id}:
          </h3>
          <ul>
            {voters.map((v, index) => (
              <li key={index}>
                {v.username} (voted at {new Date(v.created_at).toLocaleString()})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default VotedFights;