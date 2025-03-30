import React, { useEffect, useState } from 'react';

function FightVotes({ fight, fights }) {
  const [fighter1Votes, setFighter1Votes] = useState([]);
  const [fighter2Votes, setFighter2Votes] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get the fight details from the fights array
    const fightDetails = fight.fight_details;
    if (!fightDetails) {
      setIsLoading(false);
      setError('Fight details not found');
      return;
    }

    setIsLoading(true);
    Promise.all([
      // Fetch votes for fighter 1
      fetch(`https://fight-prediction-app-b0vt.onrender.com/predictions/filter?fight_id=${fight.fight_id}&selected_fighter=${encodeURIComponent(fightDetails.fighter1_name)}`)
        .then(response => response.json()),
      // Fetch votes for fighter 2
      fetch(`https://fight-prediction-app-b0vt.onrender.com/predictions/filter?fight_id=${fight.fight_id}&selected_fighter=${encodeURIComponent(fightDetails.fighter2_name)}`)
        .then(response => response.json())
    ])
      .then(([fighter1Data, fighter2Data]) => {
        setFighter1Votes(fighter1Data);
        setFighter2Votes(fighter2Data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error fetching votes:', err);
        setError('Error fetching votes');
        setIsLoading(false);
      });
  }, [fight]);

  if (!fight.fight_details) {
    return <p>Fight details not found</p>;
  }

  const fightDetails = fight.fight_details;

  const cardStyle = {
    border: '1px solid #2c2c2c',
    borderRadius: '12px',
    padding: '20px',
    margin: '15px 0',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
  };

  const headerStyle = {
    fontSize: '1.4rem',
    fontWeight: '600',
    marginBottom: '20px',
    color: '#ffffff',
    borderBottom: '1px solid #2c2c2c',
    paddingBottom: '10px'
  };

  const fighterSectionStyle = {
    backgroundColor: '#242424',
    padding: '15px',
    borderRadius: '8px',
    flex: 1,
    minWidth: '250px'
  };

  const fighterHeaderStyle = {
    fontSize: '1.1rem',
    fontWeight: '500',
    marginBottom: '15px',
    color: '#ffffff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  const voteItemStyle = (isCurrentUser) => ({
    padding: '12px',
    backgroundColor: isCurrentUser ? '#1e3a8a' : '#2c2c2c',
    borderRadius: '6px',
    marginBottom: '8px',
    transition: 'background-color 0.2s',
    border: isCurrentUser ? '1px solid #3b82f6' : '1px solid transparent'
  });

  const timestampStyle = {
    fontSize: '0.85rem',
    color: '#9ca3af',
    marginTop: '4px'
  };

  return (
    <div style={cardStyle}>
      <h3 style={headerStyle}>
        Fight #{fight.fight_id}: {fightDetails.fighter1_name} vs {fightDetails.fighter2_name}
      </h3>
      
      {error && (
        <p style={{ color: '#ef4444', marginBottom: '15px', padding: '10px', backgroundColor: '#2c2c2c', borderRadius: '6px' }}>
          {error}
        </p>
      )}

      {isLoading ? (
        <p style={{ textAlign: 'center', padding: '20px' }}>Loading votes...</p>
      ) : (
        <div style={{ 
          display: 'flex', 
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          <div style={fighterSectionStyle}>
            <div style={fighterHeaderStyle}>
              <span>{fightDetails.fighter1_name}</span>
              <span style={{ 
                backgroundColor: '#374151',
                padding: '4px 8px',
                borderRadius: '12px',
                fontSize: '0.9rem'
              }}>
                {fighter1Votes.length} votes
              </span>
            </div>
            {fighter1Votes.length > 0 ? (
              <div>
                {fighter1Votes.map((vote, index) => (
                  <div key={index} style={voteItemStyle(vote.username === fight.username)}>
                    <div style={{ fontWeight: '500' }}>
                      {vote.username} {vote.username === fight.username && '(You)'}
                    </div>
                    <div style={timestampStyle}>
                      {new Date(vote.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#9ca3af' }}>No votes yet</p>
            )}
          </div>

          <div style={fighterSectionStyle}>
            <div style={fighterHeaderStyle}>
              <span>{fightDetails.fighter2_name}</span>
              <span style={{ 
                backgroundColor: '#374151',
                padding: '4px 8px',
                borderRadius: '12px',
                fontSize: '0.9rem'
              }}>
                {fighter2Votes.length} votes
              </span>
            </div>
            {fighter2Votes.length > 0 ? (
              <div>
                {fighter2Votes.map((vote, index) => (
                  <div key={index} style={voteItemStyle(vote.username === fight.username)}>
                    <div style={{ fontWeight: '500' }}>
                      {vote.username} {vote.username === fight.username && '(You)'}
                    </div>
                    <div style={timestampStyle}>
                      {new Date(vote.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#9ca3af' }}>No votes yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FightVotes; 