import React, { useState, useEffect } from 'react';
import './EventSelector.css';
import { API_URL } from './config';

function EventSelector({ onEventSelect, selectedEventId }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch(`${API_URL}/events`);
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const data = await response.json();
      
      // Sort events by date and filter for upcoming events
      const sortedEvents = data.sort((a, b) => new Date(a.date) - new Date(b.date));
      const upcomingEvents = sortedEvents.filter(event => event.status === 'Upcoming');
      
      setEvents(data);
      setIsLoading(false);
      
      // If no event is selected and we have upcoming events, select the closest one
      if (!selectedEventId && upcomingEvents.length > 0) {
        onEventSelect(upcomingEvents[0].id);
      }
      // If no upcoming events but we have events, select the first one as fallback
      else if (!selectedEventId && data.length > 0) {
        onEventSelect(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('Failed to load events');
      setIsLoading(false);
    }
  };

  const selectedEvent = events.find(event => event.id === selectedEventId);

  if (isLoading) {
    return (
      <div className="event-selector-container">
        <div className="loading-message">Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="event-selector-container">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="event-selector-container">
      <div 
        className={`dropdown ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>
          {selectedEvent ? (
            <>
              {selectedEvent.name}
              <span className={`status-badge ${selectedEvent.status === 'Complete' ? 'completed' : 'active'}`}>
                {selectedEvent.status}
              </span>
            </>
          ) : 'Select Event'}
        </span>
        <span className={`chevron ${isOpen ? 'open' : ''}`}>▼</span>
      </div>

      <div className={`options-container ${isOpen ? 'visible' : 'hidden'}`}>
        {events.map((event) => (
          <div
            key={event.id}
            className={`option ${event.id === selectedEventId ? 'selected' : ''}`}
            onClick={() => {
              onEventSelect(event.id);
              setIsOpen(false);
            }}
            onMouseEnter={() => setHoveredId(event.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <span>
              {event.name}
            </span>
            <span className={`status-badge ${event.status === 'Complete' ? 'completed' : 'active'}`}>
              {event.status}
            </span>
          </div>
        ))}
      </div>

      {isOpen && (
        <div
          className="overlay"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

export default EventSelector;