import React, { useEffect, useState } from 'react';
import { API_URL } from './config';
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

          // Filter predictions for current user
          const userPredictions = predictionsData.filter(pred => pred.username === username);
          
          // Create a map of fight ID to selected fighter
          const submittedVotes = {};
          userPredictions.forEach(pred => {
            submittedVotes[pred.fight_id] = pred.selected_fighter;
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
          selectedFighter,
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
      // Start fade out timer
      handleMessageFadeOut(fightId);
      // Clear any previous vote error for this fight
      setVoteErrors(prev => ({ ...prev, [fightId]: '' }));
      // Clear the selection since it's now submitted
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
            fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&selected_fighter=${encodeURIComponent(fight.fighter1_name)}`),
            fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&selected_fighter=${encodeURIComponent(fight.fighter2_name)}`)
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
        const fight = fights.find(f => f.id === fightId);
        if (!fight) return;

        console.log('Fetching votes for fight:', {
          fightId,
          fighter1: fight.fighter1_name,
          fighter2: fight.fighter2_name,
          encodedFighter1: encodeURIComponent(fight.fighter1_name),
          encodedFighter2: encodeURIComponent(fight.fighter2_name)
        });

        const [fighter1Response, fighter2Response] = await Promise.all([
          fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&selected_fighter=${encodeURIComponent(fight.fighter1_name)}`),
          fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&selected_fighter=${encodeURIComponent(fight.fighter2_name)}`)
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

  if (loading) {
    return <div className="loading-message">Loading fights...</div>;
  }

  // Removed the global error return so that even if there's an error, we still render all fights.
  
  return (
    <div className="fights-container">
      <div className="fights-header">
        <h2 className="fights-title">Upcoming Fights</h2>
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
            <div
              className={`fighter-card ${
                (selectedFights[fight.id] === fight.fighter1_name || submittedFights[fight.id] === fight.fighter1_name) ? 'selected' : ''
              } ${(selectedFights[fight.id] || submittedFights[fight.id]) && 
                  (selectedFights[fight.id] !== fight.fighter1_name && submittedFights[fight.id] !== fight.fighter1_name) ? 'unselected' : ''
              } ${fight.is_completed ? (fight.winner === fight.fighter1_name ? 'winner' : 'loser') : ''}`}
              onClick={() => !fight.is_completed && handleSelection(fight.id, fight.fighter1_name)}
            >
              <img src={fight.fighter1_image} alt={fight.fighter1_name} className="fighter-image" />
              <h3 className="fighter-name">
                {fight.fighter1_name}
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
                <div className="stat-row">
                  <span className="stat-label">Style</span>
                  <span>{fight.fighter1_style ? fight.fighter1_style.split(/(?=[A-Z])/).join(' ') : 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="vs-text">VS</div>

            {/* Fighter 2 Card */}
            <div
              className={`fighter-card ${
                (selectedFights[fight.id] === fight.fighter2_name || submittedFights[fight.id] === fight.fighter2_name) ? 'selected' : ''
              } ${(selectedFights[fight.id] || submittedFights[fight.id]) && 
                  (selectedFights[fight.id] !== fight.fighter2_name && submittedFights[fight.id] !== fight.fighter2_name) ? 'unselected' : ''
              } ${fight.is_completed ? (fight.winner === fight.fighter2_name ? 'winner' : 'loser') : ''}`}
              onClick={() => !fight.is_completed && handleSelection(fight.id, fight.fighter2_name)}
            >
              <img src={fight.fighter2_image} alt={fight.fighter2_name} className="fighter-image" />
              <h3 className="fighter-name">
                {fight.fighter2_name}
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
                <div className="stat-row">
                  <span className="stat-label">Style</span>
                  <span>{fight.fighter2_style ? fight.fighter2_style.split(/(?=[A-Z])/).join(' ') : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Display vote error for this fight if it exists */}
          {voteErrors[fight.id] && (
            <div className="error-message">{voteErrors[fight.id]}</div>
          )}

          {selectedFights[fight.id] && !submittedFights[fight.id] && (
            <div className="selected-fighter-message">
              You picked: {selectedFights[fight.id]}
              <button className="submit-vote-button" onClick={() => handleSubmitVote(fight.id)}>Submit Vote</button>
            </div>
          )}

          {submittedFights[fight.id] && (
            <div className={`completed-fight-message ${fadeOutMessages[fight.id] ? 'fade-out' : ''}`}>
              Vote submitted: {submittedFights[fight.id]}
            </div>
          )}

          {fight.is_completed && (
            <div className="completed-fight-message">
              This fight has been completed. Winner: {fight.winner}
            </div>
          )}

          <div className="fight-votes-section">
            <button 
              className="expand-votes-button"
              onClick={() => toggleFightExpansion(fight.id)}
            >
              {expandedFights[fight.id] ? '▲ Hide Votes' : '▼ Show Votes'}
            </button>

            {expandedFights[fight.id] && fightVotes[fight.id] && (
              <div className="votes-details">
                <div className="vote-distribution">
                  <div 
                    className="vote-bar fighter1-bar" 
                    style={{ 
                      width: `${Math.round((fightVotes[fight.id].fighter1Votes.length / 
                        (fightVotes[fight.id].fighter1Votes.length + fightVotes[fight.id].fighter2Votes.length)) * 100) || 0}%` 
                    }}
                  />
                  <div 
                    className="vote-bar fighter2-bar" 
                    style={{ 
                      width: `${Math.round((fightVotes[fight.id].fighter2Votes.length / 
                        (fightVotes[fight.id].fighter1Votes.length + fightVotes[fight.id].fighter2Votes.length)) * 100) || 0}%` 
                    }}
                  />
                </div>

                <div className="votes-list-container">
                  <div className="fighter-votes">
                    <h4>{fight.fighter1_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter1Votes.map((vote, index) => (
                        <div key={index} className={`vote-item ${vote.username === username ? 'current-user' : ''}`}>
                          {vote.username} {vote.username === username && '(You)'}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="fighter-votes">
                    <h4>{fight.fighter2_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter2Votes.map((vote, index) => (
                        <div key={index} className={`vote-item ${vote.username === username ? 'current-user' : ''}`}>
                          {vote.username} {vote.username === username && '(You)'}
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