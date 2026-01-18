import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { API_URL } from './config';
import ReactCountryFlag from 'react-country-flag';
import { getCountryCode, convertInchesToHeightString, formatStreak } from './utils/countryUtils';
import './Fights.css';
import PlayerCard from './components/PlayerCard';
import VoteCard from './components/VoteCard';

// Move static styles outside component to prevent recreation on every render
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
  padding: '8px 12px',
  borderRadius: '8px',
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  cursor: 'pointer',
  fontSize: '0.875rem',
  transition: 'all 0.2s ease',
  marginBottom: '10px',
  width: 'fit-content',
  margin: '0 auto 20px auto',
  opacity: 0.7
};

function Fights({ eventId, username, user_id, user_type }) {
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
  const [voteCounts, setVoteCounts] = useState({}); // Store vote counts for button ratio
  const [fadeOutMessages, setFadeOutMessages] = useState({});
  const [showAIVotes, setShowAIVotes] = useState(false);
  const [expandedFightStats, setExpandedFightStats] = useState({});
  const [expandedAdminControls, setExpandedAdminControls] = useState({});
  const [editingFight, setEditingFight] = useState(null);

  // Admin function to handle fight result updates
  const handleResultUpdate = async (fightId, winner) => {
    try {
      const response = await fetch(`${API_URL}/ufc_full_fight_card/${fightId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ winner }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error('Failed to update fight result');
      }

      const updatedFight = await response.json();

      // Find the existing fight to merge missing fields
      const existingFight = fights.find(fight => fight.id === fightId);

      // Merge while preserving existing values when updated ones are null/undefined
      const mergedFight = { ...existingFight };
      Object.keys(updatedFight).forEach(key => {
        const val = updatedFight[key];
        if (val !== null && val !== undefined) {
          mergedFight[key] = val;
        }
      });

      setFights(fights.map(fight => 
        fight.id === fightId ? mergedFight : fight
      ));
      setEditingFight(null);
    } catch (err) {
      console.error('Error updating fight result:', err);
      setError('Failed to update fight result');
    }
  };

  // Admin function to handle fight cancellation
  const handleFightCancel = async (fightId) => {
    if (!fightId) {
      setError('No fight ID provided');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/ufc_full_fight_card/${fightId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fight cancel error:', response.status, errorText);
        throw new Error(`Failed to cancel fight: ${response.status}`);
      }

      const updatedFight = await response.json();
      
      // Update local state with the complete updated fight data
      setFights(fights.map(fight => 
        fight.id === fightId ? updatedFight : fight
      ));
      setEditingFight(null);
      
      // Show success message
      setError('Fight canceled successfully!');
      setTimeout(() => setError(''), 3000);
      
    } catch (err) {
      console.error('Error canceling fight:', err);
      setError(`Failed to cancel fight: ${err.message}`);
    }
  };

  // Fetch both fights and predictions when component mounts or eventId/user_id changes
  useEffect(() => {
    if (eventId && user_id) {
      Promise.all([
        // Fetch fights
        fetch(`${API_URL}/events/${eventId}/fights`),
        // Fetch all predictions for the user by user_id
        fetch(`${API_URL}/predictions?user_id=${encodeURIComponent(user_id)}`)
      ])
        .then(async ([fightsResponse, predictionsResponse]) => {
          if (!fightsResponse.ok) throw new Error('Failed to fetch fights');
          if (!predictionsResponse.ok) throw new Error('Failed to fetch predictions');

          const [fightsData, predictionsData] = await Promise.all([
            fightsResponse.json(),
            predictionsResponse.json()
          ]);

          // Create a map of fight ID to selected fighter
          const submittedVotes = {};
          predictionsData.forEach(pred => {
            submittedVotes[pred.fight_id] = String(pred.fighter_id); // Ensure fighter_id is stored as string
          });

          const fightsWithStringIds = fightsData.map(fight => ({
            ...fight,
            fighter1_id: String(fight.fighter1_id), // Ensure fighter IDs are strings
            fighter2_id: String(fight.fighter2_id)
          }));

          setFights(fightsWithStringIds);
          setSubmittedFights(submittedVotes);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error fetching data:', err);
          setError('Failed to load fights and predictions');
          setLoading(false);
        });
    }
  }, [eventId, user_id]);

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

  // Function to fetch vote counts for a fight (lightweight - just for button ratio)
  const fetchVoteCounts = useCallback(async (fightId) => {
    const fightKey = String(fightId);
    const fight = fights.find(f => String(f.id) === fightKey);
    if (!fight) return;

    try {
      const [fighter1Response, fighter2Response] = await Promise.all([
        fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter1_id)}`),
        fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter2_id)}`)
      ]);

      if (!fighter1Response.ok || !fighter2Response.ok) return;

      const [fighter1Votes, fighter2Votes] = await Promise.all([
        fighter1Response.json(),
        fighter2Response.json()
      ]);

      // Filter out bot votes if needed (for count calculation)
      const fighter1Filtered = fighter1Votes.filter(vote => showAIVotes || !vote.is_bot);
      const fighter2Filtered = fighter2Votes.filter(vote => showAIVotes || !vote.is_bot);

      setVoteCounts(prev => ({
        ...prev,
        [fightKey]: {
          fighter1: fighter1Filtered.length,
          fighter2: fighter2Filtered.length
        }
      }));
    } catch (err) {
      console.error('Error fetching vote counts:', err);
    }
  }, [fights, showAIVotes]);

  // Fetch vote counts for fights the user has already voted on
  useEffect(() => {
    if (fights.length > 0 && Object.keys(submittedFights).length > 0) {
      const votedFightIds = Object.keys(submittedFights);
      votedFightIds.forEach(fightId => {
        const fight = fights.find(f => String(f.id) === String(fightId));
        if (fight) {
          // Only fetch if we don't have counts yet, or if showAIVotes changed
          fetchVoteCounts(fightId);
        }
      });
    }
  }, [fights, submittedFights, fetchVoteCounts, showAIVotes]);

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
    if (!user_id) {
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
          user_id,
          username,
          fightId,
          fighter_id: selectedFighter,
          selected_fighter: selectedFighter,
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

      // Optimistically update vote counts immediately for instant UI feedback
      const fightKey = String(fightId);
      const fight = fights.find(f => String(f.id) === fightKey);
      if (fight) {
        setVoteCounts(prev => {
          const current = prev[fightKey] || { fighter1: 0, fighter2: 0 };
          const isFighter1 = String(selectedFighter) === String(fight.fighter1_id);
          return {
            ...prev,
            [fightKey]: {
              fighter1: isFighter1 ? current.fighter1 + 1 : current.fighter1,
              fighter2: isFighter1 ? current.fighter2 : current.fighter2 + 1
            }
          };
        });
      }

      // Fetch actual vote counts after a short delay to ensure API has processed the vote
      setTimeout(() => {
        fetchVoteCounts(fightId);
      }, 500);

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

          // Filter votes based on AI visibility setting
          const fighter1Filtered = fighter1Votes.filter(vote => showAIVotes || !vote.is_bot);
          const fighter2Filtered = fighter2Votes.filter(vote => showAIVotes || !vote.is_bot);

          setFightVotes(prev => ({
            ...prev,
            [fightId]: {
              fighter1Votes,
              fighter2Votes
            }
          }));

          // Update vote counts from the fetched data
          setVoteCounts(prev => ({
            ...prev,
            [fightId]: {
              fighter1: fighter1Filtered.length,
              fighter2: fighter2Filtered.length
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

        // Filter votes based on AI visibility setting
        const fighter1Filtered = fighter1Votes.filter(vote => showAIVotes || !vote.is_bot);
        const fighter2Filtered = fighter2Votes.filter(vote => showAIVotes || !vote.is_bot);

        setFightVotes(prev => ({
          ...prev,
          [fightId]: {
            fighter1Votes,
            fighter2Votes
          }
        }));

        // Update vote counts from the fetched data
        setVoteCounts(prev => ({
          ...prev,
          [fightId]: {
            fighter1: fighter1Filtered.length,
            fighter2: fighter2Filtered.length
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

  const toggleAdminControls = (fightId, e) => {
    if (e) {
      e.stopPropagation();
    }
    setExpandedAdminControls(prev => ({
      ...prev,
      [fightId]: !prev[fightId]
    }));
  };

  // Dynamic toggle button style based on showAIVotes state
  const dynamicToggleStyle = useMemo(() => ({
    ...toggleButtonStyle,
    color: showAIVotes ? '#60a5fa80' : 'rgba(255, 255, 255, 0.5)',
    border: `1px solid ${showAIVotes ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.2)'}`,
  }), [showAIVotes]);

  if (loading) {
    return <div className="loading-message">Loading fights...</div>;
  }

  // Removed the global error return so that even if there's an error, we still render all fights.
  
  return (
    <div className="fights-container">
      <div className="fights-header">
        <h2 className="fights-title">Upcoming Fights</h2>
        <button 
          style={dynamicToggleStyle}
          onClick={() => setShowAIVotes(!showAIVotes)}
        >
          {showAIVotes ? '● Show AI Users' : '○ Show AI Users'}
        </button>
      </div>

      {error && (
        // Global error (e.g. from fetching fights) is still displayed at the top
        <div className="error-message">{error}</div>
      )}

      {fights.map((fight) => (
        <div key={fight.id} className={`fight-card ${fight.is_completed ? 'completed' : ''} ${fight.is_canceled ? 'canceled' : ''}`}>
          {(fight.card_tier || fight.weightclass || fight.is_canceled) && (
            <div className="fight-meta">
              {fight.card_tier && <h4 className="card-tier">{fight.card_tier}</h4>}
              {typeof fight.weightclass === 'string' && fight.weightclass && (
                <div className="weight-class-container">
                  <p className="weight-class">
                    {fight.weightclass.split(' ').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                    ).join(' ')}
                  </p>
                  {(fight.weightclass_official || fight.weightclass_lbs) && (
                    <p className="weight-class-details">
                      {fight.weightclass_official && fight.weightclass_lbs 
                        ? `${typeof fight.weightclass_official === 'string' ? fight.weightclass_official.split(' ').map(word => 
                            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                          ).join(' ') : fight.weightclass_official} (${fight.weightclass_lbs} lbs)`
                        : fight.weightclass_official 
                          ? (typeof fight.weightclass_official === 'string' ? fight.weightclass_official.split(' ').map(word => 
                              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                            ).join(' ') : fight.weightclass_official)
                          : fight.weightclass_lbs 
                            ? `${fight.weightclass_lbs} lbs`
                            : ''
                      }
                    </p>
                  )}
                </div>
              )}
              {fight.is_canceled && (
                <div className="fight-canceled">
                  <span className="canceled-icon">✕</span>
                  CANCELED
                </div>
              )}
            </div>
          )}
          <div className="fighters-container">
            {/* Fighter 1 Card */}
            <div
              className={`fighter-card ${
                fight.is_completed
                  ? String(fight.winner) === String(fight.fighter1_id)
                    ? 'winner'
                    : 'loser'
                  : (selectedFights[fight.id] === fight.fighter1_id || submittedFights[fight.id] === fight.fighter1_id)
                    ? 'selected'
                    : (submittedFights[fight.id] && submittedFights[fight.id] !== fight.fighter1_id)
                      ? 'unselected'
                      : ''
              }`}
              onClick={() => !fight.is_completed && !fight.is_canceled && handleSelection(fight.id, fight.fighter1_id)}
            >
              <div className="fighter-card-flag-background">
                <ReactCountryFlag 
                  countryCode={getCountryCode(fight.fighter1_country)} 
                  svg 
                  style={{
                    width: '100%',
                    height: '100%',
                    opacity: 0.3,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    borderRadius: '16px',
                    filter: 'blur(2px) brightness(1.1)',
                    objectFit: 'cover'
                  }}
                />
              </div>
              <div className="fighter-image-container">
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
                  <span>{fight.fighter1_rank === 0 ? <span className="champion-rank">C</span> : (fight.fighter1_rank || 'N/A')}</span>
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
                    <span className="stat-label">Style</span>
                    <span>{fight.fighter1_style || 'N/A'}</span>
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
                fight.is_completed
                  ? String(fight.winner) === String(fight.fighter2_id)
                    ? 'winner'
                    : 'loser'
                  : (selectedFights[fight.id] === fight.fighter2_id || submittedFights[fight.id] === fight.fighter2_id)
                    ? 'selected'
                    : (submittedFights[fight.id] && submittedFights[fight.id] !== fight.fighter2_id)
                      ? 'unselected'
                      : ''
              }`}
              onClick={() => !fight.is_completed && !fight.is_canceled && handleSelection(fight.id, fight.fighter2_id)}
            >
              <div className="fighter-card-flag-background">
                <ReactCountryFlag 
                  countryCode={getCountryCode(fight.fighter2_country)} 
                  svg 
                  style={{
                    width: '100%',
                    height: '100%',
                    opacity: 0.3,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    borderRadius: '16px',
                    filter: 'blur(2px) brightness(1.1)',
                    objectFit: 'cover'
                  }}
                />
              </div>
              <div className="fighter-image-container">
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
                  <span>{fight.fighter2_rank === 0 ? <span className="champion-rank">C</span> : (fight.fighter2_rank || 'N/A')}</span>
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
                    <span className="stat-label">Style</span>
                    <span>{fight.fighter2_style || 'N/A'}</span>
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
                // Use vote counts if available (user has voted), otherwise show 50/50
                let split = 50;
                
                if (submittedFights[fight.id] || fight.is_completed) {
                  // User has voted or fight is completed - show actual ratio
                  if (voteCounts[fight.id]) {
                    // Use vote counts (lightweight, always available after voting)
                    const total = voteCounts[fight.id].fighter1 + voteCounts[fight.id].fighter2;
                    if (total > 0) {
                      split = Math.round((voteCounts[fight.id].fighter1 / total) * 100);
                    }
                  } else if (fightVotes[fight.id]) {
                    // Fallback to full vote data if available (user clicked "Show Votes")
                    const fighter1FilteredVotes = fightVotes[fight.id]?.fighter1Votes?.filter(vote => showAIVotes || !vote.is_bot) || [];
                    const fighter2FilteredVotes = fightVotes[fight.id]?.fighter2Votes?.filter(vote => showAIVotes || !vote.is_bot) || [];
                    const totalVotes = fighter1FilteredVotes.length + fighter2FilteredVotes.length;
                    if (totalVotes > 0) {
                      split = Math.round((fighter1FilteredVotes.length / totalVotes) * 100);
                    }
                  }
                } else {
                  // User hasn't voted yet - show 50/50 (locked state)
                  split = 50;
                }
                return (
                  <>
                    <div
                      className="vote-bar blended-bar"
                      style={{
                        width: '100%',
                        height: '100%',
                        background: `linear-gradient(90deg, rgba(239, 68, 68, 0.8) ${split}%, rgba(59, 130, 246, 0.8) ${split}%)`,
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
                          <VoteCard key={index} vote={vote} username={username} />
                        ))}
                    </div>
                  </div>
                  <div className="fighter-votes fighter2-votes">
                    <h4>{fight.fighter2_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter2Votes
                        .filter(vote => showAIVotes || !vote.is_bot)
                        .map((vote, index) => (
                          <VoteCard key={index} vote={vote} username={username} />
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Admin Controls - only show for admin users */}
          {user_type === 'admin' && (
            <div className="admin-controls">
              <button 
                className="expand-admin-button"
                onClick={(e) => toggleAdminControls(fight.id, e)}
              >
                {expandedAdminControls[fight.id] ? '▼' : '▶'} Admin Controls
              </button>
              
              {expandedAdminControls[fight.id] && (
                <div className="admin-controls-content">
                  {fight.is_canceled ? (
                    <div className="admin-canceled-display">
                      <span className="canceled-text">Fight Canceled</span>
                    </div>
                  ) : fight.winner && editingFight !== fight.id ? (
                    <div className="admin-result-display">
                      <span className="winner-text">
                        Winner: {String(fight.winner) === String(fight.fighter1_id) ? fight.fighter1_name : fight.fighter2_name}
                      </span>
                      <div className="admin-action-buttons">
                        <button 
                          className="admin-edit-button"
                          onClick={() => setEditingFight(fight.id)}
                        >
                          Edit Result
                        </button>
                        <button 
                          className="admin-cancel-fight-button"
                          onClick={() => handleFightCancel(fight.id)}
                        >
                          Cancel Fight
                        </button>
                      </div>
                    </div>
                  ) : (editingFight === fight.id || !fight.winner) && (
                    <div className="admin-result-editor">
                      <div className="admin-buttons">
                        <button
                          className={`admin-winner-button ${String(fight.winner) === String(fight.fighter1_id) ? 'selected' : ''}`}
                          onClick={() => handleResultUpdate(fight.id, fight.fighter1_id)}
                        >
                          {fight.fighter1_name} Won
                        </button>
                        <button
                          className={`admin-winner-button ${String(fight.winner) === String(fight.fighter2_id) ? 'selected' : ''}`}
                          onClick={() => handleResultUpdate(fight.id, fight.fighter2_id)}
                        >
                          {fight.fighter2_name} Won
                        </button>
                      </div>
                      <div className="admin-action-buttons">
                        {fight.winner && (
                          <button
                            className="admin-unselect-button"
                            onClick={() => handleResultUpdate(fight.id, null)}
                          >
                            Unselect Winner
                          </button>
                        )}
                        <button 
                          className="admin-cancel-fight-button"
                          onClick={() => handleFightCancel(fight.id)}
                        >
                          Cancel Fight
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {fights.length === 0 && !loading && (
        <div className="no-fights-message">
          No fights available for this event yet. Check back later for updates!
        </div>
      )}
    </div>
  );
}

export default Fights;