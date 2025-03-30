// client/src/Fights.js
import React, { useEffect, useState } from 'react';

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
      const response = await fetch('https://fight-prediction-app-b0vt.onrender.com/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          fight_id: fightId,
          predicted_winner: selectedFighter,
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

  const containerStyle = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px'
  };

  const headerStyle = {
    marginBottom: '24px'
  };

  const titleStyle = {
    fontSize: '1.8rem',
    fontWeight: '600',
    marginBottom: '16px',
    background: 'linear-gradient(to right, #e9d5ff, #ffffff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  };

  const usernameContainerStyle = {
    marginBottom: '24px',
    background: 'linear-gradient(145deg, #1a1a1a 0%, #2d1f47 100%)',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid #4c1d95'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#0f0f0f',
    color: '#ffffff',
    border: '1px solid #6d28d9',
    borderRadius: '8px',
    fontSize: '1rem',
    outline: 'none',
    transition: 'all 0.3s ease',
    ':focus': {
      borderColor: '#8b5cf6',
      boxShadow: '0 0 0 2px rgba(139, 92, 246, 0.2)'
    }
  };

  const fightCardStyle = {
    background: 'linear-gradient(145deg, #1a1a1a 0%, #2d1f47 100%)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
    border: '1px solid #4c1d95',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
    transition: 'transform 0.3s ease',
    ':hover': {
      transform: 'translateY(-2px)'
    }
  };

  const fightersContainerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '20px',
    marginBottom: '16px'
  };

  const fighterCardStyle = (isSelected) => ({
    flex: 1,
    padding: '20px',
    borderRadius: '12px',
    backgroundColor: isSelected ? '#4c1d95' : '#1a1a1a',
    border: `1px solid ${isSelected ? '#8b5cf6' : '#4c1d95'}`,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    color: isSelected ? '#ffffff' : '#e9d5ff',
    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
    boxShadow: isSelected ? '0 8px 16px rgba(139, 92, 246, 0.2)' : 'none',
    ':hover': {
      backgroundColor: isSelected ? '#4c1d95' : '#2d1f47',
      transform: 'scale(1.02)'
    }
  });

  const imageStyle = {
    width: '100%',
    height: 'auto',
    borderRadius: '8px',
    marginBottom: '15px',
    border: '1px solid #4c1d95'
  };

  const fighterNameStyle = {
    fontSize: '1.5rem',
    fontWeight: '600',
    marginBottom: '16px',
    textAlign: 'center',
    background: isSelected => isSelected ? '#ffffff' : 'linear-gradient(to right, #e9d5ff, #ffffff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  };

  const statContainerStyle = {
    background: 'rgba(76, 29, 149, 0.1)',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '16px'
  };

  const statStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #2d1f47'
  };

  const statLabelStyle = {
    color: '#8b5cf6',
    fontWeight: '500'
  };

  const vsStyle = {
    alignSelf: 'center',
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#8b5cf6',
    padding: '0 10px'
  };

  const errorStyle = {
    color: '#ef4444',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    textAlign: 'center'
  };

  const loadingStyle = {
    textAlign: 'center',
    color: '#9ca3af',
    padding: '20px'
  };

  if (loading) {
    return <div style={loadingStyle}>Loading fights...</div>;
  }

  if (error) {
    return <div style={errorStyle}>{error}</div>;
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Upcoming Fights</h2>
      </div>

      <div style={usernameContainerStyle}>
        <input
          type="text"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
        />
      </div>

      {fights.map((fight) => (
        <div key={fight.id} style={fightCardStyle}>
          <div style={fightersContainerStyle}>
            {/* Fighter 1 Card */}
            <div
              style={fighterCardStyle(selectedFights[fight.id] === fight.fighter1_name)}
              onClick={() => handleVote(fight.id, fight.fighter1_name)}
            >
              <img src={fight.fighter1_image} alt={fight.fighter1_name} style={imageStyle} />
              <h3 style={fighterNameStyle(selectedFights[fight.id] === fight.fighter1_name)}>
                {fight.fighter1_name}
              </h3>
              <div style={statContainerStyle}>
                <div style={statStyle}>
                  <span style={statLabelStyle}>Rank</span>
                  <span>{fight.fighter1_rank || 'N/A'}</span>
                </div>
                <div style={statStyle}>
                  <span style={statLabelStyle}>Record</span>
                  <span>{fight.fighter1_record}</span>
                </div>
                <div style={statStyle}>
                  <span style={statLabelStyle}>Odds</span>
                  <span>{fight.fighter1_odds}</span>
                </div>
                <div style={statStyle}>
                  <span style={statLabelStyle}>Style</span>
                  <span>{fight.fighter1_style}</span>
                </div>
              </div>
            </div>

            <div style={vsStyle}>VS</div>

            {/* Fighter 2 Card */}
            <div
              style={fighterCardStyle(selectedFights[fight.id] === fight.fighter2_name)}
              onClick={() => handleVote(fight.id, fight.fighter2_name)}
            >
              <img src={fight.fighter2_image} alt={fight.fighter2_name} style={imageStyle} />
              <h3 style={fighterNameStyle(selectedFights[fight.id] === fight.fighter2_name)}>
                {fight.fighter2_name}
              </h3>
              <div style={statContainerStyle}>
                <div style={statStyle}>
                  <span style={statLabelStyle}>Rank</span>
                  <span>{fight.fighter2_rank || 'N/A'}</span>
                </div>
                <div style={statStyle}>
                  <span style={statLabelStyle}>Record</span>
                  <span>{fight.fighter2_record}</span>
                </div>
                <div style={statStyle}>
                  <span style={statLabelStyle}>Odds</span>
                  <span>{fight.fighter2_odds}</span>
                </div>
                <div style={statStyle}>
                  <span style={statLabelStyle}>Style</span>
                  <span>{fight.fighter2_style}</span>
                </div>
              </div>
            </div>
          </div>

          {selectedFights[fight.id] && (
            <div style={{ 
              textAlign: 'center', 
              color: '#8b5cf6', 
              marginTop: '16px',
              padding: '12px',
              background: 'rgba(139, 92, 246, 0.1)',
              borderRadius: '8px',
              fontWeight: '500'
            }}>
              You picked: {selectedFights[fight.id]}
            </div>
          )}

          {fight.is_completed && (
            <div style={{
              textAlign: 'center',
              color: '#9ca3af',
              marginTop: '16px',
              padding: '12px',
              background: 'rgba(76, 29, 149, 0.1)',
              borderRadius: '8px',
              border: '1px solid #4c1d95'
            }}>
              This fight has been completed. Winner: {fight.winner}
            </div>
          )}
        </div>
      ))}

      {fights.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px' }}>
          No upcoming fights available
        </div>
      )}
    </div>
  );
}

export default Fights;