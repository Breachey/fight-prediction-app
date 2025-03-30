// client/src/Fights.js
import React, { useEffect, useState } from 'react';

function Fights({ currentUsername, setCurrentUsername }) {
  const [fights, setFights] = useState([]);
  const [currentFightIndex, setCurrentFightIndex] = useState(0);
  const [selectedFighter, setSelectedFighter] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch fight data when component mounts
  useEffect(() => {
    fetch('https://fight-prediction-app-b0vt.onrender.com/fights')
      .then(response => response.json())
      .then(data => setFights(data))
      .catch(error => console.error('Error fetching fights:', error));
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
    const fightId = parseInt(fights[currentFightIndex].id, 10);

    if (isNaN(fightId)) {
      setMessage('Invalid fight data');
      setIsLoading(false);
      return;
    }

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
          return response.json().then(data => {
            throw new Error(data.error || 'Failed to save prediction');
          });
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
      })
      .catch(error => {
        console.error('Error submitting prediction:', error);
        setMessage(`Error saving prediction: ${error.message}`);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  // Get the current fight data
  const currentFight = fights[currentFightIndex];

  const containerStyle = {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto'
  };

  const titleStyle = {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '40px',
    color: '#ffffff'
  };

  const fightersContainerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '20px',
    marginBottom: '30px'
  };

  const fighterCardStyle = (isSelected) => ({
    flex: 1,
    padding: '20px',
    borderRadius: '16px',
    backgroundColor: '#1a1a1a',
    border: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
    boxShadow: isSelected ? '0 8px 16px rgba(59, 130, 246, 0.2)' : '0 4px 6px rgba(0, 0, 0, 0.1)'
  });

  const imageStyle = {
    width: '100%',
    height: 'auto',
    borderRadius: '8px',
    marginBottom: '15px'
  };

  const fighterNameStyle = {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '10px',
    color: '#ffffff',
    textAlign: 'center'
  };

  const statStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #2c2c2c',
    flexWrap: 'wrap',
    gap: '4px'
  };

  const statLabelStyle = {
    minWidth: '60px'
  };

  const usernameContainerStyle = {
    marginBottom: '30px'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: '#2c2c2c',
    border: '1px solid #3b3b3b',
    color: '#ffffff',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.3s ease',
    marginTop: '8px'
  };

  const buttonStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    opacity: isLoading ? 0.7 : 1,
    transition: 'all 0.3s ease',
    marginTop: '20px'
  };

  const messageStyle = (isError) => ({
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: isError ? '#fee2e2' : '#dcfce7',
    color: isError ? '#ef4444' : '#10b981',
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '0.9rem'
  });

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Fight Prediction</h1>
      {fights.length > 0 && currentFight ? (
        <>
          <div style={fightersContainerStyle}>
            {/* Fighter 1 Card */}
            <div
              onClick={() => handleSelect(currentFight.fighter1_name)}
              style={fighterCardStyle(selectedFighter === currentFight.fighter1_name)}
            >
              <img src={currentFight.fighter1_image} alt={currentFight.fighter1_name} style={imageStyle} />
              <h2 style={fighterNameStyle}>{currentFight.fighter1_name}</h2>
              <div style={statStyle}>
                <span style={statLabelStyle}>Rank</span>
                <span>{currentFight.fighter1_rank || 'N/A'}</span>
              </div>
              <div style={statStyle}>
                <span style={statLabelStyle}>Record</span>
                <span>{currentFight.fighter1_record}</span>
              </div>
              <div style={statStyle}>
                <span style={statLabelStyle}>Odds</span>
                <span>{currentFight.fighter1_odds}</span>
              </div>
              <div style={statStyle}>
                <span style={statLabelStyle}>Style</span>
                <span>{currentFight.fighter1_style}</span>
              </div>
            </div>

            {/* Fighter 2 Card */}
            <div
              onClick={() => handleSelect(currentFight.fighter2_name)}
              style={fighterCardStyle(selectedFighter === currentFight.fighter2_name)}
            >
              <img src={currentFight.fighter2_image} alt={currentFight.fighter2_name} style={imageStyle} />
              <h2 style={fighterNameStyle}>{currentFight.fighter2_name}</h2>
              <div style={statStyle}>
                <span style={statLabelStyle}>Rank</span>
                <span>{currentFight.fighter2_rank || 'N/A'}</span>
              </div>
              <div style={statStyle}>
                <span style={statLabelStyle}>Record</span>
                <span>{currentFight.fighter2_record}</span>
              </div>
              <div style={statStyle}>
                <span style={statLabelStyle}>Odds</span>
                <span>{currentFight.fighter2_odds}</span>
              </div>
              <div style={statStyle}>
                <span style={statLabelStyle}>Style</span>
                <span>{currentFight.fighter2_style}</span>
              </div>
            </div>
          </div>

          <div style={usernameContainerStyle}>
            <label style={{ color: '#ffffff' }}>
              Username
              <input
                type="text"
                value={currentUsername}
                onChange={(e) => setCurrentUsername(e.target.value)}
                placeholder="Enter your username"
                style={inputStyle}
              />
            </label>
          </div>

          <button 
            onClick={handleSubmit} 
            style={buttonStyle}
            disabled={isLoading}
          >
            {isLoading ? 'Submitting...' : 'Submit Prediction'}
          </button>

          {message && (
            <div style={messageStyle(message.includes('Error'))}>
              {message}
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
          Loading fights or no more fights available...
        </div>
      )}
    </div>
  );
}

export default Fights;