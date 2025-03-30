import React, { useState, useEffect } from 'react';

function EventSelector({ onEventSelect, selectedEventId }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch('https://fight-prediction-app-b0vt.onrender.com/events');
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      const data = await response.json();
      setEvents(data);
      setIsLoading(false);
      
      // If no event is selected and we have events, select the first one
      if (!selectedEventId && data.length > 0) {
        onEventSelect(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('Failed to load events');
      setIsLoading(false);
    }
  };

  const containerStyle = {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto 20px auto',
    boxSizing: 'border-box',
    position: 'relative'
  };

  const dropdownStyle = {
    width: '100%',
    padding: '16px',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    border: '1px solid #4c1d95',
    borderRadius: '12px',
    fontSize: '1.1rem',
    cursor: 'pointer',
    outline: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.3s ease',
    boxShadow: isOpen ? '0 0 0 2px #6d28d9' : 'none',
    background: 'linear-gradient(145deg, #1a1a1a 0%, #2d1f47 100%)'
  };

  const optionsContainerStyle = {
    position: 'absolute',
    top: 'calc(100% - 10px)',
    left: '20px',
    right: '20px',
    backgroundColor: '#1a1a1a',
    borderRadius: '12px',
    border: '1px solid #4c1d95',
    overflow: 'hidden',
    zIndex: 10,
    opacity: isOpen ? 1 : 0,
    transform: isOpen ? 'translateY(0)' : 'translateY(-10px)',
    visibility: isOpen ? 'visible' : 'hidden',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 20px rgba(139, 92, 246, 0.1)'
  };

  const optionStyle = (isSelected) => ({
    padding: '14px 16px',
    cursor: 'pointer',
    backgroundColor: isSelected ? '#4c1d95' : 'transparent',
    color: '#ffffff',
    transition: 'all 0.2s ease',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #2d1f47',
    ':hover': {
      backgroundColor: '#2d1f47'
    }
  });

  const chevronStyle = {
    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
    transition: 'transform 0.3s ease'
  };

  const statusBadgeStyle = (isCompleted) => ({
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '0.8rem',
    backgroundColor: isCompleted ? '#4c1d95' : '#6d28d9',
    color: '#ffffff',
    marginLeft: '8px'
  });

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    marginTop: '10px',
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)'
  };

  const selectedEvent = events.find(event => event.id === selectedEventId);

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div 
        style={dropdownStyle}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>
          {selectedEvent ? (
            <>
              {selectedEvent.name} - {new Date(selectedEvent.date).toLocaleDateString()}
              <span style={statusBadgeStyle(selectedEvent.is_completed)}>
                {selectedEvent.is_completed ? 'Completed' : 'Active'}
              </span>
            </>
          ) : 'Select Event'}
        </span>
        <span style={chevronStyle}>▼</span>
      </div>

      <div style={optionsContainerStyle}>
        {events.map((event) => (
          <div
            key={event.id}
            style={optionStyle(event.id === selectedEventId)}
            onClick={() => {
              onEventSelect(event.id);
              setIsOpen(false);
            }}
          >
            <span>
              {event.name} - {new Date(event.date).toLocaleDateString()}
            </span>
            <span style={statusBadgeStyle(event.is_completed)}>
              {event.is_completed ? 'Completed' : 'Active'}
            </span>
          </div>
        ))}
      </div>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 5
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

export default EventSelector; 