import React, { useEffect, useState } from 'react';
import { API_URL } from './config';
import './FightVotes.css';

const getRankDisplay = (rank) => {
  if (!rank) return '';
  if (rank === 1) return '👑';
  return `#${rank}`;
};

function FightVotes({ fight }) {
  const [fighter1Votes, setFighter1Votes] = useState([]);
  const [fighter2Votes, setFighter2Votes] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [userPredictions, setUserPredictions] = useState([]);
  const [showAIVotes, setShowAIVotes] = useState(false);

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
      fetch(`${API_URL}/predictions/filter?fight_id=${fight.fight_id}&fighter_id=${encodeURIComponent(fightDetails.fighter1_id)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch votes');
          }
          return response.json();
        }),
      // Fetch votes for fighter 2
      fetch(`${API_URL}/predictions/filter?fight_id=${fight.fight_id}&fighter_id=${encodeURIComponent(fightDetails.fighter2_id)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch votes');
          }
          return response.json();
        }),
      // Fetch user predictions
      fetch(`${API_URL}/predictions/user/${fight.username}`)
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to fetch user predictions');
          }
          return response.json();
        })
    ])
      .then(([fighter1Data, fighter2Data, userData]) => {
        setFighter1Votes(fighter1Data);
        setFighter2Votes(fighter2Data);
        setUserPredictions(userData);
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
  const totalVotes = fighter1Votes.length + fighter2Votes.length;
  const fighter1Percentage = totalVotes ? Math.round((fighter1Votes.length / totalVotes) * 100) : 0;
  const fighter2Percentage = totalVotes ? Math.round((fighter2Votes.length / totalVotes) * 100) : 0;

  const userVote = userPredictions.find(pred => pred.fight_id === fight.fight_id);
  const selectedFighter = userVote ? userVote.fighter_id : null;

  const aiBadge = {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    color: '#60a5fa',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '500',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    marginLeft: '4px'
  };

  const toggleButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    borderRadius: '6px',
    background: 'transparent',
    color: showAIVotes ? '#60a5fa80' : '#a78bfa80',
    border: `1px solid ${showAIVotes ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)'}`,
    cursor: 'pointer',
    fontSize: '0.8rem',
    transition: 'all 0.2s ease',
    marginBottom: '10px',
    width: 'fit-content',
    margin: '0 auto 20px auto',
    opacity: 0.7,
    '&:hover': {
      opacity: 1,
      background: showAIVotes ? 'rgba(59, 130, 246, 0.1)' : 'rgba(76, 29, 149, 0.1)'
    }
  };

  return (
    <div className="fight-votes-container">
      <div className="fight-votes-card">
        <h3 className="fight-votes-header">
          Fight #{fight.fight_id}: {fightDetails.fighter1_name} vs {fightDetails.fighter2_name}
        </h3>
        
        <button 
          style={toggleButtonStyle}
          onClick={() => setShowAIVotes(!showAIVotes)}
        >
          {showAIVotes ? '○ AI Votes' : '● AI Votes'}
        </button>
        
        {error && (
          <p className="error-message">{error}</p>
        )}

        {isLoading ? (
          <p className="loading-message">Loading votes...</p>
        ) : (
          <>
            <div className="vote-distribution">
              {(() => {
                const fighter1FilteredVotes = fighter1Votes.filter(vote => showAIVotes || !vote.is_bot);
                const fighter2FilteredVotes = fighter2Votes.filter(vote => showAIVotes || !vote.is_bot);
                const totalVotes = fighter1FilteredVotes.length + fighter2FilteredVotes.length;
                const fighter1Percentage = totalVotes ? Math.round((fighter1FilteredVotes.length / totalVotes) * 100) : 50;
                const fighter2Percentage = totalVotes ? Math.round((fighter2FilteredVotes.length / totalVotes) * 100) : 50;

                return (
                  <>
                    <div 
                      className="vote-bar fighter1-bar" 
                      style={{ width: `${fighter1Percentage}%` }}
                    >
                      {fighter1Percentage > 15 && `${fighter1Percentage}%`}
                    </div>
                    <div 
                      className="vote-bar fighter2-bar" 
                      style={{ width: `${fighter2Percentage}%` }}
                    >
                      {fighter2Percentage > 15 && `${fighter2Percentage}%`}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="votes-sections-container">
              <div className="fighter-votes-section">
                <div className="fighter-votes-header">
                  <div className="fighter-header-info">
                    <span className="fighter-name">{fightDetails.fighter1_name}</span>
                    <span className="votes-count">
                      {fighter1Votes.filter(vote => showAIVotes || !vote.is_bot).length} votes
                    </span>
                  </div>
                </div>
                <div className="votes-list">
                  {fighter1Votes.filter(vote => showAIVotes || !vote.is_bot).length > 0 ? (
                    fighter1Votes
                      .filter(vote => showAIVotes || !vote.is_bot)
                      .map((vote, index) => (
                        <div key={index} className={`vote-item ${vote.username === fight.username ? 'current-user' : ''}`}>
                          <div className="vote-username">
                            {vote.username} {vote.username === fight.username && '(You)'}
                            {vote.is_bot && <span style={aiBadge}>AI</span>}
                            <span style={{ color: 'yellow', fontSize: 20 }}>
                              [{String(vote.rank)}]
                            </span>
                            {vote.rank && <span className="rank-badge">{getRankDisplay(vote.rank)}</span>}
                          </div>
                          <div className="vote-timestamp">
                            {new Date(vote.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="no-votes">No votes yet</p>
                  )}
                </div>
              </div>

              <div className="fighter-votes-section">
                <div className="fighter-votes-header">
                  <div className="fighter-header-info">
                    <span className="fighter-name">{fightDetails.fighter2_name}</span>
                    <span className="votes-count">
                      {fighter2Votes.filter(vote => showAIVotes || !vote.is_bot).length} votes
                    </span>
                  </div>
                </div>
                <div className="votes-list">
                  {fighter2Votes.filter(vote => showAIVotes || !vote.is_bot).length > 0 ? (
                    fighter2Votes
                      .filter(vote => showAIVotes || !vote.is_bot)
                      .map((vote, index) => (
                        <div key={index} className={`vote-item ${vote.username === fight.username ? 'current-user' : ''}`}>
                          <div className="vote-username">
                            {vote.username} {vote.username === fight.username && '(You)'}
                            {vote.is_bot && <span style={aiBadge}>AI</span>}
                            <span style={{ color: 'yellow', fontSize: 20 }}>
                              [{String(vote.rank)}]
                            </span>
                            {vote.rank && <span className="rank-badge">{getRankDisplay(vote.rank)}</span>}
                          </div>
                          <div className="vote-timestamp">
                            {new Date(vote.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="no-votes">No votes yet</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default FightVotes; 