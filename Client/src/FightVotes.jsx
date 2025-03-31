import React, { useEffect, useState } from 'react';
import './FightVotes.css';

function FightVotes({ fight }) {
  const [fighter1Votes, setFighter1Votes] = useState([]);
  const [fighter2Votes, setFighter2Votes] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch votes');
          }
          return response.json();
        }),
      // Fetch votes for fighter 2
      fetch(`https://fight-prediction-app-b0vt.onrender.com/predictions/filter?fight_id=${fight.fight_id}&selected_fighter=${encodeURIComponent(fightDetails.fighter2_name)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch votes');
          }
          return response.json();
        })
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

  return (
    <div className="fight-votes-container">
      <div className="fight-votes-card">
        <h3 className="fight-votes-header">
          Fight #{fight.fight_id}: {fightDetails.fighter1_name} vs {fightDetails.fighter2_name}
        </h3>
        
        {error && (
          <p className="error-message">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="loading-message">Loading votes...</p>
        ) : (
          <div className="votes-sections-container">
            <div className="fighter-votes-section">
              <div className="fighter-votes-header">
                <span>{fightDetails.fighter1_name}</span>
                <span className="votes-count">
                  {fighter1Votes.length} votes
                </span>
              </div>
              {fighter1Votes.length > 0 ? (
                <div className="votes-list">
                  {fighter1Votes.map((vote, index) => (
                    <div key={index} className={`vote-item ${vote.username === fight.username ? 'current-user' : ''}`}>
                      <div className="vote-username">
                        {vote.username} {vote.username === fight.username && '(You)'}
                      </div>
                      <div className="vote-timestamp">
                        {new Date(vote.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-votes">No votes yet</p>
              )}
            </div>

            <div className="fighter-votes-section">
              <div className="fighter-votes-header">
                <span>{fightDetails.fighter2_name}</span>
                <span className="votes-count">
                  {fighter2Votes.length} votes
                </span>
              </div>
              {fighter2Votes.length > 0 ? (
                <div className="votes-list">
                  {fighter2Votes.map((vote, index) => (
                    <div key={index} className={`vote-item ${vote.username === fight.username ? 'current-user' : ''}`}>
                      <div className="vote-username">
                        {vote.username} {vote.username === fight.username && '(You)'}
                      </div>
                      <div className="vote-timestamp">
                        {new Date(vote.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-votes">No votes yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FightVotes; 