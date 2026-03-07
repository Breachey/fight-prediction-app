import React, { useEffect, useState } from 'react';
import PlayerCard from './PlayerCard';
import { API_URL } from '../config';
import { cachedFetchJson, invalidateCache } from '../utils/apiCache';
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
      cachedFetchJson(`${API_URL}/playercards?user_id=${encodeURIComponent(userId)}`, { ttlMs: 120000 }),
      cachedFetchJson(`${API_URL}/events`, { ttlMs: 120000 })
    ])
      .then(([playercardData, eventsData]) => {
        setPlayercards(playercardData);
        setEvents(eventsData);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load playercards');
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    setSelectedId(currentPlayercardId);
  }, [currentPlayercardId]);

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
      invalidateCache(`${API_URL}/playercards?user_id=${encodeURIComponent(userId)}`);
      invalidateCache(`${API_URL}/events`);
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

  const selectedCard = playercards.find(card => card.id === selectedId);
  const unlockedCount = playercards.filter(card => card.is_available).length;

  if (loading) return <div className="playercard-selector-loading">Loading playercards...</div>;
  if (error && !playercards.length) return <div className="playercard-selector-error">{error}</div>;

  return (
    <div className={`playercard-selector-root${isExpanded ? ' is-open' : ''}`}>
      <button 
        className="playercard-selector-header"
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? 'Collapse playercard selector' : 'Expand playercard selector'}
      >
        <span className="playercard-selector-header-main">
          <span className="playercard-selector-header-title">Playercard Vault</span>
          <span className="playercard-selector-header-text">
            {selectedCard
              ? `Current: ${selectedCard.name}`
              : `${unlockedCount} of ${playercards.length} unlocked`}
          </span>
        </span>
        <span className={`playercard-selector-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>

      {error && playercards.length > 0 && (
        <div className="playercard-selector-error">{error}</div>
      )}

      <div className={`playercard-selector-content ${isExpanded ? 'expanded' : ''}`}>
        <div className="playercard-selector-mobile-hint">Swipe to browse cards</div>
        <div className="playercard-selector-grid">
          {playercards.map(card => {
            const isLocked = !card.is_available;
            const isSelected = card.id === selectedId;
            const cardStatusLabel = isSelected ? 'Selected' : (isLocked ? 'Locked' : 'Tap to select');
            
            return (
              <button
                type="button"
                key={card.id}
                className={`playercard-selector-item${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
                onClick={() => handleSelect(card.id)}
                aria-pressed={isSelected}
                aria-label={`Select playercard: ${card.name}${isLocked ? ' (Locked)' : ''}${isSelected ? ' (Selected)' : ''}`}
                disabled={saving}
                style={{ 
                  opacity: saving && !isSelected ? 0.6 : 1
                }}
              >
                <div className="playercard-selector-card-shell">
                  <PlayerCard
                    username=""
                    playercard={card}
                    size="large"
                    isCurrentUser={isSelected}
                  />
                </div>
                <div className="playercard-selector-item-footer">
                  <div className="playercard-selector-label">{card.name}</div>
                  <div className={`playercard-selector-pill ${isSelected ? 'selected' : ''}${isLocked ? ' locked' : ''}`}>
                    {cardStatusLabel}
                  </div>
                </div>
                {isLocked && card.required_event_id != null && (
                  <div className="playercard-selector-locked-overlay">
                    <div className="playercard-selector-lock-text">
                      Vote in {getRequiredEventName(card.required_event_id)} to unlock
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {saving && <div className="playercard-selector-saving">Saving...</div>}
    </div>
  );
}

export default PlayerCardSelector; 
