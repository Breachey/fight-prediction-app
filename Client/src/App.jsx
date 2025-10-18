// client/src/App.js
// Main App component for Fight Picker application
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Link, Routes, Route, useNavigate } from 'react-router-dom';
import EventSelector from './EventSelector'; // Dropdown to select an event
import UserAuth from './UserAuth'; // User login/signup component
import SplashScreen from './components/SplashScreen'; // Splash/loading screen
import PlayerCard from './components/PlayerCard'; // PlayerCard component for header
import logo from './assets/logo_street_500x500.png';
import { API_URL } from './config';
import './App.css';

// Lazy load heavy components to improve initial load time
const Fights = lazy(() => import('./Fights'));
const Leaderboard = lazy(() => import('./Leaderboard'));
const ProfilePage = lazy(() => import('./ProfilePage'));

function App() {
  // State for selected event, user info, and loading status
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On mount: show splash, check for saved user in localStorage, set user if found
    const initializeApp = async () => {
      try {
        const savedUsername = localStorage.getItem('username');
        const savedPhoneNumber = localStorage.getItem('phoneNumber');
        const savedUserId = localStorage.getItem('user_id');
        const savedUserType = localStorage.getItem('user_type');
        // Simulate splash screen minimum time (reduced for performance)
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (savedUsername && savedPhoneNumber && savedUserId) {
          // Fetch user data including playercard from backend
          try {
            const response = await fetch(`${API_URL}/user/by-id/${savedUserId}`);
            if (response.ok) {
              const userData = await response.json();
              setUser({ 
                username: savedUsername, 
                phoneNumber: savedPhoneNumber, 
                user_id: savedUserId,
                user_type: savedUserType || 'user',
                playercard: userData.playercards || null
              });
            } else {
              // Fallback to localStorage data if API fails
              setUser({ 
                username: savedUsername, 
                phoneNumber: savedPhoneNumber, 
                user_id: savedUserId,
                user_type: savedUserType || 'user'
              });
            }
          } catch (error) {
            console.error('Error fetching user playercard:', error);
            // Fallback to localStorage data if API fails
            setUser({ 
              username: savedUsername, 
              phoneNumber: savedPhoneNumber, 
              user_id: savedUserId,
              user_type: savedUserType || 'user'
            });
          }
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
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_type');
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
        <footer className="footer">Made by Scrap & Screach</footer>
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
          <Link to={`/profile/${user.user_id}`} style={{ textDecoration: 'none' }}>
            <PlayerCard
              username={user.username}
              playercard={user.playercard}
              size="small"
              isCurrentUser={true}
            />
          </Link>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>
      <Suspense fallback={<div className="loading-message">Loading...</div>}>
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
                <Fights eventId={selectedEventId} username={user.username} user_id={user.user_id} user_type={user.user_type} />
              </div>
              {/* Leaderboard for selected event */}
              <div className="section">
                <Leaderboard eventId={selectedEventId} currentUser={user.username} />
              </div>
            </>
          } />
          <Route path="/profile/:user_id" element={<ProfilePage user={user} />} />
          <Route path="/profile" element={<ProfilePage user={user} />} />
        </Routes>
      </Suspense>
      <footer className="footer">Made by Scrap & Screach</footer>
    </div>
  );
}

export default App;