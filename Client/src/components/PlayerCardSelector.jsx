import React, { useEffect, useState } from 'react';
import PlayerCard from './PlayerCard';
import { API_URL } from '../config';
import './PlayerCardSelector.css';

function PlayerCardSelector({ currentPlayercardId, userId, onChange }) {
  const [playercards, setPlayercards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(currentPlayercardId);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(prev => !prev);
  };

  useEffect(() => {
    setLoading(true);
    // Fetch playercards with user availability and events data
    Promise.all([
      fetch(`${API_URL}/playercards?user_id=${encodeURIComponent(userId)}`),
      fetch(`${API_URL}/events`)
    ])
      .then(async ([playercardRes, eventsRes]) => {
        if (!playercardRes.ok) throw new Error('Failed to load playercards');
        if (!eventsRes.ok) throw new Error('Failed to load events');
        
        const [playercardData, eventsData] = await Promise.all([
          playercardRes.json(),
          eventsRes.json()
        ]);
        
        setPlayercards(playercardData);
        setEvents(eventsData);
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load playercards');
        setLoading(false);
      });
  }, [userId]);

  const handleSelect = async (id) => {
    if (id === selectedId) return;
    
    const card = playercards.find(c => c.id === id);
    if (!card?.is_available) {
      setError(`This playercard is locked. You must vote in the required event to unlock it.`);
      return;
    }
    
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/user/${userId}/playercard`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playercard_id: id })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update playercard');
      }
      setSelectedId(id);
      if (onChange) onChange(card);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getRequiredEventName = (requiredEventId) => {
    const event = events.find(e => e.id === requiredEventId);
    return event ? event.name : `Event ${requiredEventId}`;
  };

  if (loading) return <div className="playercard-selector-loading">Loading playercards...</div>;
  if (error && !playercards.length) return <div className="playercard-selector-error">{error}</div>;

  return (
    <div className="playercard-selector-root">
      {/* Accordion Header */}
      <button 
        className="playercard-selector-header"
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Collapse playercard selector' : 'Expand playercard selector'}
      >
        <span className="playercard-selector-header-text">Change Your Playercard</span>
        <span className={`playercard-selector-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {/* Error message (shown when expanded) */}
      {error && playercards.length > 0 && (
        <div className="playercard-selector-error">{error}</div>
      )}

      {/* Accordion Content */}
      <div className={`playercard-selector-content ${isExpanded ? 'expanded' : ''}`}>
        <div className="playercard-selector-grid">
          {playercards.map(card => {
            const isLocked = !card.is_available;
            const isSelected = card.id === selectedId;
            
            return (
              <div
                key={card.id}
                className={`playercard-selector-item${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
                onClick={() => handleSelect(card.id)}
                tabIndex={0}
                aria-label={`Select playercard: ${card.name}${isLocked ? ' (Locked)' : ''}`}
                style={{ 
                  pointerEvents: saving ? 'none' : 'auto', 
                  opacity: saving && !isSelected ? 0.6 : (isLocked ? 0.7 : 1)
                }}
              >
                <PlayerCard
                  username=""
                  playercard={card}
                  size="large"
                  isCurrentUser={isSelected}
                />
                <div className="playercard-selector-label">{card.name}</div>
                {isLocked && card.required_event_id != null && (
                  <div className="playercard-selector-locked-overlay">
                    <div className="playercard-selector-lock-icon">🔒</div>
                    <div className="playercard-selector-lock-text">
                      Vote in {getRequiredEventName(card.required_event_id)} to unlock
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {saving && <div className="playercard-selector-saving">Saving...</div>}
    </div>
  );
}

export default PlayerCardSelector; 