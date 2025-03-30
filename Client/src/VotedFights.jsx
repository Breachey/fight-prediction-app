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
        // Safely filter predictions and get unique fights
        const filtered = predictionsData.filter(
          (pred) => pred.username && 
          currentUsername && 
          pred.username.toLowerCase() === currentUsername.toLowerCase()
        );
        
        // Group predictions by fight_id and take the latest prediction for each fight
        const uniquePredictions = Object.values(
          filtered.reduce((acc, pred) => {
            // Only keep the latest prediction for each fight
            if (!acc[pred.fight_id] || new Date(pred.created_at) > new Date(acc[pred.fight_id].created_at)) {
              acc[pred.fight_id] = pred;
            }
            return acc;
          }, {})
        ).sort((a, b) => a.fight_id - b.fight_id); // Sort by fight_id

        setUserPredictions(uniquePredictions);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching data:', err);
        setError(err.message || 'Error fetching data');
        setIsLoading(false);
      });
  }, [currentUsername]);

  const containerStyle = {
    padding: '20px',
    borderTop: '1px solid #2c2c2c',
    marginTop: '40px',
    backgroundColor: '#121212',
    minHeight: '200px'
  };

  const headerStyle = {
    fontSize: '2rem',
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: '20px'
  };

  const messageStyle = {
    textAlign: 'center',
    padding: '20px',
    color: '#9ca3af',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    margin: '20px 0'
  };

  const errorStyle = {
    color: '#ef4444',
    backgroundColor: '#2c2c2c',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '20px',
    textAlign: 'center'
  };

  if (!currentUsername?.trim()) {
    return (
      <div style={containerStyle}>
        <h2 style={headerStyle}>Fight Predictions</h2>
        <p style={messageStyle}>Please enter a username to view predictions.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <h2 style={headerStyle}>Fight Predictions</h2>
        <p style={messageStyle}>Loading predictions...</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2 style={headerStyle}>Fight Predictions</h2>
      
      {error && (
        <p style={errorStyle}>{error}</p>
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
        <p style={messageStyle}>You haven't voted on any fights yet.</p>
      ) : null}
    </div>
  );
}

export default VotedFights;