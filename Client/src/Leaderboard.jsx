import React, { useEffect, useState } from 'react';
import { API_URL } from './config';

function Leaderboard({ eventId, currentUser }) {
  const [eventLeaderboard, setEventLeaderboard] = useState([]);
  const [overallLeaderboard, setOverallLeaderboard] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showBots, setShowBots] = useState(false);

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
        eventId ? fetch(`${API_URL}/events/${eventId}/leaderboard`, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }).catch(error => {
          console.error('Event leaderboard fetch error:', error);
          return { ok: false, error };
        }) : Promise.resolve(null),
        fetch(`${API_URL}/leaderboard`, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }).catch(error => {
          console.error('Overall leaderboard fetch error:', error);
          return { ok: false, error };
        })
      ]);

      // Check overall leaderboard response
      if (!overallResponse.ok) {
        const errorMessage = overallResponse.error 
          ? `Failed to load overall leaderboard: ${overallResponse.error.message}`
          : 'Failed to load overall leaderboard. Please try again later.';
        throw new Error(errorMessage);
      }
      const overallData = await overallResponse.json();
      setOverallLeaderboard(overallData || []);

      // Check event leaderboard response if we have an event ID
      if (eventId && eventResponse) {
        if (!eventResponse.ok) {
          const errorMessage = eventResponse.error 
            ? `Failed to load event leaderboard: ${eventResponse.error.message}`
            : 'Failed to load event leaderboard. Please try again later.';
          throw new Error(errorMessage);
        }
        const eventData = await eventResponse.json();
        setEventLeaderboard(eventData || []);
      } else {
        setEventLeaderboard([]);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
      setError(error.message || 'An unexpected error occurred. Please try again later.');
      setIsLoading(false);
      
      // Set empty arrays to prevent undefined errors
      setEventLeaderboard([]);
      setOverallLeaderboard([]);
    }
  };

  const containerStyle = {
    padding: '20px',
    maxWidth: '900px',
    margin: '0 auto',
    boxSizing: 'border-box',
    fontFamily: 'Inter, system-ui, sans-serif',
    '@media (max-width: 768px)': {
      padding: '10px'
    }
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
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.3), inset 0 1px rgba(255, 255, 255, 0.1)',
    '@media (max-width: 768px)': {
      margin: '0 -10px',
      borderRadius: '10px'
    }
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '0',
    minWidth: '100%',
    tableLayout: 'fixed'
  };

  const headerStyle = {
    background: 'rgba(76, 29, 149, 0.3)',
    backdropFilter: 'blur(5px)',
    color: '#ffffff',
    padding: '15px 10px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    fontSize: '0.9rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    '@media (max-width: 768px)': {
      padding: '8px 2px',
      fontSize: '0.65rem',
      letterSpacing: '0',
      textAlign: 'center'
    }
  };

  const firstHeaderStyle = {
    ...headerStyle,
    borderTopLeftRadius: '20px',
    width: '10%',
    textAlign: 'center',
    '@media (max-width: 768px)': {
      ...headerStyle['@media (max-width: 768px)'],
      width: '15%',
      padding: '8px 0'
    }
  };

  const userHeaderStyle = {
    ...headerStyle,
    width: '45%',
    '@media (max-width: 768px)': {
      ...headerStyle['@media (max-width: 768px)'],
      width: '35%',
      padding: '8px 0'
    }
  };

  const statsHeaderStyle = {
    ...headerStyle,
    width: '15%',
    textAlign: 'center',
    '@media (max-width: 768px)': {
      ...headerStyle['@media (max-width: 768px)'],
      width: '15%',
      padding: '8px 0'
    }
  };

  const lastHeaderStyle = {
    ...headerStyle,
    borderTopRightRadius: '20px',
    width: '15%',
    textAlign: 'center',
    '@media (max-width: 768px)': {
      ...headerStyle['@media (max-width: 768px)'],
      width: '20%',
      padding: '8px 0'
    }
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
    padding: '15px 10px',
    color: '#ffffff',
    borderBottom: '1px solid rgba(76, 29, 149, 0.1)',
    fontSize: '1rem',
    letterSpacing: '0.02em',
    textAlign: 'center',
    '@media (max-width: 768px)': {
      padding: '8px 4px',
      fontSize: '0.85rem'
    }
  };

  const userCellStyle = (isCurrentUser) => ({
    ...cellStyle,
    textAlign: 'left',
    fontWeight: isCurrentUser ? '600' : '500',
    color: isCurrentUser ? '#a78bfa' : '#ffffff',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    '@media (max-width: 768px)': {
      ...cellStyle['@media (max-width: 768px)'],
      gap: '2px'
    }
  });

  const getRankBadge = (index) => (index === 0 ? 'C' : index);

  const rankTextStyle = (index) => ({
    fontWeight: 700,
    fontSize: '1.1rem',
    color: index === 0 ? '#FFD700' : '#b0b3b8', // gold for champ, silver/gray for others
    textShadow: index === 0 ? '0 0 4px #FFD70088' : 'none',
    letterSpacing: '0.02em',
    textAlign: 'center'
  });

  const champBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '1.1rem',
    color: '#7c5e00',
    background: 'linear-gradient(90deg, #ffe066 0%, #ffd700 100%)',
    border: '2px solid #fffbe6',
    borderRadius: '50%',
    width: '2.2rem',
    height: '2.2rem',
    boxShadow: '0 0 8px 2px #ffd70088',
    margin: '0 auto',
    gap: '0.2rem',
    letterSpacing: '0.05em'
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
    border: '1px solid rgba(139, 92, 246, 0.3)',
    '@media (max-width: 768px)': {
      padding: '1px 4px',
      fontSize: '0.65rem'
    }
  };

  const aiBadge = {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    color: '#60a5fa',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '500',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    marginLeft: '4px',
    '@media (max-width: 768px)': {
      padding: '1px 4px',
      fontSize: '0.65rem',
      marginLeft: '2px'
    }
  };

  const filterToggleStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '20px'
  };

  const toggleButtonStyle = {
    padding: '8px 16px',
    borderRadius: '8px',
    background: showBots ? 'rgba(59, 130, 246, 0.2)' : 'rgba(76, 29, 149, 0.2)',
    color: showBots ? '#60a5fa' : '#a78bfa',
    border: `1px solid ${showBots ? 'rgba(59, 130, 246, 0.3)' : 'rgba(139, 92, 246, 0.3)'}`,
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'all 0.2s ease',
    '&:hover': {
      background: showBots ? 'rgba(59, 130, 246, 0.3)' : 'rgba(76, 29, 149, 0.3)'
    }
  };

  // Helper to interpolate between two colors (hex strings, e.g. '22c55e' and 'ef4444')
  function interpolateColor(color1, color2, factor) {
    const c1 = color1.match(/\w\w/g).map(x => parseInt(x, 16));
    const c2 = color2.match(/\w\w/g).map(x => parseInt(x, 16));
    const result = c1.map((v, i) => Math.round(v + (c2[i] - v) * factor));
    return result.map(x => x.toString(16).padStart(2, '0')).join('');
  }

  const pointsStyle = (index, total) => {
    // 0 = green, 1 = red
    const factor = total <= 1 ? 0 : index / (total - 1);
    const color = interpolateColor('22c55e', 'ef4444', factor); // green to red
    return {
      ...cellStyle,
      color: `#${color}`,
      fontWeight: '600'
    };
  };

  const LeaderboardTable = ({ data, title }) => {
    if (!data.length) {
      return (
        <div style={emptyStyle}>
          No predictions have been made yet
        </div>
      );
    }

    // Filter out bots if showBots is false
    const filteredData = showBots ? data : data.filter(entry => !entry.is_bot);

    return (
      <>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <div style={tableContainerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={firstHeaderStyle}>RNK</th>
                <th style={userHeaderStyle}>USER</th>
                <th style={statsHeaderStyle}>PTS</th>
                <th style={statsHeaderStyle}>✓</th>
                <th style={statsHeaderStyle}>TOT</th>
                <th style={lastHeaderStyle}>ACC</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((entry, index) => {
                const isCurrentUser = entry.user_id === currentUser;
                // Round the accuracy to the nearest whole number
                const roundedAccuracy = Math.round(parseFloat(entry.accuracy));
                return (
                  <tr key={entry.user_id} style={rowStyle(index, isCurrentUser)}>
                    <td style={{ ...rankStyle(index), ...rankTextStyle(index) }}>
                      {getRankBadge(index)}
                    </td>
                    <td style={userCellStyle(isCurrentUser)}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        maxWidth: '100%'
                      }}>
                        {entry.user_id}
                      </span>
                      {isCurrentUser && <span style={currentUserBadge}>You</span>}
                      {entry.is_bot && <span style={aiBadge}>AI</span>}
                    </td>
                    <td style={pointsStyle(index, filteredData.length)}>{entry.total_points}</td>
                    <td style={cellStyle}>{entry.correct_predictions}</td>
                    <td style={cellStyle}>{entry.total_predictions}</td>
                    <td style={accuracyStyle(roundedAccuracy)}>
                      {roundedAccuracy}%
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
      
      <div style={filterToggleStyle}>
        <button 
          style={toggleButtonStyle}
          onClick={() => setShowBots(!showBots)}
        >
          {showBots ? 'Hide AI Users' : 'Show AI Users'}
        </button>
      </div>
      
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