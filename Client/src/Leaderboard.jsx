// Leaderboard.jsx
// This component displays a leaderboard for an event and/or overall, with options to toggle between them and show/hide AI users.

import React, { useEffect, useState } from 'react';
import { API_URL } from './config';
import { Link } from 'react-router-dom';

function Leaderboard({ eventId, currentUser }) {
  // State for event-specific leaderboard data
  const [eventLeaderboard, setEventLeaderboard] = useState([]);
  // State for overall leaderboard data
  const [overallLeaderboard, setOverallLeaderboard] = useState([]);
  // State for monthly leaderboard data
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState([]);
  // Loading and error state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // Whether to show AI users in the leaderboard
  const [showBots, setShowBots] = useState(false);
  // Which leaderboard is currently selected ('event' or 'overall' or 'monthly')
  const [selectedLeaderboard, setSelectedLeaderboard] = useState(eventId ? 'event' : 'overall');
  // Add state for sorting
  const [sortConfig, setSortConfig] = useState({ key: 'total_points', direction: 'desc' });

  // Fetch leaderboard data when component mounts or eventId changes
  useEffect(() => {
    fetchLeaderboards();
    // Refresh leaderboard data every 30 seconds
    const refreshInterval = setInterval(fetchLeaderboards, 30000);
    // Reset selected leaderboard if eventId changes
    setSelectedLeaderboard(eventId ? 'event' : 'overall');
    return () => clearInterval(refreshInterval);
  }, [eventId]);

  // Fetch both event, overall, and monthly leaderboards from the API
  const fetchLeaderboards = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Fetch all leaderboards in parallel
      const [eventResponse, overallResponse, monthlyResponse] = await Promise.all([
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
        }),
        fetch(`${API_URL}/leaderboard/monthly`, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }).catch(error => {
          console.error('Monthly leaderboard fetch error:', error);
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

      // Check monthly leaderboard response
      if (!monthlyResponse.ok) {
        const errorMessage = monthlyResponse.error 
          ? `Failed to load monthly leaderboard: ${monthlyResponse.error.message}`
          : 'Failed to load monthly leaderboard. Please try again later.';
        throw new Error(errorMessage);
      }
      const monthlyData = await monthlyResponse.json();
      setMonthlyLeaderboard(monthlyData || []);

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
      setMonthlyLeaderboard([]);
    }
  };

  // --- Styling objects ---
  // These objects define the inline styles for the leaderboard UI

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

  // --- Table header and cell styles ---
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

  // First column (rank) header style
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

  // User column header style
  const userHeaderStyle = {
    ...headerStyle,
    width: '45%',
    '@media (max-width: 768px)': {
      ...headerStyle['@media (max-width: 768px)'],
      width: '35%',
      padding: '8px 0'
    }
  };

  // Stats columns header style
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

  // Last column (accuracy) header style
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

  // Row style, highlights current user and alternates row colors
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

  // Table cell style
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

  // User cell style, highlights current user
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

  // Returns the rank badge (C for champ, otherwise index)
  const getRankBadge = (index) => (index === 0 ? 'C' : index);

  // Style for rank text (gold for champ, gray for others)
  const rankTextStyle = (index) => ({
    fontWeight: 700,
    fontSize: '1.1rem',
    color: index === 0 ? '#FFD700' : '#b0b3b8', // gold for champ, silver/gray for others
    textShadow: index === 0 ? '0 0 4px #FFD70088' : 'none',
    letterSpacing: '0.02em',
    textAlign: 'center'
  });

  // Style for the champ badge (first place)
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

  // Style for rank cell (gradient for top 3)
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

  // Style for accuracy cell (green/yellow/red based on accuracy)
  const accuracyStyle = (accuracy) => ({
    ...cellStyle,
    color: accuracy >= 70 ? '#22c55e' : 
           accuracy >= 50 ? '#eab308' : 
           accuracy > 0 ? '#ef4444' : '#6b7280'
  });

  // Error message style
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

  // Empty leaderboard style
  const emptyStyle = {
    padding: '30px',
    textAlign: 'center',
    color: '#9ca3af',
    background: 'linear-gradient(145deg, #1a1a1a 0%, #2d1f47 100%)',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid #4c1d95'
  };

  // Loading message style
  const loadingStyle = {
    textAlign: 'center',
    padding: '20px',
    color: '#e9d5ff',
    fontSize: '1.2rem'
  };

  // Badge for current user
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

  // Badge for AI users
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

  // Style for the filter/toggle button containers
  const filterToggleStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '20px'
  };

  // Style for toggle buttons (leaderboard selection and AI toggle)
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

  // Style for points cell, interpolates color from green to red based on rank
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

  // Helper to handle sorting
  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        // Toggle direction
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  // --- LeaderboardTable subcomponent ---
  // Renders a leaderboard table for the given data and title
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

    // Sort the data based on sortConfig
    const sortedData = [...filteredData].sort((a, b) => {
      const { key, direction } = sortConfig;
      let aValue = a[key];
      let bValue = b[key];
      // Convert to numbers if possible
      if (!isNaN(parseFloat(aValue)) && !isNaN(parseFloat(bValue))) {
        aValue = parseFloat(aValue);
        bValue = parseFloat(bValue);
      }
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    // Helper to show sort arrow
    const getSortArrow = (key) => {
      if (sortConfig.key !== key) return '';
      return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    };

    return (
      <>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <div style={tableContainerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={firstHeaderStyle} onClick={() => handleSort('rank')}>
                  #{getSortArrow('rank')}
                </th>
                <th style={userHeaderStyle} onClick={() => handleSort('user_id')}>
                  USER{getSortArrow('user_id')}
                </th>
                <th style={statsHeaderStyle} onClick={() => handleSort('total_points')}>
                  PTS{getSortArrow('total_points')}
                </th>
                <th style={statsHeaderStyle} onClick={() => handleSort('correct_predictions')}>
                  ✓{getSortArrow('correct_predictions')}
                </th>
                <th style={statsHeaderStyle} onClick={() => handleSort('total_predictions')}>
                  TOT{getSortArrow('total_predictions')}
                </th>
                <th style={lastHeaderStyle} onClick={() => handleSort('accuracy')}>
                  ACC{getSortArrow('accuracy')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((entry, index) => {
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
                        <Link 
                          to={`/profile/${encodeURIComponent(entry.user_id)}`}
                          style={{ color: isCurrentUser ? '#a78bfa' : '#fff', textDecoration: 'underline', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                        >
                          {entry.user_id}
                        </Link>
                      </span>
                      {isCurrentUser && <span style={currentUserBadge}>You</span>}
                      {entry.is_bot && <span style={aiBadge}>AI</span>}
                    </td>
                    <td style={pointsStyle(index, sortedData.length)}>{entry.total_points}</td>
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

  // --- Main render logic ---

  // Show loading state
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

  // Show error state
  if (error) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Leaderboard</h1>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  // Main leaderboard UI
  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Leaderboard</h1>
      {/* Leaderboard selection toggle */}
      <div style={filterToggleStyle}>
        {eventId && (
          <button
            style={{
              ...toggleButtonStyle,
              background: selectedLeaderboard === 'event' ? '#a78bfa' : 'rgba(76, 29, 149, 0.2)',
              color: selectedLeaderboard === 'event' ? '#fff' : '#a78bfa',
              fontWeight: selectedLeaderboard === 'event' ? '700' : '500'
            }}
            onClick={() => setSelectedLeaderboard('event')}
          >
            Event
          </button>
        )}
        <button
          style={{
            ...toggleButtonStyle,
            background: selectedLeaderboard === 'overall' ? '#a78bfa' : 'rgba(76, 29, 149, 0.2)',
            color: selectedLeaderboard === 'overall' ? '#fff' : '#a78bfa',
            fontWeight: selectedLeaderboard === 'overall' ? '700' : '500'
          }}
          onClick={() => setSelectedLeaderboard('overall')}
        >
          Overall
        </button>
        <button
          style={{
            ...toggleButtonStyle,
            background: selectedLeaderboard === 'monthly' ? '#a78bfa' : 'rgba(76, 29, 149, 0.2)',
            color: selectedLeaderboard === 'monthly' ? '#fff' : '#a78bfa',
            fontWeight: selectedLeaderboard === 'monthly' ? '700' : '500'
          }}
          onClick={() => setSelectedLeaderboard('monthly')}
        >
          Monthly
        </button>
      </div>
      {/* AI users toggle */}
      <div style={filterToggleStyle}>
        <button 
          style={toggleButtonStyle}
          onClick={() => setShowBots(!showBots)}
        >
          {showBots ? 'Hide AI Users' : 'Show AI Users'}
        </button>
      </div>
      {/* Show only the selected leaderboard */}
      {selectedLeaderboard === 'event' && eventId && (
        <LeaderboardTable 
          data={eventLeaderboard} 
          title="Event Leaderboard" 
        />
      )}
      {selectedLeaderboard === 'overall' && (
        <LeaderboardTable 
          data={overallLeaderboard} 
          title="Overall Leaderboard" 
        />
      )}
      {selectedLeaderboard === 'monthly' && (
        <LeaderboardTable 
          data={monthlyLeaderboard} 
          title="Monthly Leaderboard" 
        />
      )}
    </div>
  );
}

export default Leaderboard; 