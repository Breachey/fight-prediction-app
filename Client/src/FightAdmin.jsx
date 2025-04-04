import React, { useState, useEffect } from 'react';
import { API_URL } from './config';

function FightAdmin({ eventId }) {
  const [fights, setFights] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [editingFight, setEditingFight] = useState(null);

  useEffect(() => {
    if (eventId) {
      fetchFights();
    }
  }, [eventId]);

  const fetchFights = async () => {
    try {
      const response = await fetch(`${API_URL}/events/${eventId}/fights`);
      if (!response.ok) {
        throw new Error('Failed to fetch fights');
      }
      const data = await response.json();
      setFights(data);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching fights:', err);
      setError('Failed to load fights');
      setIsLoading(false);
    }
  };

  const handleResultUpdate = async (fightId, winner) => {
    try {
      const response = await fetch(`${API_URL}/ufc_fight_card/${fightId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ winner }),
      });

      if (!response.ok) {
        throw new Error('Failed to update fight result');
      }

      const updatedFight = await response.json();
      
      // Update local state with the complete updated fight data
      setFights(fights.map(fight => 
        fight.id === fightId ? updatedFight : fight
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

  const unselectButtonStyle = {
    ...editButtonStyle,
    backgroundColor: '#dc2626',
    marginLeft: '0',
    marginTop: '10px',
    width: '100%'
  };

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    padding: '20px',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    marginBottom: '20px'
  };

  const fighterInfoStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: '#9ca3af',
    fontSize: '0.9rem'
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
            <div>
              <h3 style={{ margin: '0 0 10px 0', color: '#ffffff' }}>
                {fight.fighter1_name} vs {fight.fighter2_name}
              </h3>
              <div style={fighterInfoStyle}>
                <span>Rank: #{fight.fighter1_rank || 'N/A'} vs #{fight.fighter2_rank || 'N/A'}</span>
                <span>•</span>
                <span>Record: {fight.fighter1_record} vs {fight.fighter2_record}</span>
              </div>
            </div>
            {fight.winner && editingFight !== fight.id && (
              <button 
                style={editButtonStyle}
                onClick={() => setEditingFight(fight.id)}
              >
                Edit Result
              </button>
            )}
          </div>
          
          {(editingFight === fight.id || !fight.winner) && (
            <>
              <div style={buttonContainerStyle}>
                <button
                  style={buttonStyle(fight.winner === fight.fighter1_name)}
                  onClick={() => handleResultUpdate(fight.id, fight.fighter1_name)}
                >
                  {fight.fighter1_name} Won
                </button>
                <button
                  style={buttonStyle(fight.winner === fight.fighter2_name)}
                  onClick={() => handleResultUpdate(fight.id, fight.fighter2_name)}
                >
                  {fight.fighter2_name} Won
                </button>
              </div>
              {fight.winner && (
                <button
                  style={unselectButtonStyle}
                  onClick={() => handleResultUpdate(fight.id, null)}
                >
                  Unselect Winner
                </button>
              )}
            </>
          )}
          
          {fight.winner && editingFight !== fight.id && (
            <div style={{ marginTop: '10px', color: '#9ca3af' }}>
              Winner: {fight.winner}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default FightAdmin; 