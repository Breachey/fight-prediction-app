// client/src/App.js
import React, { useState, useEffect } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';
import FightAdmin from './FightAdmin';
import Leaderboard from './Leaderboard';
import EventSelector from './EventSelector';
import AdminPin from './AdminPin';
import UserAuth from './UserAuth';
import SplashScreen from './components/SplashScreen';
import logo from './assets/Fight Picks Logo_White 500x500.png';
import './App.css';

function App() {
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading time and check user authentication
    const initializeApp = async () => {
      try {
        // Check if user is already logged in
        const savedUsername = localStorage.getItem('username');
        const savedPhoneNumber = localStorage.getItem('phoneNumber');
        
        // Simulate minimum loading time for splash screen
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (savedUsername && savedPhoneNumber) {
          setUser({ username: savedUsername, phoneNumber: savedPhoneNumber });
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
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
    padding: '20px',
    marginBottom: '40px'
  };

  const loginHeaderStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    marginBottom: '40px'
  };

  const userInfoStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  };

  const logoutButtonStyle = {
    padding: '8px 16px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)',
    color: '#ffffff',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'opacity 0.2s ease'
  };

  const footerStyle = {
    textAlign: 'center',
    padding: '20px',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '0.8rem',
    fontFamily: 'Inter, system-ui, sans-serif',
    letterSpacing: '0.05em',
    marginTop: 'auto',
    background: 'linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.2))'
  };

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!user) {
    return (
      <div className="app">
        <header className="header" style={loginHeaderStyle}>
          <img src={logo} alt="Fight Picks Logo" className="logo" />
        </header>
        <UserAuth onAuthenticate={handleAuthentication} />
        <footer style={footerStyle}>Made by Scrap & Screach</footer>
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
        <Leaderboard eventId={selectedEventId} currentUser={user.username} />
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

      <footer style={footerStyle}>Made by Scrap & Screach</footer>
    </div>
  );
}

export default App;