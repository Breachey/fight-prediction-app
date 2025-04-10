import React, { useEffect, useState } from 'react';
import { API_URL } from './config';
import ReactCountryFlag from 'react-country-flag';
import { getCountryCode } from './utils/countryUtils';
import './Fights.css';

function Fights({ eventId, username }) {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFights, setSelectedFights] = useState({});
  const [submittedFights, setSubmittedFights] = useState({});
  const [voteErrors, setVoteErrors] = useState({});
  const [expandedFights, setExpandedFights] = useState({});
  const [fightVotes, setFightVotes] = useState({});
  const [fadeOutMessages, setFadeOutMessages] = useState({});
  const [showAIVotes, setShowAIVotes] = useState(false);
  const [expandedFightStats, setExpandedFightStats] = useState({});
  const [editingFight, setEditingFight] = useState(null);

  // Fetch both fights and predictions when component mounts or eventId/username changes
  useEffect(() => {
    if (eventId && username) {
      Promise.all([
        // Fetch fights
        fetch(`${API_URL}/events/${eventId}/fights`),
        // Fetch all predictions for the user
        fetch(`${API_URL}/predictions`)
      ])
        .then(async ([fightsResponse, predictionsResponse]) => {
          if (!fightsResponse.ok) throw new Error('Failed to fetch fights');
          if (!predictionsResponse.ok) throw new Error('Failed to fetch predictions');

          const [fightsData, predictionsData] = await Promise.all([
            fightsResponse.json(),
            predictionsResponse.json()
          ]);

          // Add debug logging
          console.log('Fights data:', fightsData.map(fight => ({
            id: fight.id,
            is_completed: fight.is_completed,
            winner: fight.winner,
            fighter1_id: fight.fighter1_id,
            fighter2_id: fight.fighter2_id
          })));

          // Filter predictions for current user
          const userPredictions = predictionsData.filter(pred => pred.username === username);
          
          // Create a map of fight ID to selected fighter
          const submittedVotes = {};
          userPredictions.forEach(pred => {
            submittedVotes[pred.fight_id] = pred.fighter_id;
          });

          setFights(fightsData);
          setSubmittedFights(submittedVotes);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error fetching data:', err);
          setError('Failed to load fights and predictions');
          setLoading(false);
        });
    }
  }, [eventId, username]);

  // Clear selected fights when username changes
  useEffect(() => {
    setSelectedFights({});
  }, [username]);

  // Function to handle selection (but not submission) of a fighter
  const handleSelection = (fightId, fighterName) => {
    // Only allow selection if vote hasn't been submitted
    if (submittedFights[fightId]) return;
    setSelectedFights(prev => ({ ...prev, [fightId]: fighterName }));
  };

  // Function to handle message fade out
  const handleMessageFadeOut = (fightId) => {
    setTimeout(() => {
      setFadeOutMessages(prev => ({ ...prev, [fightId]: true }));
      // Remove the message completely after animation
      setTimeout(() => {
        setSubmittedFights(prev => {
          const newState = { ...prev };
          delete newState[fightId];
          return newState;
        });
        setFadeOutMessages(prev => {
          const newState = { ...prev };
          delete newState[fightId];
          return newState;
        });
      }, 500); // Match this with the CSS animation duration
    }, 3000); // Show message for 3 seconds before starting fade
  };

  // Function to submit the selected vote for a fight
  const handleSubmitVote = async (fightId) => {
    if (!username) {
      setVoteErrors(prev => ({ ...prev, [fightId]: 'Please log in to vote' }));
      return;
    }

    const selectedFighter = selectedFights[fightId];
    if (!selectedFighter) {
      setVoteErrors(prev => ({ ...prev, [fightId]: 'No fighter selected' }));
      return;
    }

    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          fightId,
          fighter_id: selectedFighter,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        console.error('Server error on vote submission:', errorData);
        setVoteErrors(prev => ({ ...prev, [fightId]: `Server error: ${errorData.error || 'Failed to submit vote'}` }));
        return;
      }

      // Mark this fight's vote as submitted
      setSubmittedFights(prev => ({ ...prev, [fightId]: selectedFighter }));
      // Disable further selection for this fight
      setSelectedFights(prev => {
        const newState = { ...prev };
        delete newState[fightId];
        return newState;
      });
      // Start fade out timer
      handleMessageFadeOut(fightId);
      // Clear any previous vote error for this fight
      setVoteErrors(prev => ({ ...prev, [fightId]: '' }));
      // Refresh the votes display if the fight is expanded
      if (expandedFights[fightId]) {
        const fight = fights.find(f => f.id === fightId);
        if (fight) {
          const [fighter1Response, fighter2Response] = await Promise.all([
            fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter1_id)}`),
            fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter2_id)}`)
          ]);

          const [fighter1Votes, fighter2Votes] = await Promise.all([
            fighter1Response.json(),
            fighter2Response.json()
          ]);

          setFightVotes(prev => ({
            ...prev,
            [fightId]: {
              fighter1Votes,
              fighter2Votes
            }
          }));
        }
      }
    } catch (err) {
      console.error('Error submitting prediction:', err);
      setVoteErrors(prev => ({ ...prev, [fightId]: `Failed to submit prediction: ${err.message}` }));
    }
  };

  const toggleFightExpansion = async (fightId) => {
    const fight = fights.find(f => f.id === fightId);
    if (!fight) return;

    // Only allow expansion if user has voted or fight is completed
    if (!submittedFights[fightId] && !fight.is_completed) {
      setError(`You must vote on this fight to see other predictions`);
      return;
    }

    setExpandedFights(prev => {
      const newState = { ...prev };
      if (newState[fightId]) {
        delete newState[fightId];
      } else {
        newState[fightId] = true;
      }
      return newState;
    });

    // Fetch votes if expanding and we don't have them yet
    if (!expandedFights[fightId] && !fightVotes[fightId]) {
      try {
        console.log('Fetching votes for fight:', {
          fightId,
          fighter1: fight.fighter1_name,
          fighter2: fight.fighter2_name,
          encodedFighter1: encodeURIComponent(fight.fighter1_name),
          encodedFighter2: encodeURIComponent(fight.fighter2_name)
        });

        const [fighter1Response, fighter2Response] = await Promise.all([
          fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter1_id)}`),
          fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter2_id)}`)
        ]);

        if (!fighter1Response.ok) {
          console.error('Fighter 1 response error:', await fighter1Response.text());
          throw new Error('Failed to fetch votes for fighter 1');
        }
        if (!fighter2Response.ok) {
          console.error('Fighter 2 response error:', await fighter2Response.text());
          throw new Error('Failed to fetch votes for fighter 2');
        }

        const [fighter1Votes, fighter2Votes] = await Promise.all([
          fighter1Response.json(),
          fighter2Response.json()
        ]);

        console.log('Received votes:', {
          fighter1: {
            name: fight.fighter1_name,
            votes: fighter1Votes
          },
          fighter2: {
            name: fight.fighter2_name,
            votes: fighter2Votes
          }
        });

        setFightVotes(prev => ({
          ...prev,
          [fightId]: {
            fighter1Votes,
            fighter2Votes
          }
        }));
      } catch (err) {
        console.error('Error fetching votes:', err);
        setError('Failed to load votes');
      }
    }
  };

  const toggleFightStats = (fightId, e) => {
    if (e) {
      e.stopPropagation();
    }
    setExpandedFightStats(prev => ({
      ...prev,
      [fightId]: !prev[fightId]
    }));
  };

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

  if (loading) {
    return <div className="loading-message">Loading fights...</div>;
  }

  // Removed the global error return so that even if there's an error, we still render all fights.
  
  return (
    <div className="fights-container">
      <div className="fights-header">
        <h2 className="fights-title">Upcoming Fights</h2>
        <button 
          style={toggleButtonStyle}
          onClick={() => setShowAIVotes(!showAIVotes)}
        >
          {showAIVotes ? '○ AI Votes' : '● AI Votes'}
        </button>
      </div>

      {error && (
        // Global error (e.g. from fetching fights) is still displayed at the top
        <div className="error-message">{error}</div>
      )}

      {fights.map((fight) => (
        <div key={fight.id} className={`fight-card ${fight.is_completed ? 'completed' : ''}`}>
          {(fight.card_tier || fight.weightclass) && (
            <div className="fight-meta">
              {fight.card_tier && <h4 className="card-tier">{fight.card_tier}</h4>}
              {fight.weightclass && <p className="weight-class">{fight.weightclass}</p>}
            </div>
          )}
          <div className="fighters-container">
            {/* Fighter 1 Card */}
            {console.log('Fight data:', {
              id: fight.id,
              winner: fight.winner,
              fighter1_id: fight.fighter1_id,
              fighter2_id: fight.fighter2_id,
              is_completed: fight.is_completed
            })}
            <div
              className={`fighter-card ${
                (selectedFights[fight.id] === fight.fighter1_id || submittedFights[fight.id] === fight.fighter1_id) ? 'selected' : ''
              } ${(selectedFights[fight.id] || submittedFights[fight.id]) && 
                  (selectedFights[fight.id] !== fight.fighter1_id && submittedFights[fight.id] !== fight.fighter1_id) ? 'unselected' : ''
              } ${fight.is_completed && String(fight.winner) === String(fight.fighter1_id) ? 'winner' : fight.is_completed ? 'loser' : ''}`}
              onClick={() => !fight.is_completed && handleSelection(fight.id, fight.fighter1_id)}
            >
              <div className="fighter-image-container">
                <div className="fighter-image-background">
                  <ReactCountryFlag 
                    countryCode={getCountryCode(fight.fighter1_country)} 
                    svg 
                    style={{
                      width: '100%',
                      height: '100%',
                      opacity: 0.15,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      borderRadius: '8px',
                      filter: 'blur(1px) brightness(1.2)',
                      transform: 'scale(1.1)'
                    }}
                  />
                </div>
                <img src={fight.fighter1_image} alt={fight.fighter1_name} className="fighter-image" />
              </div>
              <h3 className="fighter-name">
                <span className="fighter-name-text">{fight.fighter1_firstName}</span>
                {fight.fighter1_nickname && (
                  <span className="fighter-nickname">{fight.fighter1_nickname}</span>
                )}
                <span className="fighter-name-text">{fight.fighter1_lastName}</span>
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
              </div>
              {expandedFightStats[fight.id] && (
                <div className="expanded-stats">
                  <div className="stat-row">
                    <span className="stat-label">Age</span>
                    <span>{fight.fighter1_age || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Weight</span>
                    <span>{fight.fighter1_weight || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Height</span>
                    <span>{fight.fighter1_height || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Reach</span>
                    <span>{fight.fighter1_reach || 'N/A'}</span>
                  </div>
                </div>
              )}
              {String(submittedFights[fight.id]) === String(fight.fighter1_id) && (
                <div className="vote-badge">Your Pick</div>
              )}
            </div>

            <div className="vs-text">VS</div>

            {/* Fighter 2 Card */}
            <div
              className={`fighter-card ${
                (selectedFights[fight.id] === fight.fighter2_id || submittedFights[fight.id] === fight.fighter2_id) ? 'selected' : ''
              } ${(selectedFights[fight.id] || submittedFights[fight.id]) && 
                  (selectedFights[fight.id] !== fight.fighter2_id && submittedFights[fight.id] !== fight.fighter2_id) ? 'unselected' : ''
              } ${fight.is_completed && String(fight.winner) === String(fight.fighter2_id) ? 'winner' : fight.is_completed ? 'loser' : ''}`}
              onClick={() => !fight.is_completed && handleSelection(fight.id, fight.fighter2_id)}
            >
              <div className="fighter-image-container">
                <div className="fighter-image-background">
                  <ReactCountryFlag 
                    countryCode={getCountryCode(fight.fighter2_country)} 
                    svg 
                    style={{
                      width: '100%',
                      height: '100%',
                      opacity: 0.15,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      borderRadius: '8px',
                      filter: 'blur(1px) brightness(1.2)',
                      transform: 'scale(1.1)'
                    }}
                  />
                </div>
                <img src={fight.fighter2_image} alt={fight.fighter2_name} className="fighter-image" />
              </div>
              <h3 className="fighter-name">
                <span className="fighter-name-text">{fight.fighter2_firstName}</span>
                {fight.fighter2_nickname && (
                  <span className="fighter-nickname">{fight.fighter2_nickname}</span>
                )}
                <span className="fighter-name-text">{fight.fighter2_lastName}</span>
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
              </div>
              {expandedFightStats[fight.id] && (
                <div className="expanded-stats">
                  <div className="stat-row">
                    <span className="stat-label">Age</span>
                    <span>{fight.fighter2_age || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Weight</span>
                    <span>{fight.fighter2_weight || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Height</span>
                    <span>{fight.fighter2_height || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Reach</span>
                    <span>{fight.fighter2_reach || 'N/A'}</span>
                  </div>
                </div>
              )}
              {String(submittedFights[fight.id]) === String(fight.fighter2_id) && (
                <div className="vote-badge">Your Pick</div>
              )}
            </div>
          </div>

          {/* Add the single expand button after the fighters container */}
          <button 
            className="expand-stats-button"
            onClick={(e) => toggleFightStats(fight.id, e)}
          >
            {expandedFightStats[fight.id] ? '▲' : '▼'}
          </button>

          {/* Display vote error for this fight if it exists */}
          {voteErrors[fight.id] && (
            <div className="error-message">{voteErrors[fight.id]}</div>
          )}

          {selectedFights[fight.id] && !submittedFights[fight.id] && (
            <div className="selected-fighter-message">
              <button className="submit-vote-button" onClick={() => handleSubmitVote(fight.id)}>Submit Vote</button>
            </div>
          )}

          <div className="fight-votes-section">
            <button 
              className={`expand-votes-button ${(!submittedFights[fight.id] && !fight.is_completed) ? 'disabled' : ''}`}
              onClick={() => toggleFightExpansion(fight.id)}
            >
              {expandedFights[fight.id] ? '▲ Hide Votes' : 
               (!submittedFights[fight.id] && !fight.is_completed) ? 
               '🔒 Vote to See Predictions' : 
               '▼ Show Votes'}
            </button>

            {expandedFights[fight.id] && fightVotes[fight.id] && (
              <div className="votes-container">
                {/* Add back the vote distribution bar */}
                <div className="vote-distribution">
                  {(() => {
                    // Filter votes based on showAIVotes setting
                    const fighter1FilteredVotes = fightVotes[fight.id].fighter1Votes.filter(vote => showAIVotes || !vote.is_bot);
                    const fighter2FilteredVotes = fightVotes[fight.id].fighter2Votes.filter(vote => showAIVotes || !vote.is_bot);
                    const totalVotes = fighter1FilteredVotes.length + fighter2FilteredVotes.length;
                    const fighter1Percentage = totalVotes ? Math.round((fighter1FilteredVotes.length / totalVotes) * 100) : 50;
                    const fighter2Percentage = totalVotes ? Math.round((fighter2FilteredVotes.length / totalVotes) * 100) : 50;

                    return (
                      <>
                        <div 
                          className="vote-bar fighter1-bar" 
                          style={{ width: `${fighter1Percentage}%` }}
                        />
                        <div 
                          className="vote-bar fighter2-bar" 
                          style={{ width: `${fighter2Percentage}%` }}
                        />
                      </>
                    );
                  })()}
                </div>

                <div className="votes-list-container">
                  <div className="fighter-votes">
                    <h4>{fight.fighter1_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter1Votes
                        .filter(vote => showAIVotes || !vote.is_bot)
                        .map((vote, index) => (
                          <div key={index} className={`vote-item ${vote.username === username ? 'current-user' : ''}`}>
                            {vote.username} {vote.username === username && '(You)'}
                            {vote.is_bot && <span style={aiBadge}>AI</span>}
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="fighter-votes">
                    <h4>{fight.fighter2_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter2Votes
                        .filter(vote => showAIVotes || !vote.is_bot)
                        .map((vote, index) => (
                          <div key={index} className={`vote-item ${vote.username === username ? 'current-user' : ''}`}>
                            {vote.username} {vote.username === username && '(You)'}
                            {vote.is_bot && <span style={aiBadge}>AI</span>}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
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