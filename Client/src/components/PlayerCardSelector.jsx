import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollAnimationFrame = useRef(null);
  // Ref for horizontal scroll container
  const scrollRef = useRef(null);

  const scrollToIndex = useCallback((index, behavior = 'smooth') => {
    if (!scrollRef.current || index < 0) return;
    const child = scrollRef.current.children[index];
    if (child?.scrollIntoView) {
      child.scrollIntoView({
        behavior,
        inline: 'center',
        block: 'nearest'
      });
    }
  }, []);

  const handleArrow = useCallback((direction) => {
    if (!playercards.length) return;
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
      nextIndex = playercards.length - 1;
    } else if (nextIndex >= playercards.length) {
      nextIndex = 0;
    }
    setCurrentIndex(nextIndex);
    scrollToIndex(nextIndex);
  }, [currentIndex, playercards.length, scrollToIndex]);

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
      const index = playercards.findIndex(c => c.id === id);
      if (index !== -1) {
        setCurrentIndex(index);
        scrollToIndex(index);
      }
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

  useEffect(() => {
    if (!playercards.length) return;
    const index = playercards.findIndex(card => card.id === selectedId);
    const safeIndex = index === -1 ? 0 : index;
    setCurrentIndex(safeIndex);
    scrollToIndex(safeIndex, 'auto');
  }, [playercards, selectedId, scrollToIndex]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollAnimationFrame.current) {
        cancelAnimationFrame(scrollAnimationFrame.current);
      }
      scrollAnimationFrame.current = requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        const center = scrollRef.current.scrollLeft + scrollRef.current.offsetWidth / 2;
        let closestIndex = 0;
        let closestDistance = Number.POSITIVE_INFINITY;
        playercards.forEach((_, idx) => {
          const child = scrollRef.current?.children[idx];
          if (!child) return;
          const childCenter = child.offsetLeft + child.offsetWidth / 2;
          const distance = Math.abs(center - childCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = idx;
          }
        });
        setCurrentIndex(prev => (prev === closestIndex ? prev : closestIndex));
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollAnimationFrame.current) {
        cancelAnimationFrame(scrollAnimationFrame.current);
      }
    };
  }, [playercards]);

  const isAtStart = currentIndex === 0;
  const isAtEnd = currentIndex === playercards.length - 1;

  if (loading) return <div className="playercard-selector-loading">Loading playercards...</div>;
  if (error) return <div className="playercard-selector-error">{error}</div>;

  return (
    <div className="playercard-selector-root">
      {/* Navigation arrows (hidden on small mobile via CSS) */}
      <button 
        className="playercard-selector-nav left" 
        onClick={() => handleArrow(-1)} 
        aria-label="Scroll left"
        data-edge={isAtStart ? 'true' : 'false'}
      >
        ‹
      </button>
      <div className="playercard-selector-scroll" ref={scrollRef}>
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
      <button 
        className="playercard-selector-nav right" 
        onClick={() => handleArrow(1)} 
        aria-label="Scroll right"
        data-edge={isAtEnd ? 'true' : 'false'}
      >
        ›
      </button>
      {saving && <div className="playercard-selector-saving">Saving...</div>}
    </div>
  );
}

export default PlayerCardSelector; 