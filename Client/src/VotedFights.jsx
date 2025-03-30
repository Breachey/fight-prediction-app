// client/src/VotedFights.js
import React, { useEffect, useState } from 'react';
import FightVotes from './FightVotes';

function VotedFights({ currentUsername }) {
  const [userPredictions, setUserPredictions] = useState([]);
  const [fights, setFights] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all predictions and filter by current username
  useEffect(() => {
    // Check for null, undefined, or empty username
    if (!currentUsername?.trim()) {
      setIsLoading(false);
      setError('No username provided');
      return;
    }

    setIsLoading(true);
    setError('');

    // Fetch fights first
    Promise.all([
      fetch('https://fight-prediction-app-b0vt.onrender.com/fights')
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch fights');
          }
          return response.json();
        }),
      fetch('https://fight-prediction-app-b0vt.onrender.com/predictions')
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch predictions');
          }
          return response.json();
        })
    ])
      .then(([fightsData, predictionsData]) => {
        setFights(fightsData);
        // Safely filter predictions
        const filtered = predictionsData.filter(
          (pred) => pred.username && 
          currentUsername && 
          pred.username.toLowerCase() === currentUsername.toLowerCase()
        );
        setUserPredictions(filtered);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching data:', err);
        setError(err.message || 'Error fetching data');
        setIsLoading(false);
      });
  }, [currentUsername]);

  if (isLoading) {
    return (
      <div style={{ padding: '20px', borderTop: '1px solid #ccc', marginTop: '40px' }}>
        <h2>Fight Predictions</h2>
        <p>Loading predictions...</p>
      </div>
    );
  }

  if (!currentUsername?.trim()) {
    return (
      <div style={{ padding: '20px', borderTop: '1px solid #ccc', marginTop: '40px' }}>
        <h2>Fight Predictions</h2>
        <p>Please enter a username to view predictions.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', borderTop: '1px solid #ccc', marginTop: '40px' }}>
      <h2>Fight Predictions</h2>
      {error && (
        <p style={{ 
          color: 'red', 
          backgroundColor: '#ffebee', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '15px'
        }}>
          {error}
        </p>
      )}
      
      {!error && userPredictions.length > 0 ? (
        <div>
          {userPredictions.map((prediction) => (
            <FightVotes 
              key={prediction.id} 
              fight={prediction}
              fights={fights}
            />
          ))}
        </div>
      ) : !error ? (
        <p>You haven't voted on any fights yet.</p>
      ) : null}
    </div>
  );
}

export default VotedFights;