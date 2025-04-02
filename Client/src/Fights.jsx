import React, { useEffect, useState } from 'react';
import './Fights.css';

function Fights({ eventId, username }) {
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFights, setSelectedFights] = useState({});
  const [submittedFights, setSubmittedFights] = useState(() => {
    // Load submitted fights from localStorage on component mount
    const saved = localStorage.getItem(`submittedFights_${username}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [voteErrors, setVoteErrors] = useState({});

  // Save submittedFights to localStorage whenever it changes
  useEffect(() => {
    if (username) {
      localStorage.setItem(`submittedFights_${username}`, JSON.stringify(submittedFights));
    }
  }, [submittedFights, username]);

  useEffect(() => {
    if (eventId) {
      fetchFights();
    }
  }, [eventId]);

  // Clear selected fights when username changes
  useEffect(() => {
    setSelectedFights({});
    // Load submitted fights for new user
    const saved = localStorage.getItem(`submittedFights_${username}`);
    setSubmittedFights(saved ? JSON.parse(saved) : {});
  }, [username]);

  const fetchFights = async () => {
    try {
      const response = await fetch(`https://fight-prediction-app-b0vt.onrender.com/events/${eventId}/fights`);
      if (!response.ok) {
        throw new Error('Failed to fetch fights');
      }
      const data = await response.json();
      setFights(data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching fights:', err);
      setError('Failed to load fights');
      setLoading(false);
    }
  };

  // Function to handle selection (but not submission) of a fighter
  const handleSelection = (fightId, fighterName) => {
    // Only allow selection if vote hasn't been submitted
    if (submittedFights[fightId]) return;
    setSelectedFights(prev => ({ ...prev, [fightId]: fighterName }));
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
      const response = await fetch('https://fight-prediction-app-b0vt.onrender.com/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          fightId: parseInt(fightId, 10), // Ensure fightId is sent as a number
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
      // Clear any previous vote error for this fight
      setVoteErrors(prev => ({ ...prev, [fightId]: '' }));
      // Clear the selection since it's now submitted
      setSelectedFights(prev => {
        const newState = { ...prev };
        delete newState[fightId];
        return newState;
      });
    } catch (err) {
      console.error('Error submitting prediction:', err);
      setVoteErrors(prev => ({ ...prev, [fightId]: `Failed to submit prediction: ${err.message}` }));
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
        <div key={fight.id} className="fight-card">
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
              } ${fight.is_completed ? 'completed' : ''
              } ${fight.is_completed && fight.winner === fight.fighter1_name ? 'winner' : ''}`}
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
              } ${fight.is_completed ? 'completed' : ''
              } ${fight.is_completed && fight.winner === fight.fighter2_name ? 'winner' : ''}`}
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
            <div className="completed-fight-message">
              Vote submitted: {submittedFights[fight.id]}
            </div>
          )}

          {fight.is_completed && (
            <div className="completed-fight-message">
              This fight has been completed. Winner: {fight.winner}
            </div>
          )}
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