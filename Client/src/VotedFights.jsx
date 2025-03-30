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

  const containerStyle = {
    width: '100%',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px',
    boxSizing: 'border-box'
  };

  const headerStyle = {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '30px',
    color: '#ffffff',
    textAlign: 'center'
  };

  const scrollContainerStyle = {
    display: 'flex',
    overflowX: 'auto',
    gap: '20px',
    padding: '20px 0',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    msOverflowStyle: 'none',
    scrollbarWidth: 'none',
    margin: '0 -20px',
    padding: '0 20px',
    '::-webkit-scrollbar': {
      display: 'none'
    }
  };

  const fightCardStyle = {
    flex: '0 0 calc(100% - 40px)',
    scrollSnapAlign: 'start',
    backgroundColor: '#1a1a1a',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    minWidth: 'calc(100% - 40px)',
    maxWidth: 'calc(100% - 40px)',
    boxSizing: 'border-box'
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
    return null;
  }

  return (
    <div style={containerStyle}>
      <h2 style={headerStyle}>Fight Votes</h2>
      
      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
          Loading votes...
        </div>
      ) : predictions.length > 0 ? (
        <div style={scrollContainerStyle}>
          {predictions.map((prediction) => (
            <div key={prediction.fight_id} style={fightCardStyle}>
              <FightVotes fight={prediction} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
          No votes found
        </div>
      )}
    </div>
  );
}

export default VotedFights;