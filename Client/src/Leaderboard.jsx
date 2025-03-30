import React, { useEffect, useState } from 'react';

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('https://fight-prediction-app-b0vt.onrender.com/leaderboard');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load leaderboard');
      }
      const data = await response.json();
      console.log('Leaderboard data:', data); // Debug log
      setLeaderboard(data || []);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  const containerStyle = {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto'
  };

  const titleStyle = {
    fontSize: '2rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '30px',
    color: '#ffffff'
  };

  const tableStyle = {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: '16px',
    overflow: 'hidden',
    borderCollapse: 'collapse'
  };

  const headerStyle = {
    backgroundColor: '#2d3748',
    color: '#ffffff',
    padding: '15px',
    textAlign: 'left'
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
    padding: '20px',
    textAlign: 'center',
    color: '#ef4444',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    marginBottom: '20px'
  };

  const emptyStyle = {
    padding: '30px',
    textAlign: 'center',
    color: '#9ca3af',
    backgroundColor: '#1a1a1a',
    borderRadius: '8px'
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

  if (!leaderboard.length) {
    return (
      <div style={containerStyle}>
        <h1 style={titleStyle}>Leaderboard</h1>
        <div style={emptyStyle}>
          No predictions have been made yet. Make some predictions to appear on the leaderboard!
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Leaderboard</h1>
      
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
          {leaderboard.map((entry, index) => (
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
  );
}

export default Leaderboard; 