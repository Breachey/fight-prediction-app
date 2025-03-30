import React, { useState, useEffect } from 'react';

function FightAdmin() {
  const [fights, setFights] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [editingFight, setEditingFight] = useState(null);

  useEffect(() => {
    fetchFights();
  }, []);

  const fetchFights = async () => {
    try {
      const response = await fetch('https://fight-prediction-app-b0vt.onrender.com/fights');
      const data = await response.json();
      setFights(data);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching fights:', err);
      setError('Failed to load fights');
      setIsLoading(false);
    }
  };

  const handleResultUpdate = async (fightId, result) => {
    try {
      const response = await fetch(`https://fight-prediction-app-b0vt.onrender.com/fights/${fightId}/result`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ result }),
      });

      if (!response.ok) {
        throw new Error('Failed to update fight result');
      }

      // Update local state
      setFights(fights.map(fight => 
        fight.id === fightId ? { ...fight, result } : fight
      ));
      setEditingFight(null);
    } catch (err) {
      console.error('Error updating fight result:', err);
      setError('Failed to update fight result');
    }
  };

  const containerStyle = {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto',
    boxSizing: 'border-box'
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

  const buttonContainerStyle = {
    display: 'flex',
    gap: '10px',
    marginTop: '15px'
  };

  const buttonStyle = (isSelected) => ({
    flex: 1,
    padding: '10px',
    borderRadius: '8px',
    backgroundColor: isSelected ? '#3b82f6' : '#2d3748',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  });

  const editButtonStyle = {
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: '#4b5563',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    marginLeft: '10px',
    transition: 'all 0.3s ease'
  };

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    padding: '20px',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    marginBottom: '20px'
  };

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Fight Admin</h1>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>Loading fights...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Fight Admin</h1>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Fight Admin</h1>
      
      {fights.map((fight) => (
        <div key={fight.id} style={fightCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#ffffff' }}>
              {fight.fighter1} vs {fight.fighter2}
            </h3>
            {fight.result && editingFight !== fight.id && (
              <button 
                style={editButtonStyle}
                onClick={() => setEditingFight(fight.id)}
              >
                Edit Result
              </button>
            )}
          </div>
          
          {(editingFight === fight.id || !fight.result) && (
            <div style={buttonContainerStyle}>
              <button
                style={buttonStyle(fight.result === fight.fighter1)}
                onClick={() => handleResultUpdate(fight.id, fight.fighter1)}
              >
                {fight.fighter1} Won
              </button>
              <button
                style={buttonStyle(fight.result === fight.fighter2)}
                onClick={() => handleResultUpdate(fight.id, fight.fighter2)}
              >
                {fight.fighter2} Won
              </button>
            </div>
          )}
          
          {fight.result && editingFight !== fight.id && (
            <div style={{ marginTop: '10px', color: '#9ca3af' }}>
              Winner: {fight.result}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default FightAdmin; 