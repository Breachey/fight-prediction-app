import React, { useEffect, useState } from 'react';

function FightAdmin() {
  const [fights, setFights] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFights();
  }, []);

  const fetchFights = async () => {
    try {
      const response = await fetch('https://fight-prediction-app-b0vt.onrender.com/fights');
      const data = await response.json();
      setFights(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching fights:', error);
      setMessage('Error fetching fights');
      setIsLoading(false);
    }
  };

  const handleSetWinner = async (fightId, winner) => {
    try {
      setIsLoading(true);
      const response = await fetch(`https://fight-prediction-app-b0vt.onrender.com/fights/${fightId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ winner }),
      });

      if (!response.ok) {
        throw new Error('Failed to update fight result');
      }

      setMessage('Fight result updated successfully');
      fetchFights(); // Refresh the fights list
    } catch (error) {
      console.error('Error updating fight result:', error);
      setMessage('Error updating fight result');
    } finally {
      setIsLoading(false);
    }
  };

  const containerStyle = {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto'
  };

  const titleStyle = {
    fontSize: '2rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '30px',
    color: '#ffffff'
  };

  const fightCardStyle = {
    backgroundColor: '#1a1a1a',
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
  };

  const fighterContainerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '20px',
    marginBottom: '20px'
  };

  const fighterStyle = {
    flex: 1,
    textAlign: 'center'
  };

  const buttonContainerStyle = {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center'
  };

  const buttonStyle = (isWinner) => ({
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: isWinner ? '#10b981' : '#3b82f6',
    color: '#ffffff',
    cursor: 'pointer',
    opacity: isLoading ? 0.7 : 1,
    transition: 'all 0.3s ease'
  });

  const completedStyle = {
    backgroundColor: '#374151',
    color: '#9ca3af',
    padding: '10px',
    borderRadius: '8px',
    textAlign: 'center',
    marginTop: '10px'
  };

  const messageStyle = {
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: message.includes('Error') ? '#fee2e2' : '#dcfce7',
    color: message.includes('Error') ? '#ef4444' : '#10b981',
    marginBottom: '20px',
    textAlign: 'center'
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Fight Results Admin</h1>

      {message && (
        <div style={messageStyle}>
          {message}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
          Loading fights...
        </div>
      ) : (
        fights.map((fight) => (
          <div key={fight.id} style={fightCardStyle}>
            <div style={fighterContainerStyle}>
              <div style={fighterStyle}>
                <img 
                  src={fight.fighter1_image} 
                  alt={fight.fighter1_name} 
                  style={{ width: '100px', height: '100px', borderRadius: '50%', marginBottom: '10px' }} 
                />
                <h3 style={{ color: '#ffffff', marginBottom: '5px' }}>{fight.fighter1_name}</h3>
              </div>
              <div style={{ alignSelf: 'center', color: '#9ca3af', fontSize: '1.5rem' }}>
                VS
              </div>
              <div style={fighterStyle}>
                <img 
                  src={fight.fighter2_image} 
                  alt={fight.fighter2_name} 
                  style={{ width: '100px', height: '100px', borderRadius: '50%', marginBottom: '10px' }} 
                />
                <h3 style={{ color: '#ffffff', marginBottom: '5px' }}>{fight.fighter2_name}</h3>
              </div>
            </div>

            {fight.is_completed ? (
              <div style={completedStyle}>
                Winner: {fight.winner}
              </div>
            ) : (
              <div style={buttonContainerStyle}>
                <button
                  onClick={() => handleSetWinner(fight.id, fight.fighter1_name)}
                  style={buttonStyle(fight.winner === fight.fighter1_name)}
                  disabled={isLoading}
                >
                  {fight.fighter1_name} Won
                </button>
                <button
                  onClick={() => handleSetWinner(fight.id, fight.fighter2_name)}
                  style={buttonStyle(fight.winner === fight.fighter2_name)}
                  disabled={isLoading}
                >
                  {fight.fighter2_name} Won
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default FightAdmin; 