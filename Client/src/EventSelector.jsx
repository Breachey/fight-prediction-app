import React, { useState, useEffect, useRef } from 'react';
import './EventSelector.css';
import { API_URL } from './config';

function EventSelector({ onEventSelect, selectedEventId }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef(null);
  const cardRefs = useRef([]);
  const touchStartX = useRef(null);

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
    if (cardRefs.current[currentIndex]) {
      cardRefs.current[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
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
        const upcoming = sortedEvents.find(e => e.status === 'Upcoming');
        onEventSelect(upcoming ? upcoming.id : sortedEvents[0].id);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('Failed to load events');
      setIsLoading(false);
    }
  };

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
        <div className="event-selector-heading">Event Selector</div>
        <div className="loading-message">Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="event-selector-carousel-container">
        <div className="event-selector-heading">Event Selector</div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <>
      <div className="event-selector-heading">Event Selector</div>
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
              const dateObj = new Date(event.date);
              dateStr = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            }
            // Format location
            const locationParts = [event.venue, event.location_city, event.location_state].filter(Boolean);
            const locationStr = locationParts.join(', ');
            return (
              <div
                key={event.id}
                className={`event-card${idx === currentIndex ? ' selected' : ''}`}
                onClick={() => handleSelect(idx)}
                tabIndex={0}
                role="button"
                aria-pressed={idx === currentIndex}
                ref={el => cardRefs.current[idx] = el}
              >
                <span className="event-title">{event.name}</span>
                {dateStr && <span className="event-date">{dateStr}</span>}
                {locationStr && <span className="event-location">{locationStr}</span>}
                <span className={`status-badge ${event.status === 'Complete' ? 'completed' : 'active'}`}>{event.status}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default EventSelector;