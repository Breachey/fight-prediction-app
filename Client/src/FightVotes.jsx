import React, { useEffect, useState } from 'react';

function FightVotes({ fight, fights }) {
  const [fighter1Votes, setFighter1Votes] = useState([]);
  const [fighter2Votes, setFighter2Votes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    // Get the fight details from the fights array
    const fightDetails = fights.find(f => f.id === fight.fight_id);
    if (!fightDetails) return;

    // Fetch votes for fighter 1
    fetch(`https://fight-prediction-app-b0vt.onrender.com/predictions/filter?fight_id=${fight.fight_id}&selected_fighter=${encodeURIComponent(fightDetails.fighter1_name)}`)
      .then(response => response.json())
      .then(data => setFighter1Votes(data))
      .catch(err => {
        console.error('Error fetching fighter 1 votes:', err);
        setError('Error fetching votes');
      });

    // Fetch votes for fighter 2
    fetch(`https://fight-prediction-app-b0vt.onrender.com/predictions/filter?fight_id=${fight.fight_id}&selected_fighter=${encodeURIComponent(fightDetails.fighter2_name)}`)
      .then(response => response.json())
      .then(data => setFighter2Votes(data))
      .catch(err => {
        console.error('Error fetching fighter 2 votes:', err);
        setError('Error fetching votes');
      });
  }, [fight]);

  if (!fights.find(f => f.id === fight.fight_id)) {
    return <p>Fight details not found</p>;
  }

  const fightDetails = fights.find(f => f.id === fight.fight_id);

  return (
    <div style={{ 
      border: '1px solid #ccc',
      borderRadius: '8px',
      padding: '15px',
      margin: '10px 0',
      backgroundColor: '#f8f9fa'
    }}>
      <h3 style={{ marginBottom: '15px' }}>Fight #{fight.fight_id}: {fightDetails.fighter1_name} vs {fightDetails.fighter2_name}</h3>
      
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h4>{fightDetails.fighter1_name}'s Votes ({fighter1Votes.length})</h4>
          {fighter1Votes.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {fighter1Votes.map((vote, index) => (
                <li key={index} style={{ 
                  padding: '5px',
                  backgroundColor: vote.username === fight.username ? '#e3f2fd' : 'transparent',
                  borderRadius: '4px'
                }}>
                  {vote.username} {vote.username === fight.username && '(You)'}
                  <br />
                  <small style={{ color: '#666' }}>
                    {new Date(vote.created_at).toLocaleString()}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No votes yet</p>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h4>{fightDetails.fighter2_name}'s Votes ({fighter2Votes.length})</h4>
          {fighter2Votes.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {fighter2Votes.map((vote, index) => (
                <li key={index} style={{ 
                  padding: '5px',
                  backgroundColor: vote.username === fight.username ? '#e3f2fd' : 'transparent',
                  borderRadius: '4px'
                }}>
                  {vote.username} {vote.username === fight.username && '(You)'}
                  <br />
                  <small style={{ color: '#666' }}>
                    {new Date(vote.created_at).toLocaleString()}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>No votes yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default FightVotes; 