import React, { useState, useEffect } from 'react';

function EventSelector({ onEventSelect, selectedEventId }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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
    boxSizing: 'border-box'
  };

  const selectStyle = {
    width: '100%',
    padding: '12px',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    border: '1px solid #3b3b3b',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    outline: 'none'
  };

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    marginTop: '10px'
  };

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
      <select 
        style={selectStyle}
        value={selectedEventId || ''}
        onChange={(e) => onEventSelect(Number(e.target.value))}
      >
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name} - {new Date(event.date).toLocaleDateString()}
            {event.is_completed ? ' (Completed)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export default EventSelector; 