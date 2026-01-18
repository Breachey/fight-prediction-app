// Leaderboard.jsx
// This component displays a leaderboard for an event and/or overall, with options to toggle between them and show/hide AI users.

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { API_URL } from './config';
import { Link } from 'react-router-dom';
import PlayerCard from './components/PlayerCard';
import './Leaderboard.css';

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Whether to show AI users in the leaderboard
  const [showBots, setShowBots] = useState(false);
  // Which leaderboard is currently selected ('event' or 'overall' or 'monthly')
  const [selectedLeaderboard, setSelectedLeaderboard] = useState(eventId ? 'event' : 'overall');
  // Add state for sorting
  const [sortConfig, setSortConfig] = useState({ key: 'total_points', direction: 'desc' });

  // Fetch both event, overall, and monthly leaderboards from the API
  const fetchLeaderboards = useCallback(async ({ skipGlobalLoading = false, showManualIndicator = false } = {}) => {
    const startLoading = () => {
      if (!skipGlobalLoading) {
        setIsLoading(true);
      }
      if (showManualIndicator) {
        setIsRefreshing(true);
      }
    };

    const stopLoading = () => {
      if (!skipGlobalLoading) {
        setIsLoading(false);
      }
      if (showManualIndicator) {
        setIsRefreshing(false);
      }
    };

    startLoading();

    try {
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

    } catch (error) {
      console.error('Error fetching leaderboards:', error);
      setError(error.message || 'An unexpected error occurred. Please try again later.');
      // Set empty arrays to prevent undefined errors
      setEventLeaderboard([]);
      setOverallLeaderboard([]);
      setMonthlyLeaderboard([]);
    } finally {
      stopLoading();
    }
  }, [eventId]);

  // Fetch leaderboard data when component mounts or eventId changes
  useEffect(() => {
    fetchLeaderboards();
    // Refresh leaderboard data every 60 seconds (reduced from 30s for performance)
    const refreshInterval = setInterval(() => {
      fetchLeaderboards({ skipGlobalLoading: true });
    }, 60000);
    // Reset selected leaderboard if eventId changes
    setSelectedLeaderboard(eventId ? 'event' : 'overall');
    return () => clearInterval(refreshInterval);
  }, [eventId, fetchLeaderboards]);

  // --- Styling objects ---
  // These objects define the inline styles for the leaderboard UI

  const containerStyle = {
    padding: '20px',
    maxWidth: '900px',
    margin: '0 auto',
    boxSizing: 'border-box',
    fontFamily: 'Inter, system-ui, sans-serif'
  };

  const titleStyle = {
    fontFamily: "'Space Grotesk', 'Inter', 'Segoe UI', sans-serif",
    fontSize: '2.25rem',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: '30px',
    color: 'rgba(255, 255, 255, 1)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase'
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
    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.25) 0%, rgba(37, 99, 235, 0.25) 100%), rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    marginBottom: '40px',
    WebkitOverflowScrolling: 'touch',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
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
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: 'rgba(255, 255, 255, 0.9)',
    padding: '15px 10px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    fontSize: '0.9rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)'
  };

  // First column (rank) header style
  const firstHeaderStyle = {
    ...headerStyle,
    borderTopLeftRadius: '20px',
    width: '10%',
    textAlign: 'center'
  };

  // User column header style
  const userHeaderStyle = {
    ...headerStyle,
    width: '45%'
  };

  // Stats columns header style
  const statsHeaderStyle = {
    ...headerStyle,
    width: '15%',
    textAlign: 'center'
  };

  // Last column (accuracy) header style
  const lastHeaderStyle = {
    ...headerStyle,
    borderTopRightRadius: '20px',
    width: '15%',
    textAlign: 'center'
  };

  // Row style, highlights current user and alternates row colors
  const rowStyle = (index, isCurrentUser) => ({
    backgroundColor: isCurrentUser
      ? 'rgba(255, 255, 255, 0.15)'
      : index % 2 === 0 
        ? 'rgba(255, 255, 255, 0.03)' 
        : 'rgba(255, 255, 255, 0.05)',
    transition: 'all 0.3s ease',
    cursor: 'default',
    position: 'relative',
    border: isCurrentUser ? '1px solid rgba(255, 255, 255, 0.4)' : 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
  });

  // Table cell style
  const cellStyle = {
    padding: '15px 10px',
    color: 'rgba(255, 255, 255, 0.9)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '1rem',
    letterSpacing: '0.02em',
    textAlign: 'center'
  };

  // User cell style, highlights current user
  const userCellStyle = (isCurrentUser) => ({
    ...cellStyle,
    textAlign: 'left',
    fontWeight: isCurrentUser ? '600' : '500',
    color: isCurrentUser ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.9)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
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
    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.25) 0%, rgba(37, 99, 235, 0.25) 100%), rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
  };

  // Empty leaderboard style
  const emptyStyle = {
    padding: '30px',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.9)',
    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.25) 0%, rgba(37, 99, 235, 0.25) 100%), rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    color: 'rgba(255, 255, 255, 0.9)',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '500',
    border: '1px solid rgba(255, 255, 255, 0.3)'
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
    marginLeft: '4px'
  };

  // Style for the filter/toggle button containers
  const filterToggleStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '20px'
  };

  // Style for toggle buttons (leaderboard selection)
  const toggleButtonStyle = {
    padding: '8px 16px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.08)',
    color: 'rgba(255, 255, 255, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'all 0.2s ease'
  };

  // Style for AI users toggle button (matches Fights.jsx style)
  const aiToggleButtonStyle = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    borderRadius: '8px',
    background: showBots ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'all 0.2s ease',
    margin: '0 auto 20px auto',
    width: 'fit-content',
    opacity: 0.8,
    color: 'rgba(255, 255, 255, 0.9)',
  }), [showBots]);

  const refreshButtonStyle = (disabled) => ({
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    outline: 'none',
    boxShadow: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.5 : 1,
    WebkitAppearance: 'none',
    MozAppearance: 'none',
  });

  const refreshIconStyle = (spinning) => ({
    display: 'inline-block',
    fontSize: '2.5rem',
    color: '#e5e7eb',
    transformOrigin: '50% 50%',
    animation: spinning ? 'leaderboard-refresh-spin 0.8s linear infinite' : 'none',
    transition: 'opacity 0.2s ease',
  });

  // Helper to interpolate between two colors (hex strings, e.g. '22c55e' and 'ef4444')
  // Memoize this function to avoid recomputation
  const interpolateColor = useCallback((color1, color2, factor) => {
    const c1 = color1.match(/\w\w/g).map(x => parseInt(x, 16));
    const c2 = color2.match(/\w\w/g).map(x => parseInt(x, 16));
    const result = c1.map((v, i) => Math.round(v + (c2[i] - v) * factor));
    return '#' + result.map(x => x.toString(16).padStart(2, '0')).join('');
  }, []);

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

  // --- LeaderboardCard subcomponent ---
  // Renders a single leaderboard entry as a card
  const LeaderboardCard = ({ entry, index, isCurrentUser, total, minCorrect, maxCorrect, minTotal, maxTotal, minAcc, maxAcc, minPoints, maxPoints }) => {
    const roundedAccuracy = Math.round(parseFloat(entry.accuracy));
    // Color interpolation for stats
    const getStatColor = (val, min, max) => {
      if (max === min) return '#b0a8c9'; // fallback if all values are the same
      const factor = (val - min) / (max - min);
      return interpolateColor('ef4444', '22c55e', factor); // red to green
    };
    const bgUrl = entry.playercard?.image_url || '';
    const fallbackBg = 'linear-gradient(135deg, rgba(220, 38, 38, 0.25) 0%, rgba(37, 99, 235, 0.25) 100%)';
    const crownCount = Number(entry.event_win_count) || 0;
    const crownBadgeStyle = {
      background: 'rgba(251, 191, 36, 0.2)',
      color: '#fcd34d',
      padding: '0px 7px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      height: 16,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      border: '1px solid rgba(251, 191, 36, 0.4)',
      minWidth: 0
    };
    return (
      <div
        style={{
          position: 'relative',
          background: bgUrl ? `url('${bgUrl}') center/cover no-repeat` : fallbackBg,
          borderRadius: 20,
          padding: 0,
          marginBottom: 16,
          color: '#fff',
          boxShadow:
            isCurrentUser
              ? '0 0 0 3px rgba(255, 255, 255, 0.5), 0 2px 8px rgba(255, 255, 255, 0.2)'
              : index === 0
              ? '0 0 16px 2px #FFD70088, 0 2px 8px rgba(0,0,0,0.15)'
              : index === 1
              ? '0 0 16px 2px #C0C0C088, 0 2px 8px rgba(0,0,0,0.15)'
              : index === 2
              ? '0 0 16px 2px #CD7F3288, 0 2px 8px rgba(0,0,0,0.15)'
              : '0 2px 8px rgba(0,0,0,0.15)',
          border:
            isCurrentUser
              ? '2.5px solid rgba(255, 255, 255, 0.6)'
              : index === 0
              ? '2.5px solid #FFD700'
              : index === 1
              ? '2.5px solid #C0C0C0'
              : index === 2
              ? '2.5px solid #CD7F32'
              : '1px solid rgba(255, 255, 255, 0.2)',
          overflow: 'hidden',
          minHeight: 90,
          display: 'flex',
          alignItems: 'stretch',
          flexWrap: 'wrap',
        }}
      >
        {/* Overlay for readability */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.4) 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }} />
        {/* Card Content */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          flexWrap: 'wrap',
        }}>
          {/* Rank & Medal */}
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 48 }}>
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginRight: 6,
                color:
                  isCurrentUser
                    ? 'rgba(255, 255, 255, 1)'
                    : index === 0
                    ? '#FFD700'
                    : index === 1
                    ? '#C0C0C0'
                    : index === 2
                    ? '#CD7F32'
                    : 'rgba(255, 255, 255, 0.8)',
                textShadow:
                  isCurrentUser
                    ? '0 0 4px rgba(255, 255, 255, 0.5)'
                    : index === 0
                    ? '0 0 4px #FFD70088'
                    : index === 1
                    ? '0 0 4px #C0C0C088'
                    : index === 2
                    ? '0 0 4px #CD7F3288'
                    : undefined,
              }}
            >
              {index === 0 ? 'C' : index}
            </span>
          </div>
          {/* Name & Details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                minWidth: 0,
                maxWidth: '100%',
                flexShrink: 1,
              }}>
                <span style={{
                  fontSize: 'clamp(0.9rem, 2vw, 1.2rem)',
                  whiteSpace: 'nowrap',
                  overflow: 'visible',
                  lineHeight: 1.1,
                  color: '#fff',
                  textShadow: '0 2px 8px #000a, 0 0 2px #000',
                  fontWeight: 700,
                }}>
                  {entry.username}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  {entry.is_bot && (
                    <span style={{
                      background: 'rgba(59,130,246,0.2)',
                      color: '#60a5fa',
                      padding: '0px 7px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1,
                      height: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: 0,
                      minWidth: 0,
                    }}>
                      AI
                    </span>
                  )}
                  {entry.streak && entry.streak.count >= 2 && (
                    <span style={{
                      background: entry.streak.type === 'win' 
                        ? 'rgba(34, 197, 94, 0.15)' 
                        : 'rgba(59, 130, 246, 0.15)',
                      color: entry.streak.type === 'win' ? '#22c55e' : '#60a5fa',
                      padding: '0px 7px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1,
                      height: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                      minHeight: 0,
                      minWidth: 0,
                      border: entry.streak.type === 'win'
                        ? '1px solid rgba(34, 197, 94, 0.3)'
                        : '1px solid rgba(59, 130, 246, 0.3)',
                    }}>
                      {entry.streak.type === 'win' ? '🔥' : '❄️'}{entry.streak.count}
                    </span>
                  )}
                  {crownCount > 0 && (
                    <span style={crownBadgeStyle}>
                      👑 {crownCount}
                    </span>
                  )}
                </div>
              </span>
            </div>
          </div>
          {/* Points (big) and stats (small, no text) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 70 }}>
            <div style={{ fontSize: 28, fontWeight: 800, textAlign: 'right', color: getStatColor(entry.total_points, minPoints, maxPoints) }}>{entry.total_points}</div>
            <div style={{ fontSize: 20, color: '#b0a8c9', fontWeight: 500, marginTop: 4, letterSpacing: 1, display: 'flex', gap: 18 }}>
              <span>
                <span style={{ color: getStatColor(entry.correct_predictions, minCorrect, maxCorrect) }}>{entry.correct_predictions}</span>
                /<span style={{ color: '#b0a8c9' }}>{entry.total_predictions}</span>
              </span>
              <span>
                <span style={{ color: getStatColor(roundedAccuracy, minAcc, maxAcc) }}>{roundedAccuracy}<span style={{ color: getStatColor(roundedAccuracy, minAcc, maxAcc) }}>%</span></span>
              </span>
            </div>
          </div>
        </div>
        {/* Responsive: stack on mobile */}
        <style>{`
          @media (max-width: 500px) {
            .leaderboard-card { flex-direction: column; align-items: flex-start; padding: 12px; }
            .leaderboard-card-points { margin-left: 0; margin-top: 8px; align-self: flex-end; }
          }
        `}</style>
      </div>
    );
  };

  // --- LeaderboardCardsList subcomponent ---
  // Renders a list of leaderboard cards for the given data and title
  // Memoize this component to prevent unnecessary re-renders
  const LeaderboardCardsList = useCallback(({ data, title }) => {
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
      if (!isNaN(parseFloat(aValue)) && !isNaN(parseFloat(bValue))) {
        aValue = parseFloat(aValue);
        bValue = parseFloat(bValue);
      }
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    // Find min/max for each stat
    const corrects = sortedData.map(e => e.correct_predictions);
    const totals = sortedData.map(e => e.total_predictions);
    const accuracies = sortedData.map(e => Math.round(parseFloat(e.accuracy)));
    const pointsArr = sortedData.map(e => e.total_points);
    const minCorrect = Math.min(...corrects);
    const maxCorrect = Math.max(...corrects);
    const minTotal = Math.min(...totals);
    const maxTotal = Math.max(...totals);
    const minAcc = Math.min(...accuracies);
    const maxAcc = Math.max(...accuracies);
    const minPoints = Math.min(...pointsArr);
    const maxPoints = Math.max(...pointsArr);

    return (
      <>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <div style={{ width: '100%', maxWidth: 500, margin: '0 auto' }}>
          {sortedData.map((entry, index) => (
            <LeaderboardCard
              key={entry.username}
              entry={entry}
              index={index}
              isCurrentUser={entry.username === currentUser}
              total={sortedData.length}
              minCorrect={minCorrect}
              maxCorrect={maxCorrect}
              minTotal={minTotal}
              maxTotal={maxTotal}
              minAcc={minAcc}
              maxAcc={maxAcc}
              minPoints={minPoints}
              maxPoints={maxPoints}
            />
          ))}
        </div>
      </>
    );
  }, [showBots, sortConfig, currentUser, interpolateColor]);

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
    <div style={containerStyle} className="leaderboard-container">
      <h1 style={titleStyle}>Leaderboard</h1>
      {/* Leaderboard selection toggle */}
      <div style={filterToggleStyle}>
        {eventId && (
          <button
            style={{
              ...toggleButtonStyle,
              background: selectedLeaderboard === 'event' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
              color: 'rgba(255, 255, 255, 0.95)',
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
            background: selectedLeaderboard === 'overall' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.95)',
            fontWeight: selectedLeaderboard === 'overall' ? '700' : '500'
          }}
          onClick={() => setSelectedLeaderboard('overall')}
        >
          Overall
        </button>
        <button
          style={{
            ...toggleButtonStyle,
            background: selectedLeaderboard === 'monthly' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
            color: 'rgba(255, 255, 255, 0.95)',
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
          style={aiToggleButtonStyle}
          onClick={() => setShowBots(!showBots)}
        >
          {showBots ? '● Show AI Users' : '○ Show AI Users'}
        </button>
      </div>
      <div style={filterToggleStyle}>
        <style>
          {`@keyframes leaderboard-refresh-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .refresh-button,
            .refresh-button:hover,
            .refresh-button:focus,
            .refresh-button:active,
            .refresh-button:focus-visible {
              background: transparent !important;
              border: none !important;
              outline: none !important;
              box-shadow: none !important;
              -webkit-box-shadow: none !important;
              -moz-box-shadow: none !important;
            }`}
        </style>
        <button
          className="refresh-button"
          style={refreshButtonStyle(isRefreshing)}
          onClick={() => fetchLeaderboards({ skipGlobalLoading: true, showManualIndicator: true })}
          disabled={isRefreshing}
          aria-label="Refresh leaderboard"
          title="Refresh leaderboard"
        >
          <span style={refreshIconStyle(isRefreshing)}>⟳</span>
        </button>
      </div>
      {/* Show only the selected leaderboard */}
      {selectedLeaderboard === 'event' && eventId && (
        <LeaderboardCardsList
          data={eventLeaderboard}
          title="Event Leaderboard"
        />
      )}
      {selectedLeaderboard === 'overall' && (
        <LeaderboardCardsList
          data={overallLeaderboard}
          title="Overall Leaderboard"
        />
      )}
      {selectedLeaderboard === 'monthly' && (
        <LeaderboardCardsList
          data={monthlyLeaderboard}
          title="Monthly Leaderboard"
        />
      )}
    </div>
  );
}

export default Leaderboard; 