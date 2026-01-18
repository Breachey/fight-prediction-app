import React, { useState, useEffect, useRef } from 'react';
import './EventSelector.css';
import { API_URL } from './config';

function EventSelector({ onEventSelect, selectedEventId, userType = 'user' }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef(null);
  const cardRefs = useRef([]);
  const touchStartX = useRef(null);
  const [finalizingEventId, setFinalizingEventId] = useState(null);
  const [finalizeFeedback, setFinalizeFeedback] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    // Update currentIndex if selectedEventId changes externally
    const idx = events.findIndex(e => e.id === selectedEventId);
    if (idx !== -1 && idx !== currentIndex) setCurrentIndex(idx);
  }, [selectedEventId, events]);

  // Scroll selected card into view when currentIndex or events change
  useEffect(() => {
    // Use a small delay to ensure DOM is fully rendered
    const timer = setTimeout(() => {
      if (cardRefs.current[currentIndex]) {
        const card = cardRefs.current[currentIndex];
        card.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest', 
          inline: 'center' 
        });
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [currentIndex, events]);

  const fetchEvents = async () => {
    try {
      const response = await fetch(`${API_URL}/events`);
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const data = await response.json();
      const sortedEvents = data.sort((a, b) => new Date(a.date) - new Date(b.date));
      console.log('Fetched events:', sortedEvents);
      setEvents(sortedEvents);
      setIsLoading(false);
      // Auto-select first upcoming or first event
      if (!selectedEventId && sortedEvents.length > 0) {
        const upcomingIndex = sortedEvents.findIndex(e => e.status === 'Upcoming');
        const targetIndex = upcomingIndex !== -1 ? upcomingIndex : 0;
        const targetEvent = sortedEvents[targetIndex];
        setCurrentIndex(targetIndex);
        onEventSelect(targetEvent.id);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('Failed to load events');
      setIsLoading(false);
    }
  };

  const selectedEvent = events[currentIndex] || null;

  const handleFinalizeEvent = async (event) => {
    if (!event || !event.id) return;
    setFinalizeFeedback(null);
    setFinalizingEventId(event.id);
    try {
      const response = await fetch(`${API_URL}/events/${event.id}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'Final' })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Failed to finalize event');
      }

      const data = await response.json();
      const winnerCount = data.winners?.length || 0;
      setFinalizeFeedback({
        type: 'success',
        message: winnerCount > 0
          ? `Event finalized! Crowned ${winnerCount} winner${winnerCount === 1 ? '' : 's'}.`
          : 'Event finalized, but no eligible winners were found.'
      });
      await fetchEvents();
    } catch (err) {
      setFinalizeFeedback({
        type: 'error',
        message: err.message || 'Failed to finalize event'
      });
    } finally {
      setFinalizingEventId(null);
    }
  };

  useEffect(() => {
    setFinalizeFeedback(null);
  }, [selectedEventId]);

  const handleSelect = (idx) => {
    setCurrentIndex(idx);
    onEventSelect(events[idx].id);
  };

  const handlePrev = (e) => {
    e.stopPropagation();
    if (currentIndex > 0) handleSelect(currentIndex - 1);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    if (currentIndex < events.length - 1) handleSelect(currentIndex + 1);
  };

  // Touch/swipe handlers
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (deltaX > 50 && currentIndex > 0) {
      handleSelect(currentIndex - 1);
    } else if (deltaX < -50 && currentIndex < events.length - 1) {
      handleSelect(currentIndex + 1);
    }
    touchStartX.current = null;
  };

  if (isLoading) {
    return (
      <div className="event-selector-carousel-container">
        <div className="event-selector-heading">Choose an Event</div>
        <div className="loading-message">Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="event-selector-carousel-container">
        <div className="event-selector-heading">Choose an Event</div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <>
      {/* SVG Filter for electric border effect */}
      <svg className="electric-border-svg" style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter
            id="electric-border-filter"
            colorInterpolationFilters="sRGB"
            filterUnits="objectBoundingBox"
            x="0"
            y="0"
            width="1"
            height="1"
          >
            <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves="4" result="noise1" seed="1" />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
              <animate attributeName="dy" values="250; 0" dur="4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves="4" result="noise2" seed="1" />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
              <animate attributeName="dy" values="0; -250" dur="4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves="4" result="noise3" seed="2" />
            <feOffset in="noise3" dx="0" dy="0" result="offsetNoise3">
              <animate attributeName="dx" values="180; 0" dur="4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves="4" result="noise4" seed="2" />
            <feOffset in="noise4" dx="0" dy="0" result="offsetNoise4">
              <animate attributeName="dx" values="0; -180" dur="4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
            <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
            <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />

            <feDisplacementMap in="SourceGraphic" in2="combinedNoise" scale="8" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </defs>
      </svg>

      <div className="event-selector-heading">Choose an Event</div>
      <div className="event-selector-carousel-container">
        <div
          className="event-carousel"
          ref={carouselRef}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {events.map((event, idx) => {
            // Format date (exclude time)
            let dateStr = '';
            if (event.date) {
              // Parse date as local time to avoid timezone offset issues
              const [year, month, day] = event.date.split('T')[0].split('-');
              const dateObj = new Date(year, month - 1, day); // month is 0-indexed
              dateStr = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            }
            // Format location
            const locationParts = [event.venue, event.location_city, event.location_state].filter(Boolean);
            const locationStr = locationParts.join(', ');
            const isSelected = idx === currentIndex;
            return (
              <div
                key={event.id}
                className={`event-card${event.image_url ? ' has-image' : ''}${isSelected ? ' selected' : ''}${event.status === 'Complete' ? ' completed' : ''}`}
                onClick={() => handleSelect(idx)}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                ref={el => cardRefs.current[idx] = el}
              >
                {/* Electric border layers for selected card */}
                {isSelected && (
                  <>
                    <div className="electric-border-outer">
                      <div className="electric-border-inner"></div>
                    </div>
                    <div className="electric-glow-1"></div>
                    <div className="electric-glow-2"></div>
                    <div className="electric-background-glow"></div>
                  </>
                )}
                
                {event.image_url ? (
                  <div className="event-image-container">
                    <img 
                      src={event.image_url} 
                      alt={`${event.name} logo`}
                      className="event-image"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        // Show text content when image fails to load
                        const card = e.target.closest('.event-card');
                        const textContent = card.querySelector('.event-text-content');
                        if (textContent) {
                          textContent.style.display = 'flex';
                        }
                      }}
                    />
                    {/* Status badge overlay */}
                    <div className={`status-badge-overlay ${event.status === 'Complete' ? 'completed' : (event.has_fight_data === false ? 'coming-soon' : 'upcoming')}`}>
                      {event.status === 'Complete' ? 'Completed' : (event.has_fight_data === false ? 'Coming Soon' : 'Upcoming')}
                    </div>
                  </div>
                ) : (
                  <div className="event-text-content">
                    <span className="event-title">{event.name}</span>
                    {dateStr && <span className="event-date">{dateStr}</span>}
                    {locationStr && <span className="event-location">{locationStr}</span>}
                    <div className="event-badges">
                      <span className={`status-badge ${event.status === 'Complete' ? 'completed' : 'active'}`}>
                        {event.status === 'Complete' ? 'Completed' : (event.has_fight_data === false ? 'Coming Soon' : 'Upcoming')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {userType === 'admin' && selectedEvent && (
        <div className="event-admin-panel">
          <div className="event-admin-panel__content">
            <div className="event-admin-panel__text">
              <span className="event-admin-panel__label">Admin</span>
              <span className="event-admin-panel__title">{selectedEvent.name}</span>
              <p className="event-admin-panel__hint">
                Mark the event as Final once scores are verified to award crowns automatically.
              </p>
            </div>
            <div className="event-admin-panel__actions">
              {finalizeFeedback && (
                <div className={`event-admin-feedback ${finalizeFeedback.type}`}>
                  {finalizeFeedback.message}
                </div>
              )}
              <button
                className="event-admin-finalize-button"
                onClick={() => handleFinalizeEvent(selectedEvent)}
                disabled={finalizingEventId === selectedEvent.id}
              >
                {finalizingEventId === selectedEvent.id
                  ? 'Finalizing...'
                  : selectedEvent.is_completed
                  ? 'Recalculate Winners'
                  : 'Mark Final & Crown Winners'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default EventSelector;