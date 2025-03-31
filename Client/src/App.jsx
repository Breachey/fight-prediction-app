// client/src/App.js
import React, { useState, useEffect } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';
import FightAdmin from './FightAdmin';
import Leaderboard from './Leaderboard';
import EventSelector from './EventSelector';
import AdminPin from './AdminPin';
import UserAuth from './UserAuth';
import logo from './assets/logo.png';
import './App.css';

function App() {
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is already logged in
    const savedUsername = localStorage.getItem('username');
    const savedPhoneNumber = localStorage.getItem('phoneNumber');
    if (savedUsername && savedPhoneNumber) {
      setUser({ username: savedUsername, phoneNumber: savedPhoneNumber });
    }
  }, []);

  const handleAuthentication = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    localStorage.removeItem('phoneNumber');
    setUser(null);
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px'
  };

  const userInfoStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  };

  const logoutButtonStyle = {
    padding: '8px 16px',
    borderRadius: '8px',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem'
  };

  if (!user) {
    return (
      <div className="app">
        <header className="header">
          <img src={logo} alt="Fight Picks Logo" className="logo" />
        </header>
        <UserAuth onAuthenticate={handleAuthentication} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header" style={headerStyle}>
        <img src={logo} alt="Fight Picks Logo" className="logo" />
        <div style={userInfoStyle}>
          <span>Welcome, {user.username}</span>
          <button onClick={handleLogout} style={logoutButtonStyle}>
            Logout
          </button>
        </div>
      </header>

      <div className="section">
        <EventSelector 
          onEventSelect={setSelectedEventId} 
          selectedEventId={selectedEventId}
        />
      </div>

      <div className="section">
        <Fights eventId={selectedEventId} username={user.username} />
      </div>

      <div className="section">
        <VotedFights eventId={selectedEventId} username={user.username} />
      </div>

      <div className="section">
        <Leaderboard eventId={selectedEventId} />
      </div>

      {!isAdminAuthenticated ? (
        <div className="admin-section">
          <AdminPin onSuccess={() => setIsAdminAuthenticated(true)} />
        </div>
      ) : (
        <div className="admin-section">
          <FightAdmin eventId={selectedEventId} />
        </div>
      )}
    </div>
  );
}

export default App;