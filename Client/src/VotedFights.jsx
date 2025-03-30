// client/src/VotedFights.js
import React, { useEffect, useState } from 'react';
import FightVotes from './FightVotes';

function VotedFights({ currentUsername }) {
  const [userPredictions, setUserPredictions] = useState([]);
  const [fights, setFights] = useState([]);
  const [error, setError] = useState('');

  // Fetch all predictions and filter by current username
  useEffect(() => {
    if (!currentUsername) return;

    // Fetch fights first
    fetch('https://fight-prediction-app-b0vt.onrender.com/fights')
      .then(response => response.json())
      .then(data => {
        setFights(data);
      })
      .catch(err => {
        console.error('Error fetching fights:', err);
        setError('Error fetching fights');
      });

    // Then fetch predictions
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

  return (
    <div style={{ padding: '20px', borderTop: '1px solid #ccc', marginTop: '40px' }}>
      <h2>Fight Predictions</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      {userPredictions.length > 0 ? (
        <div>
          {userPredictions.map((prediction) => (
            <FightVotes 
              key={prediction.id} 
              fight={prediction}
              fights={fights}
            />
          ))}
        </div>
      ) : (
        <p>You haven't voted on any fights yet.</p>
      )}
    </div>
  );
}

export default VotedFights;