// client/src/Fights.js
import React, { useEffect, useState } from 'react';
import './Fights.css';

function Fights({ eventId }) {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [selectedFights, setSelectedFights] = useState({});

  useEffect(() => {
    if (eventId) {
      fetchFights();
    }
  }, [eventId]);

  const fetchFights = async () => {
    try {
      const response = await fetch(`https://fight-prediction-app-b0vt.onrender.com/events/${eventId}/fights`);
      if (!response.ok) {
        throw new Error('Failed to fetch fights');
      }
      const data = await response.json();
      setFights(data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching fights:', err);
      setError('Failed to load fights');
      setLoading(false);
    }
  };

  const handleVote = async (fightId, selectedFighter) => {
    if (!username.trim()) {
      setError('Please enter your username first');
      return;
    }

    try {
      const response = await fetch('https://fight-prediction-app-b0vt.onrender.com/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          fightId: fightId,
          selectedFighter,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit prediction');
      }

      setSelectedFights(prev => ({
        ...prev,
        [fightId]: selectedFighter
      }));

      localStorage.setItem('username', username);
    } catch (err) {
      console.error('Error submitting prediction:', err);
      setError('Failed to submit prediction');
    }
  };

  if (loading) {
    return <div className="loading-message">Loading fights...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="fights-container">
      <div className="fights-header">
        <h2 className="fights-title">Upcoming Fights</h2>
      </div>

      <div className="username-container">
        <input
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="username-input"
        />
      </div>

      {fights.map((fight) => (
        <div key={fight.id} className="fight-card">
          <div className="fighters-container">
            {/* Fighter 1 Card */}
            <div
              className={`fighter-card ${selectedFights[fight.id] === fight.fighter1_name ? 'selected' : ''} ${
                fight.is_completed ? 'completed' : ''
              } ${fight.is_completed && fight.winner === fight.fighter1_name ? 'winner' : ''}`}
              onClick={() => !fight.is_completed && handleVote(fight.id, fight.fighter1_name)}
            >
              <img src={fight.fighter1_image} alt={fight.fighter1_name} className="fighter-image" />
              <h3 className={`fighter-name ${selectedFights[fight.id] === fight.fighter1_name ? 'selected' : ''}`}>
                {fight.fighter1_name}
              </h3>
              <div className="stat-container">
                <div className="stat-row">
                  <span className="stat-label">Rank</span>
                  <span>{fight.fighter1_rank || 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Record</span>
                  <span>{fight.fighter1_record ? fight.fighter1_record.split('-').join(' - ') : 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Odds</span>
                  <span>{fight.fighter1_odds ? fight.fighter1_odds : 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Style</span>
                  <span>{fight.fighter1_style ? fight.fighter1_style.split(/(?=[A-Z])/).join(' ') : 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="vs-text">VS</div>

            {/* Fighter 2 Card */}
            <div
              className={`fighter-card ${selectedFights[fight.id] === fight.fighter2_name ? 'selected' : ''} ${
                fight.is_completed ? 'completed' : ''
              } ${fight.is_completed && fight.winner === fight.fighter2_name ? 'winner' : ''}`}
              onClick={() => !fight.is_completed && handleVote(fight.id, fight.fighter2_name)}
            >
              <img src={fight.fighter2_image} alt={fight.fighter2_name} className="fighter-image" />
              <h3 className={`fighter-name ${selectedFights[fight.id] === fight.fighter2_name ? 'selected' : ''}`}>
                {fight.fighter2_name}
              </h3>
              <div className="stat-container">
                <div className="stat-row">
                  <span className="stat-label">Rank</span>
                  <span>{fight.fighter2_rank || 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Record</span>
                  <span>{fight.fighter2_record ? fight.fighter2_record.split('-').join(' - ') : 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Odds</span>
                  <span>{fight.fighter2_odds ? fight.fighter2_odds : 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Style</span>
                  <span>{fight.fighter2_style ? fight.fighter2_style.split(/(?=[A-Z])/).join(' ') : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {selectedFights[fight.id] && (
            <div className="selected-fighter-message">
              You picked: {selectedFights[fight.id]}
            </div>
          )}

          {fight.is_completed && (
            <div className="completed-fight-message">
              This fight has been completed. Winner: {fight.winner}
            </div>
          )}
        </div>
      ))}

      {fights.length === 0 && (
        <div className="no-fights-message">
          No upcoming fights available
        </div>
      )}
    </div>
  );
}

export default Fights;