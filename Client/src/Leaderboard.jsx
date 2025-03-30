import React, { useEffect, useState } from 'react';

function Leaderboard({ eventId }) {
  const [eventLeaderboard, setEventLeaderboard] = useState([]);
  const [overallLeaderboard, setOverallLeaderboard] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboards();
  }, [eventId]);

  const fetchLeaderboards = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Fetch both leaderboards in parallel
      const [eventResponse, overallResponse] = await Promise.all([
        eventId ? fetch(`https://fight-prediction-app-b0vt.onrender.com/events/${eventId}/leaderboard`) : Promise.resolve(null),
        fetch('https://fight-prediction-app-b0vt.onrender.com/leaderboard')
      ]);

      // Check overall leaderboard response
      if (!overallResponse.ok) {
        const errorData = await overallResponse.json();
        throw new Error(errorData.error || 'Failed to load overall leaderboard');
      }
      const overallData = await overallResponse.json();
      setOverallLeaderboard(overallData || []);

      // Check event leaderboard response if we have an event ID
      if (eventId && eventResponse) {
        if (!eventResponse.ok) {
          const errorData = await eventResponse.json();
          throw new Error(errorData.error || 'Failed to load event leaderboard');
        }
        const eventData = await eventResponse.json();
        setEventLeaderboard(eventData || []);
      } else {
        setEventLeaderboard([]);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  const containerStyle = {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto',
    boxSizing: 'border-box'
  };

  const titleStyle = {
    fontSize: '2rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '30px',
    color: '#ffffff'
  };

  const sectionTitleStyle = {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '20px',
    color: '#ffffff'
  };

  const tableContainerStyle = {
    overflowX: 'auto',
    borderRadius: '16px',
    backgroundColor: '#1a1a1a',
    marginBottom: '40px',
    WebkitOverflowScrolling: 'touch'
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '500px'
  };

  const headerStyle = {
    backgroundColor: '#2d3748',
    color: '#ffffff',
    padding: '15px',
    textAlign: 'left',
    whiteSpace: 'nowrap'
  };

  const rowStyle = (index) => ({
    backgroundColor: index % 2 === 0 ? '#1a1a1a' : '#1f2937',
    transition: 'background-color 0.3s ease'
  });

  const cellStyle = {
    padding: '15px',
    color: '#ffffff',
    borderBottom: '1px solid #374151'
  };

  const rankStyle = (index) => ({
    ...cellStyle,
    fontWeight: 'bold',
    color: index < 3 ? '#fbbf24' : '#ffffff'
  });

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    padding: '20px',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    marginBottom: '20px'
  };

  const emptyStyle = {
    padding: '30px',
    textAlign: 'center',
    color: '#9ca3af',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    marginBottom: '20px'
  };

  const LeaderboardTable = ({ data, title }) => {
    if (!data.length) {
      return (
        <div style={emptyStyle}>
          No predictions have been made yet
        </div>
      );
    }

    return (
      <>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <div style={tableContainerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerStyle}>Rank</th>
                <th style={headerStyle}>User</th>
                <th style={headerStyle}>Correct</th>
                <th style={headerStyle}>Total</th>
                <th style={headerStyle}>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry, index) => (
                <tr key={entry.user_id} style={rowStyle(index)}>
                  <td style={rankStyle(index)}>{index + 1}</td>
                  <td style={cellStyle}>{entry.user_id}</td>
                  <td style={cellStyle}>{entry.correct_predictions}</td>
                  <td style={cellStyle}>{entry.total_predictions}</td>
                  <td style={cellStyle}>{entry.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Leaderboard</h1>
        <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af' }}>
          Loading leaderboard...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Leaderboard</h1>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Leaderboard</h1>
      
      {eventId && (
        <LeaderboardTable 
          data={eventLeaderboard} 
          title="Event Leaderboard" 
        />
      )}

      <LeaderboardTable 
        data={overallLeaderboard} 
        title="Overall Leaderboard" 
      />
    </div>
  );
}

export default Leaderboard; 