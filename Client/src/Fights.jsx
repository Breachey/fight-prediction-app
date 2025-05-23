import React, { useEffect, useState } from 'react';
import { API_URL } from './config';
import ReactCountryFlag from 'react-country-flag';
import { getCountryCode, convertInchesToHeightString, formatStreak } from './utils/countryUtils';
import './Fights.css';

function Fights({ eventId, username }) {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFights, setSelectedFights] = useState(() => {
    // Initialize from localStorage if available
    const saved = localStorage.getItem(`selectedFights_${eventId}_${username}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [submittedFights, setSubmittedFights] = useState(() => {
    // Initialize from localStorage if available, will be updated with API data
    const saved = localStorage.getItem(`submittedFights_${eventId}_${username}`);
    return saved ? JSON.parse(saved) : {};
  });
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
        fetch(`${API_URL}/predictions?username=${encodeURIComponent(username)}`)
      ])
        .then(async ([fightsResponse, predictionsResponse]) => {
          if (!fightsResponse.ok) throw new Error('Failed to fetch fights');
          if (!predictionsResponse.ok) throw new Error('Failed to fetch predictions');

          const [fightsData, predictionsData] = await Promise.all([
            fightsResponse.json(),
            predictionsResponse.json()
          ]);

          // Add debug logging
          console.log('API Response:', {
            fights: fightsData.map(fight => ({
              id: fight.id,
              fighter1_id: fight.fighter1_id,
              fighter2_id: fight.fighter2_id,
              fighter1_streak: fight.fighter1_streak,
              fighter2_streak: fight.fighter2_streak,
              is_completed: fight.is_completed
            })),
            predictions: predictionsData
          });

          // Create a map of fight ID to selected fighter
          const submittedVotes = {};
          predictionsData.forEach(pred => {
            console.log('Processing prediction:', {
              fight_id: pred.fight_id,
              fighter_id: pred.fighter_id,
              stringified_fighter_id: String(pred.fighter_id)
            });
            submittedVotes[pred.fight_id] = String(pred.fighter_id); // Ensure fighter_id is stored as string
          });

          console.log('Final submitted votes:', submittedVotes);

          setFights(fightsData.map(fight => ({
            ...fight,
            fighter1_id: String(fight.fighter1_id), // Ensure fighter IDs are strings
            fighter2_id: String(fight.fighter2_id)
          })));
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

  // Save selectedFights to localStorage whenever it changes
  useEffect(() => {
    if (eventId && username) {
      localStorage.setItem(`selectedFights_${eventId}_${username}`, JSON.stringify(selectedFights));
    }
  }, [selectedFights, eventId, username]);

  // Save submittedFights to localStorage whenever it changes
  useEffect(() => {
    if (eventId && username) {
      localStorage.setItem(`submittedFights_${eventId}_${username}`, JSON.stringify(submittedFights));
    }
  }, [submittedFights, eventId, username]);

  // Clear both selected and submitted fights when username or eventId changes
  useEffect(() => {
    setSelectedFights({});
    setSubmittedFights({});
    localStorage.removeItem(`selectedFights_${eventId}_${username}`);
    localStorage.removeItem(`submittedFights_${eventId}_${username}`);
  }, [username, eventId]);

  // Function to handle selection (but not submission) of a fighter
  const handleSelection = (fightId, fighterName) => {
    // Only allow selection if vote hasn't been submitted and fight isn't completed
    if (submittedFights[fightId] || fights.find(f => f.id === fightId)?.is_completed) return;
    setSelectedFights(prev => ({ ...prev, [fightId]: fighterName }));
  };

  // Function to handle message fade out
  const handleMessageFadeOut = (fightId) => {
    setTimeout(() => {
      setFadeOutMessages(prev => ({ ...prev, [fightId]: true }));
      // Remove the message completely after animation
      setTimeout(() => {
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
      
      // Clear any previous vote error for this fight
      setVoteErrors(prev => ({ ...prev, [fightId]: '' }));
      
      // Start fade out timer for the submission message
      handleMessageFadeOut(fightId);
      
      // Clear the selection state for this fight
      setSelectedFights(prev => {
        const newState = { ...prev };
        delete newState[fightId];
        return newState;
      });

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

  // Fetch votes for all eligible fights on mount or when fights/submittedFights change
  useEffect(() => {
    if (!fights.length) return;
    fights.forEach(fight => {
      const eligible = submittedFights[fight.id] || fight.is_completed;
      if (eligible && !fightVotes[fight.id]) {
        Promise.all([
          fetch(`${API_URL}/predictions/filter?fight_id=${fight.id}&fighter_id=${encodeURIComponent(fight.fighter1_id)}`),
          fetch(`${API_URL}/predictions/filter?fight_id=${fight.id}&fighter_id=${encodeURIComponent(fight.fighter2_id)}`)
        ])
          .then(async ([fighter1Response, fighter2Response]) => {
            if (!fighter1Response.ok || !fighter2Response.ok) return;
            const [fighter1Votes, fighter2Votes] = await Promise.all([
              fighter1Response.json(),
              fighter2Response.json()
            ]);
            setFightVotes(prev => ({
              ...prev,
              [fight.id]: { fighter1Votes, fighter2Votes }
            }));
          })
          .catch(() => {});
      }
    });
  }, [fights, submittedFights, showAIVotes]);

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
              } ${(submittedFights[fight.id] && submittedFights[fight.id] !== fight.fighter1_id) || 
                   (fight.is_completed && String(fight.winner) !== String(fight.fighter1_id)) ? 'unselected' : ''
              } ${fight.is_completed && String(fight.winner) === String(fight.fighter1_id) ? 'winner' : fight.is_completed ? 'loser' : ''}`}
              onClick={() => !fight.is_completed && handleSelection(fight.id, fight.fighter1_id)}
            >
              {console.log('Fighter 1 class data:', {
                fightId: fight.id,
                fighter1Id: fight.fighter1_id,
                submittedVote: submittedFights[fight.id],
                isSelected: submittedFights[fight.id] === fight.fighter1_id,
                isUnselected: submittedFights[fight.id] && submittedFights[fight.id] !== fight.fighter1_id
              })}
              <div className="fighter-image-container">
                <div className="fighter-image-background">
                  <ReactCountryFlag 
                    countryCode={getCountryCode(fight.fighter1_country)} 
                    svg 
                    style={{
                      width: '100%',
                      height: '100%',
                      opacity: 0.5,
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
                <div className="stat-row odds-row">
                  <span className="stat-label">Odds</span>
                  <span className={parseInt(fight.fighter1_odds) < 0 ? 'favorite-odds' : 'underdog-odds'}>
                    {fight.fighter1_odds ? fight.fighter1_odds : 'N/A'}
                  </span>
                </div>
              </div>
              {expandedFightStats[fight.id] && (
                <div className="expanded-stats">
                  {console.log('Fighter 1 Streak Debug:', {
                    raw: fight.fighter1_streak,
                    type: typeof fight.fighter1_streak,
                    formatted: formatStreak(fight.fighter1_streak)
                  })}
                  <div className="stat-row">
                    <span className="stat-label">Age</span>
                    <span>{fight.fighter1_age || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Weight</span>
                    <span>{fight.fighter1_weight ? `${fight.fighter1_weight} lb` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Height</span>
                    <span>{convertInchesToHeightString(fight.fighter1_height)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Reach</span>
                    <span>{fight.fighter1_reach ? `${fight.fighter1_reach}"` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Stance</span>
                    <span>{fight.fighter1_stance || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Streak</span>
                    <span>{fight.fighter1_streak !== null ? formatStreak(fight.fighter1_streak) : 'N/A'}</span>
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
              } ${(submittedFights[fight.id] && submittedFights[fight.id] !== fight.fighter2_id) || 
                   (fight.is_completed && String(fight.winner) !== String(fight.fighter2_id)) ? 'unselected' : ''
              } ${fight.is_completed && String(fight.winner) === String(fight.fighter2_id) ? 'winner' : fight.is_completed ? 'loser' : ''}`}
              onClick={() => !fight.is_completed && handleSelection(fight.id, fight.fighter2_id)}
            >
              {console.log('Fighter 2 class data:', {
                fightId: fight.id,
                fighter2Id: fight.fighter2_id,
                submittedVote: submittedFights[fight.id],
                isSelected: submittedFights[fight.id] === fight.fighter2_id,
                isUnselected: submittedFights[fight.id] && submittedFights[fight.id] !== fight.fighter2_id
              })}
              <div className="fighter-image-container">
                <div className="fighter-image-background">
                  <ReactCountryFlag 
                    countryCode={getCountryCode(fight.fighter2_country)} 
                    svg 
                    style={{
                      width: '100%',
                      height: '100%',
                      opacity: 0.5,
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
                <div className="stat-row odds-row">
                  <span className="stat-label">Odds</span>
                  <span className={parseInt(fight.fighter2_odds) < 0 ? 'favorite-odds' : 'underdog-odds'}>
                    {fight.fighter2_odds ? fight.fighter2_odds : 'N/A'}
                  </span>
                </div>
              </div>
              {expandedFightStats[fight.id] && (
                <div className="expanded-stats">
                  {console.log('Fighter 2 Streak Debug:', {
                    raw: fight.fighter2_streak,
                    type: typeof fight.fighter2_streak,
                    formatted: formatStreak(fight.fighter2_streak)
                  })}
                  <div className="stat-row">
                    <span className="stat-label">Age</span>
                    <span>{fight.fighter2_age || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Weight</span>
                    <span>{fight.fighter2_weight ? `${fight.fighter2_weight} lb` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Height</span>
                    <span>{convertInchesToHeightString(fight.fighter2_height)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Reach</span>
                    <span>{fight.fighter2_reach ? `${fight.fighter2_reach}"` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Stance</span>
                    <span>{fight.fighter2_stance || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Streak</span>
                    <span>{fight.fighter2_streak !== null ? formatStreak(fight.fighter2_streak) : 'N/A'}</span>
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
            <div
              className={`vote-distribution${(!submittedFights[fight.id] && !fight.is_completed) ? ' disabled' : ''}`}
              style={{ cursor: (submittedFights[fight.id] || fight.is_completed) ? 'pointer' : 'not-allowed', position: 'relative' }}
              onClick={() => (submittedFights[fight.id] || fight.is_completed) && toggleFightExpansion(fight.id)}
              tabIndex={0}
              onKeyPress={e => {
                if ((e.key === 'Enter' || e.key === ' ') && (submittedFights[fight.id] || fight.is_completed)) {
                  toggleFightExpansion(fight.id);
                }
              }}
              aria-label={expandedFights[fight.id] ? 'Hide Votes' : 'Show Votes'}
            >
              {(() => {
                const fighter1FilteredVotes = fightVotes[fight.id]?.fighter1Votes?.filter(vote => showAIVotes || !vote.is_bot) || [];
                const fighter2FilteredVotes = fightVotes[fight.id]?.fighter2Votes?.filter(vote => showAIVotes || !vote.is_bot) || [];
                const totalVotes = fighter1FilteredVotes.length + fighter2FilteredVotes.length;
                const split = totalVotes ? Math.round((fighter1FilteredVotes.length / totalVotes) * 100) : 50;
                return (
                  <>
                    <div
                      className="vote-bar blended-bar"
                      style={{
                        width: '100%',
                        height: '100%',
                        background: `linear-gradient(90deg, #ff74ff ${split}%, #43ccf3 ${split}%)`,
                        borderRadius: 'inherit',
                        transition: 'background 0.3s',
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        zIndex: 1
                      }}
                    />
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: '#fff',
                      textShadow: '0 2px 8px #000a',
                      pointerEvents: 'none',
                      zIndex: 2,
                      opacity: 0.85
                    }}>
                      {expandedFights[fight.id] ? '▲ Hide Votes' : 
                        (!submittedFights[fight.id] && !fight.is_completed) ? '🔒 Vote to See Predictions' : '▼ Show Votes'}
                    </span>
                  </>
                );
              })()}
            </div>
            {expandedFights[fight.id] && fightVotes[fight.id] && (
              <div className="votes-container">
                <div className="votes-list-container">
                  <div className="fighter-votes fighter1-votes">
                    <h4>{fight.fighter1_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter1Votes
                        .filter(vote => showAIVotes || !vote.is_bot)
                        .map((vote, index) => (
                          <div key={index} className="vote-username-on-bg">
                            <div className="vote-username-card">
                              {vote.username} {vote.username === username && '(You)'}
                              {vote.is_bot && <span style={aiBadge}>AI</span>}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="fighter-votes fighter2-votes">
                    <h4>{fight.fighter2_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter2Votes
                        .filter(vote => showAIVotes || !vote.is_bot)
                        .map((vote, index) => (
                          <div key={index} className="vote-username-on-bg">
                            <div className="vote-username-card">
                              {vote.username} {vote.username === username && '(You)'}
                              {vote.is_bot && <span style={aiBadge}>AI</span>}
                            </div>
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