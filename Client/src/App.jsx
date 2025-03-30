// client/src/App.js
import React, { useState } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';
import FightAdmin from './FightAdmin';
import Leaderboard from './Leaderboard';
import AdminPin from './AdminPin';

function App() {
  const [currentUsername, setCurrentUsername] = useState(localStorage.getItem('currentUsername') || '');
  const [currentView, setCurrentView] = useState('fights'); // fights, admin, leaderboard
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // Save username to localStorage when it changes
  const handleUsernameChange = (newUsername) => {
    setCurrentUsername(newUsername);
    localStorage.setItem('currentUsername', newUsername);
  };

  const handleAdminSuccess = () => {
    setIsAdminAuthenticated(true);
  };

  const containerStyle = {
    minHeight: '100vh',
    backgroundColor: '#111827',
    color: '#ffffff',
    padding: '20px 0'
  };

  const navStyle = {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '30px',
    padding: '0 20px'
  };

  const navButtonStyle = (isActive) => ({
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: isActive ? '#3b82f6' : '#1f2937',
    color: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontSize: '1rem',
    fontWeight: isActive ? 'bold' : 'normal'
  });

  return (
    <div style={containerStyle}>
      <nav style={navStyle}>
        <button
          style={navButtonStyle(currentView === 'fights')}
          onClick={() => setCurrentView('fights')}
        >
          Fights
        </button>
        <button
          style={navButtonStyle(currentView === 'admin')}
          onClick={() => {
            setCurrentView('admin');
            if (!isAdminAuthenticated) {
              setIsAdminAuthenticated(false);
            }
          }}
        >
          Admin
        </button>
        <button
          style={navButtonStyle(currentView === 'leaderboard')}
          onClick={() => setCurrentView('leaderboard')}
        >
          Leaderboard
        </button>
      </nav>

      {currentView === 'fights' && (
        <>
          <Fights
            currentUsername={currentUsername}
            setCurrentUsername={handleUsernameChange}
          />
          <VotedFights />
        </>
      )}

      {currentView === 'admin' && (
        isAdminAuthenticated ? (
          <FightAdmin />
        ) : (
          <AdminPin onSuccess={handleAdminSuccess} />
        )
      )}
      
      {currentView === 'leaderboard' && <Leaderboard />}
    </div>
  );
}

export default App;