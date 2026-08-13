import React, { useEffect, useId, useState } from 'react';
import { Check, ChevronDown, LockKeyhole } from 'lucide-react';
import { API_URL } from '../config';
import { cachedFetchJson, invalidateCache } from '../utils/apiCache';
import { fetchWithUserSession } from '../utils/userSession';
import './PlayerCardSelector.css';

function PlayerCardSelector({ currentPlayercard, currentPlayercardId, userId, onChange }) {
  const contentId = useId();
  const [playercards, setPlayercards] = useState([]);
  const [events, setEvents] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(currentPlayercardId);
  const [saving, setSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setSelectedId(currentPlayercardId);
  }, [currentPlayercardId]);

  useEffect(() => {
    setPlayercards([]);
    setEvents([]);
    setHasLoaded(false);
    setError('');
  }, [userId]);

  useEffect(() => {
    if (!isExpanded || hasLoaded || !userId) return undefined;

    let isCancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      cachedFetchJson(`${API_URL}/playercards?user_id=${encodeURIComponent(userId)}`, { ttlMs: 120000 }),
      cachedFetchJson(`${API_URL}/events`, { ttlMs: 120000 }),
    ])
      .then(([playercardData, eventData]) => {
        if (isCancelled) return;
        setPlayercards(Array.isArray(playercardData) ? playercardData : []);
        setEvents(Array.isArray(eventData) ? eventData : []);
        setHasLoaded(true);
      })
      .catch(() => {
        if (!isCancelled) setError('Could not load playercards. Close and try again.');
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [hasLoaded, isExpanded, userId]);

  const handleSelect = async (card) => {
    if (card.id === selectedId || saving) return;

    if (!card.is_available) {
      setError(`Vote in ${getRequiredEventName(card.required_event_id)} to unlock this playercard.`);
      return;
    }

    const previousId = selectedId;
    const previousCard = playercards.find((candidate) => candidate.id === previousId) || currentPlayercard;

    setSelectedId(card.id);
    setSaving(true);
    setError('');
    onChange?.(card);

    try {
      const response = await fetchWithUserSession(`${API_URL}/user/${userId}/playercard`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playercard_id: card.id }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update playercard');
      }

      invalidateCache(`${API_URL}/playercards?user_id=${encodeURIComponent(userId)}`);
      setIsExpanded(false);
    } catch (saveError) {
      setSelectedId(previousId);
      if (previousCard) onChange?.(previousCard);
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const getRequiredEventName = (requiredEventId) => {
    const event = events.find((candidate) => candidate.id === requiredEventId);
    return event ? event.name : 'the required event';
  };

  const selectedCard = playercards.find((card) => card.id === selectedId) || currentPlayercard;
  const unlockedCount = playercards.filter((card) => card.is_available).length;
  const orderedCards = [...playercards].sort((first, second) => {
    if (first.id === selectedId) return -1;
    if (second.id === selectedId) return 1;
    return 0;
  });
  const headerMeta = loading
    ? 'Loading cards…'
    : hasLoaded
      ? `${unlockedCount} of ${playercards.length} unlocked`
      : 'Tap to browse';

  return (
    <div className={`playercard-selector-root${isExpanded ? ' is-open' : ''}`} aria-busy={saving || loading}>
      <button
        type="button"
        className="playercard-selector-header"
        onClick={() => setIsExpanded((previous) => !previous)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <span
          className="playercard-selector-current-art"
          aria-hidden="true"
          style={selectedCard?.image_url ? { backgroundImage: `url('${selectedCard.image_url}')` } : undefined}
        />
        <span className="playercard-selector-header-main">
          <span className="playercard-selector-header-title">Playercard</span>
          <span className="playercard-selector-header-text">{selectedCard?.name || 'Choose your card'}</span>
          <span className="playercard-selector-header-meta">{saving ? 'Saving selection…' : headerMeta}</span>
        </span>
        <span className="playercard-selector-header-action" aria-hidden="true">
          <span>{isExpanded ? 'Close' : 'Change'}</span>
          <ChevronDown size={16} strokeWidth={2} />
        </span>
      </button>

      <div
        id={contentId}
        className="playercard-selector-content"
        hidden={!isExpanded}
      >
        {error && <div className="playercard-selector-error" role="alert">{error}</div>}

        {loading && (
          <div className="playercard-selector-loading" role="status">Loading playercards…</div>
        )}

        {!loading && hasLoaded && playercards.length === 0 && (
          <div className="playercard-selector-empty">No playercards are available yet.</div>
        )}

        {!loading && playercards.length > 0 && (
          <div className="playercard-selector-grid">
            {orderedCards.map((card) => {
              const isLocked = !card.is_available;
              const isSelected = card.id === selectedId;
              const eventName = isLocked ? getRequiredEventName(card.required_event_id) : '';
              const statusLabel = isSelected ? 'Selected' : isLocked ? `Vote in ${eventName}` : 'Available';

              return (
                <button
                  type="button"
                  key={card.id}
                  className={`playercard-selector-item${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
                  onClick={() => handleSelect(card)}
                  aria-pressed={isSelected}
                  aria-disabled={isLocked || saving}
                  aria-label={`${card.name}. ${statusLabel}.`}
                  disabled={saving}
                >
                  <span
                    className="playercard-selector-card-art"
                    aria-hidden="true"
                    style={card.image_url ? { backgroundImage: `url('${card.image_url}')` } : undefined}
                  >
                    {isSelected && (
                      <span className="playercard-selector-state-icon selected"><Check size={14} strokeWidth={3} /></span>
                    )}
                    {isLocked && (
                      <span className="playercard-selector-state-icon locked"><LockKeyhole size={13} strokeWidth={2.5} /></span>
                    )}
                  </span>
                  <span className="playercard-selector-item-copy">
                    <span className="playercard-selector-label" title={card.name}>{card.name}</span>
                    <span className="playercard-selector-status">{statusLabel}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <span className="sr-only" aria-live="polite">
        {saving ? 'Saving playercard selection' : ''}
      </span>
    </div>
  );
}

export default PlayerCardSelector;
