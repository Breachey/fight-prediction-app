import React, { useEffect, useState } from 'react';

function Leaderboard({ eventId, currentUser }) {
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
    maxWidth: '900px',
    margin: '0 auto',
    boxSizing: 'border-box',
    fontFamily: 'Inter, system-ui, sans-serif'
  };

  const titleStyle = {
    fontSize: '2.5rem',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: '30px',
    color: '#ffffff',
    letterSpacing: '-0.02em'
  };

  const sectionTitleStyle = {
    fontSize: '1.8rem',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: '25px',
    color: '#ffffff',
    letterSpacing: '-0.01em'
  };

  const tableContainerStyle = {
    overflowX: 'auto',
    borderRadius: '20px',
    background: 'rgba(26, 26, 26, 0.7)',
    backdropFilter: 'blur(10px)',
    marginBottom: '40px',
    WebkitOverflowScrolling: 'touch',
    border: '1px solid rgba(76, 29, 149, 0.2)',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.3), inset 0 1px rgba(255, 255, 255, 0.1)'
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0',
    minWidth: '700px'
  };

  const headerStyle = {
    background: 'rgba(76, 29, 149, 0.3)',
    backdropFilter: 'blur(5px)',
    color: '#ffffff',
    padding: '20px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    fontSize: '1.1rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  };

  const firstHeaderStyle = {
    ...headerStyle,
    borderTopLeftRadius: '20px',
    width: '80px',
    textAlign: 'center'
  };

  const lastHeaderStyle = {
    ...headerStyle,
    borderTopRightRadius: '20px',
    width: '120px',
    textAlign: 'center'
  };

  const userHeaderStyle = {
    ...headerStyle,
    width: '250px'
  };

  const statsHeaderStyle = {
    ...headerStyle,
    width: '100px',
    textAlign: 'center'
  };

  const rowStyle = (index, isCurrentUser) => ({
    backgroundColor: isCurrentUser
      ? 'rgba(139, 92, 246, 0.15)'
      : index % 2 === 0 
        ? 'rgba(26, 26, 26, 0.4)' 
        : 'rgba(76, 29, 149, 0.1)',
    transition: 'all 0.3s ease',
    cursor: 'default',
    position: 'relative',
    border: isCurrentUser ? '1px solid rgba(139, 92, 246, 0.3)' : 'none',
    '&:hover': {
      backgroundColor: isCurrentUser
        ? 'rgba(139, 92, 246, 0.2)'
        : 'rgba(76, 29, 149, 0.2)',
      transform: 'translateY(-1px)',
      boxShadow: isCurrentUser
        ? '0 4px 20px rgba(139, 92, 246, 0.3)'
        : '0 4px 20px rgba(76, 29, 149, 0.2)'
    }
  });

  const cellStyle = {
    padding: '20px',
    color: '#ffffff',
    borderBottom: '1px solid rgba(76, 29, 149, 0.1)',
    fontSize: '1rem',
    letterSpacing: '0.02em',
    textAlign: 'center'
  };

  const userCellStyle = (isCurrentUser) => ({
    ...cellStyle,
    textAlign: 'left',
    fontWeight: isCurrentUser ? '600' : '500',
    color: isCurrentUser ? '#a78bfa' : '#ffffff',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  });

  const getRankBadge = (index) => {
    const badges = ['🥇', '🥈', '🥉'];
    return index < 3 ? badges[index] : (index + 1);
  };

  const rankStyle = (index) => ({
    ...cellStyle,
    fontWeight: 'bold',
    fontSize: index < 3 ? '1.5rem' : '1rem',
    background: index === 0 
      ? 'linear-gradient(135deg, #ffd700 0%, #ffb700 100%)' 
      : index === 1 
      ? 'linear-gradient(135deg, #c0c0c0 0%, #a0a0a0 100%)'
      : index === 2 
      ? 'linear-gradient(135deg, #cd7f32 0%, #a05a20 100%)'
      : 'transparent',
    WebkitBackgroundClip: index < 3 ? 'text' : 'none',
    WebkitTextFillColor: index < 3 ? 'transparent' : '#ffffff',
    textShadow: index < 3 ? '0 2px 10px rgba(255, 255, 255, 0.3)' : 'none',
    position: 'relative'
  });

  const accuracyStyle = (accuracy) => ({
    ...cellStyle,
    color: accuracy >= 70 ? '#22c55e' : 
           accuracy >= 50 ? '#eab308' : 
           accuracy > 0 ? '#ef4444' : '#6b7280'
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

  const currentUserBadge = {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: '#a78bfa',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '500',
    border: '1px solid rgba(139, 92, 246, 0.3)'
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
                <th style={userHeaderStyle}>User</th>
                <th style={statsHeaderStyle}>Correct</th>
                <th style={statsHeaderStyle}>Total</th>
                <th style={lastHeaderStyle}>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry, index) => {
                const isCurrentUser = entry.user_id === currentUser;
                return (
                  <tr key={entry.user_id} style={rowStyle(index, isCurrentUser)}>
                    <td style={rankStyle(index)}>{getRankBadge(index)}</td>
                    <td style={userCellStyle(isCurrentUser)}>
                      {entry.user_id}
                      {isCurrentUser && <span style={currentUserBadge}>You</span>}
                    </td>
                    <td style={cellStyle}>{entry.correct_predictions}</td>
                    <td style={cellStyle}>{entry.total_predictions}</td>
                    <td style={accuracyStyle(parseFloat(entry.accuracy))}>
                      {entry.accuracy}%
                    </td>
                  </tr>
                );
              })}
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