// client/src/VotedFights.js
import React, { useEffect, useState } from 'react';
import FightVotes from './FightVotes';

function VotedFights() {
  const [predictions, setPredictions] = useState([]);
  const [fights, setFights] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState(localStorage.getItem('currentUsername') || '');

  // Update username when localStorage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const newUsername = localStorage.getItem('currentUsername');
      setUsername(newUsername || '');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    if (!username) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    Promise.all([
      fetch('https://fight-prediction-app-b0vt.onrender.com/fights').then(response => response.json()),
      fetch('https://fight-prediction-app-b0vt.onrender.com/predictions').then(response => response.json())
    ])
      .then(([fightsData, predictionsData]) => {
        setFights(fightsData);
        
        // Create a map of fights with their predictions
        const fightMap = new Map();
        
        // Initialize the map with all fights
        fightsData.forEach(fight => {
          fightMap.set(fight.id, {
            fight_id: fight.id,
            fight_details: fight,
            username: username // Add current username to help highlight user's votes
          });
        });
        
        // Add predictions to the corresponding fights
        predictionsData.forEach(prediction => {
          const fightId = prediction.fight_id;
          if (!fightMap.has(fightId)) {
            const fightDetails = fightsData.find(f => f.id === fightId);
            if (fightDetails) {
              fightMap.set(fightId, {
                fight_id: fightId,
                fight_details: fightDetails,
                username: username
              });
            }
          }
        });
        
        // Convert map values to array and sort by fight_id
        const allFights = Array.from(fightMap.values())
          .sort((a, b) => a.fight_id - b.fight_id);
        
        setPredictions(allFights);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error fetching data:', err);
        setError('Error fetching predictions');
        setIsLoading(false);
      });
  }, [username]);

  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px'
  };

  const headerStyle = {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '30px',
    color: '#ffffff',
    textAlign: 'center'
  };

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    padding: '20px',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    marginBottom: '20px'
  };

  if (!username) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>
          Please set your username to view predictions
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2 style={headerStyle}>Past Predictions</h2>
      
      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          Loading predictions...
        </div>
      ) : predictions.length > 0 ? (
        <div>
          {predictions.map((prediction) => (
            <FightVotes
              key={prediction.fight_id}
              fight={prediction}
            />
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
          No fights found
        </div>
      )}
    </div>
  );
}

export default VotedFights;