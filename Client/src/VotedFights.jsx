// client/src/VotedFights.js
import React, { useEffect, useState } from 'react';
import FightVotes from './FightVotes';
import './FightVotes.css';
import { API_URL } from './config';

function VotedFights() {
  const [predictions, setPredictions] = useState([]);
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
      fetch(`${API_URL}/fights`).then(response => response.json()),
      fetch(`${API_URL}/predictions`).then(response => response.json())
    ])
      .then(([fightsData, predictionsData]) => {
        // Create a map of fights with their predictions
        const fightMap = new Map();
        
        // Initialize the map with all fights
        fightsData.forEach(fight => {
          fightMap.set(fight.id, {
            fight_id: fight.id,
            fight_details: fight,
            username: username
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

  if (!username) {
    return null;
  }

  return (
    <div className="fight-votes-container">
      <h2 className="fight-votes-header">Fight Votes</h2>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="loading-message">
          Loading votes...
        </div>
      ) : predictions.length > 0 ? (
        <div className="swipeable-container">
          {predictions.map((prediction) => (
            <div key={prediction.fight_id} className="swipeable-item">
              <FightVotes fight={prediction} />
            </div>
          ))}
        </div>
      ) : (
        <div className="no-votes">
          No votes found
        </div>
      )}
    </div>
  );
}

export default VotedFights;