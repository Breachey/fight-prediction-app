// client/src/App.js
// Main App component for Fight Picker application
import React, { useState, useEffect } from 'react';
import { Link, Routes, Route, useNavigate } from 'react-router-dom';
import Fights from './Fights'; // Displays fight cards for the selected event
import FightAdmin from './FightAdmin'; // Admin interface for managing fights
import Leaderboard from './Leaderboard'; // Displays leaderboard for the event
import EventSelector from './EventSelector'; // Dropdown to select an event
import AdminPin from './AdminPin'; // Admin PIN authentication component
import UserAuth from './UserAuth'; // User login/signup component
import SplashScreen from './components/SplashScreen'; // Splash/loading screen
import ProfilePage from './ProfilePage'; // New profile page component
import logo from './assets/Fight Picks Logo_White 500x500.png';
import './App.css';

function App() {
  // State for selected event, admin authentication, user info, and loading status
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On mount: show splash, check for saved user in localStorage, set user if found
    const initializeApp = async () => {
      try {
        const savedUsername = localStorage.getItem('username');
        const savedPhoneNumber = localStorage.getItem('phoneNumber');
        // Simulate splash screen minimum time
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

  // Called when user successfully logs in or signs up
  const handleAuthentication = (userData) => {
    setUser(userData);
  };

  // Logs out user and clears localStorage
  const handleLogout = () => {
    localStorage.removeItem('username');
    localStorage.removeItem('phoneNumber');
    setUser(null);
  };

  // Inline styles for layout and UI
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

  // Show splash screen while loading
  if (isLoading) {
    return <SplashScreen />;
  }

  // If not logged in, show login/signup screen
  if (!user) {
    return (
      <div className="app">
        <header className="header" style={loginHeaderStyle}>
          <Link to="/">
            <img src={logo} alt="Fight Picks Logo" className="logo" style={{ cursor: 'pointer' }} />
          </Link>
        </header>
        <UserAuth onAuthenticate={handleAuthentication} />
        <footer style={footerStyle}>Made by Scrap & Screach</footer>
      </div>
    );
  }

  // Main app UI when user is logged in
  return (
    <div className="app">
      <header className="header" style={headerStyle}>
        <Link to="/">
          <img src={logo} alt="Fight Picks Logo" className="logo" style={{ cursor: 'pointer' }} />
        </Link>
        <div style={userInfoStyle}>
          <span>Welcome, </span>
          <Link to="/profile" style={{ color: '#a78bfa', textDecoration: 'underline', fontWeight: 'bold', cursor: 'pointer' }}>
            {user.username}
          </Link>
          <button onClick={handleLogout} style={logoutButtonStyle}>
            Logout
          </button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={
          <>
            {/* Event selection dropdown */}
            <div className="section">
              <EventSelector 
                onEventSelect={setSelectedEventId} 
                selectedEventId={selectedEventId}
              />
            </div>
            {/* Fights list for selected event */}
            <div className="section">
              <Fights eventId={selectedEventId} username={user.username} />
            </div>
            {/* Leaderboard for selected event */}
            <div className="section">
              <Leaderboard eventId={selectedEventId} currentUser={user.username} />
            </div>
            {/* Admin section: show PIN entry or admin panel */}
            {!isAdminAuthenticated ? (
              <div className="admin-section">
                <AdminPin onSuccess={() => setIsAdminAuthenticated(true)} />
              </div>
            ) : (
              <div className="admin-section">
                <FightAdmin eventId={selectedEventId} />
              </div>
            )}
          </>
        } />
        <Route path="/profile/:username" element={<ProfilePage user={user} />} />
        <Route path="/profile" element={<ProfilePage user={user} />} />
      </Routes>
      <footer style={footerStyle}>Made by Scrap & Screach</footer>
    </div>
  );
}

export default App;