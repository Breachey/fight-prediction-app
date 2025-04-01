import React, { useEffect, useState } from 'react';

function Leaderboard({ eventId }) {
  const [eventLeaderboard, setEventLeaderboard] = useState([]);
  const [overallLeaderboard, setOverallLeaderboard] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboards();
    // Refresh leaderboard data every 30 seconds
    const refreshInterval = setInterval(fetchLeaderboards, 30000);
    
    return () => clearInterval(refreshInterval);
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
    fontSize: '2.5rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '30px',
    background: 'linear-gradient(to right, #e9d5ff, #ffffff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textShadow: '0 2px 10px rgba(233, 213, 255, 0.2)'
  };

  const sectionTitleStyle = {
    fontSize: '1.8rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '20px',
    color: '#e9d5ff'
  };

  const tableContainerStyle = {
    overflowX: 'auto',
    borderRadius: '16px',
    background: 'linear-gradient(145deg, #1a1a1a 0%, #2d1f47 100%)',
    marginBottom: '40px',
    WebkitOverflowScrolling: 'touch',
    border: '1px solid #4c1d95',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0',
    minWidth: '500px'
  };

  const headerStyle = {
    background: 'linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)',
    color: '#ffffff',
    padding: '15px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    fontSize: '1.1rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  };

  const firstHeaderStyle = {
    ...headerStyle,
    borderTopLeftRadius: '12px'
  };

  const lastHeaderStyle = {
    ...headerStyle,
    borderTopRightRadius: '12px'
  };

  const rowStyle = (index) => ({
    backgroundColor: index % 2 === 0 ? 'rgba(26, 26, 26, 0.8)' : 'rgba(31, 41, 55, 0.8)',
    transition: 'all 0.3s ease',
    cursor: 'default',
    '&:hover': {
      backgroundColor: 'rgba(76, 29, 149, 0.1)'
    }
  });

  const cellStyle = {
    padding: '15px',
    color: '#ffffff',
    borderBottom: '1px solid rgba(76, 29, 149, 0.3)',
    fontSize: '1rem'
  };

  const rankStyle = (index) => ({
    ...cellStyle,
    fontWeight: 'bold',
    color: index === 0 ? '#ffd700' : // Gold
          index === 1 ? '#c0c0c0' : // Silver
          index === 2 ? '#cd7f32' : // Bronze
          '#ffffff',
    textShadow: index < 3 ? '0 0 10px rgba(255, 255, 255, 0.3)' : 'none'
  });

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    padding: '20px',
    background: 'linear-gradient(145deg, #1a1a1a 0%, #2d1f47 100%)',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.1)'
  };

  const emptyStyle = {
    padding: '30px',
    textAlign: 'center',
    color: '#9ca3af',
    background: 'linear-gradient(145deg, #1a1a1a 0%, #2d1f47 100%)',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid #4c1d95'
  };

  const loadingStyle = {
    textAlign: 'center',
    padding: '20px',
    color: '#e9d5ff',
    fontSize: '1.2rem'
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
                <th style={firstHeaderStyle}>Rank</th>
                <th style={headerStyle}>User</th>
                <th style={headerStyle}>Correct</th>
                <th style={headerStyle}>Total</th>
                <th style={lastHeaderStyle}>Accuracy</th>
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
        <div style={loadingStyle}>
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