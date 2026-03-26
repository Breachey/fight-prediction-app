// client/src/App.js
// Main App component for Fight Picker application
import React, { useState, useEffect, lazy, Suspense, useRef, useMemo } from 'react';
import { Link, Routes, Route, useLocation } from 'react-router-dom';
import EventSelector from './EventSelector'; // Dropdown to select an event
import UserAuth from './UserAuth'; // User login/signup component
import SplashScreen from './components/SplashScreen'; // Splash/loading screen
import logo from './assets/fytpix_500x500.png';
import { API_URL } from './config';
import { extractPosterAccents, DEFAULT_EVENT_ACCENTS } from './utils/posterAccentTheme';
import { clearAdminSession, getAdminSessionExpiry, getAdminSessionToken } from './utils/adminSession';
import './App.css';

// Lazy load heavy components to improve initial load time
const Fights = lazy(() => import('./Fights'));
const Leaderboard = lazy(() => import('./Leaderboard'));
const ProfilePage = lazy(() => import('./ProfilePage'));
const HighlightsPage = lazy(() => import('./HighlightsPage'));

function App() {
  const location = useLocation();
  const isMainPage = location.pathname === '/';
  // State for selected event, user info, and loading status
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventAccents, setEventAccents] = useState(DEFAULT_EVENT_ACCENTS);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [leaderboardRefreshToken, setLeaderboardRefreshToken] = useState(0);
  const [fightCardRefreshToken, setFightCardRefreshToken] = useState(0);
  const menuRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    // On mount: check for saved user in localStorage and render immediately
    const savedUsername = localStorage.getItem('username');
    const savedPhoneNumber = localStorage.getItem('phoneNumber');
    const savedUserId = localStorage.getItem('user_id');
    const savedUserType = localStorage.getItem('user_type');
    const savedAdminSessionToken = getAdminSessionToken();
    const savedAdminSessionExpiry = getAdminSessionExpiry();

    if (savedUsername && savedPhoneNumber && savedUserId) {
      // Render with cached user immediately
      setUser({ 
        username: savedUsername, 
        phoneNumber: savedPhoneNumber, 
        user_id: savedUserId,
        user_type: savedUserType || 'user',
        admin_session_token: savedAdminSessionToken || null,
        admin_session_expires_at: savedAdminSessionExpiry || null,
      });

      // Fetch playercard in the background
      (async () => {
        try {
          const response = await fetch(`${API_URL}/user/by-id/${savedUserId}`);
          if (!response.ok) return;
          const userData = await response.json();
          if (userData.user_type) {
            localStorage.setItem('user_type', userData.user_type);
          }
          if (userData.user_type !== 'admin') {
            clearAdminSession();
          }
          if (isMounted) {
            setUser({ 
              username: savedUsername, 
              phoneNumber: savedPhoneNumber, 
              user_id: savedUserId,
              user_type: userData.user_type || savedUserType || 'user',
              admin_session_token: userData.user_type === 'admin' ? (savedAdminSessionToken || null) : null,
              admin_session_expires_at: userData.user_type === 'admin' ? (savedAdminSessionExpiry || null) : null,
              playercard: userData.playercards || null
            });
          }
        } catch (error) {
          console.error('Error fetching user playercard:', error);
        }
      })();
    }

    setIsLoading(false);

    return () => {
      isMounted = false;
    };
  }, []);

  // Called when user successfully logs in or signs up
  const handleAuthentication = (userData) => {
    setUser(userData);
  };

  // Logs out user and clears localStorage
  const handleLogout = async () => {
    const adminSessionToken = getAdminSessionToken();
    if (adminSessionToken) {
      try {
        await fetch(`${API_URL}/admin/session/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminSessionToken}`,
          },
        });
      } catch (error) {
        console.warn('Failed to revoke admin session during logout:', error);
      }
    }

    localStorage.removeItem('username');
    localStorage.removeItem('phoneNumber');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_type');
    clearAdminSession();
    setUser(null);
    setIsMenuOpen(false);
  };

  const handleLeaderboardRefreshRequest = () => {
    setLeaderboardRefreshToken((current) => current + 1);
  };

  const handleFightCardImportComplete = () => {
    setFightCardRefreshToken((current) => current + 1);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isMenuOpen]);

  useEffect(() => {
    let isMounted = true;
    const imageUrl = selectedEvent?.image_url || '';

    if (!imageUrl) {
      setEventAccents(DEFAULT_EVENT_ACCENTS);
      return () => {
        isMounted = false;
      };
    }

    (async () => {
      const accents = await extractPosterAccents(imageUrl);
      if (isMounted) {
        setEventAccents(accents);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [selectedEvent?.id, selectedEvent?.image_url]);

  const activeAccents = isMainPage ? eventAccents : DEFAULT_EVENT_ACCENTS;

  const appAccentStyle = useMemo(
    () => ({
      '--event-accent-1': activeAccents.primaryHex,
      '--event-accent-2': activeAccents.secondaryHex,
      '--event-accent-1-rgb': activeAccents.primaryRgb,
      '--event-accent-2-rgb': activeAccents.secondaryRgb,
      '--event-surface-rgb': activeAccents.surfaceRgb,
      '--event-background-rgb': activeAccents.backgroundRgb,
      '--event-ink-rgb': activeAccents.inkRgb,
      '--event-muted-rgb': activeAccents.mutedRgb,
      '--event-border-rgb': activeAccents.borderRgb,
      '--event-button-text-rgb': activeAccents.buttonTextRgb,
      '--event-glow-1-alpha': activeAccents.glow1Alpha,
      '--event-glow-2-alpha': activeAccents.glow2Alpha,
      '--event-panel-glow-alpha': activeAccents.panelGlowAlpha,
      '--event-panel-glow-alpha-strong': activeAccents.panelGlowAlphaStrong,
    }),
    [activeAccents]
  );

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

  // Show splash screen while loading
  if (isLoading) {
    return <SplashScreen />;
  }

  // If not logged in, show login/signup screen
  if (!user) {
    const loginBackgroundStyle = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      filter: 'blur(8px) brightness(0.3)',
      zIndex: 0,
      transform: 'scale(1.1)' // Slight scale to prevent blur edge artifacts
    };

    return (
      <div className="app" data-event-theme={activeAccents.mode} style={{ ...appAccentStyle, position: 'relative', overflow: 'hidden' }}>
        <div className="login-background" style={loginBackgroundStyle}></div>
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
          <header className="header" style={loginHeaderStyle}>
            <Link to="/">
              <img src={logo} alt="Fight Picks Logo" className="logo" style={{ cursor: 'pointer' }} />
            </Link>
          </header>
          <UserAuth onAuthenticate={handleAuthentication} />
          <footer className="footer">Made by Scrap & Screach</footer>
        </div>
      </div>
    );
  }

  // Main app UI when user is logged in
  return (
    <div className="app" data-event-theme={activeAccents.mode} style={appAccentStyle}>
      <header className="header" style={headerStyle}>
        <Link to="/">
          <img src={logo} alt="Fight Picks Logo" className="logo" style={{ cursor: 'pointer' }} />
        </Link>
        <div className="hamburger-menu-container" ref={menuRef}>
          <button 
            className="hamburger-menu-button" 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Menu"
          >
            <span className={`hamburger-line ${isMenuOpen ? 'open' : ''}`}></span>
            <span className={`hamburger-line ${isMenuOpen ? 'open' : ''}`}></span>
            <span className={`hamburger-line ${isMenuOpen ? 'open' : ''}`}></span>
          </button>
          {isMenuOpen && (
            <div className="hamburger-menu-dropdown">
              <Link 
                to={`/profile/${user.user_id}`} 
                className="hamburger-menu-item"
                onClick={() => setIsMenuOpen(false)}
              >
                Profile
              </Link>
              <Link
                to="/stats"
                className="hamburger-menu-item"
                onClick={() => setIsMenuOpen(false)}
              >
                Stats
              </Link>
              <button 
                className="hamburger-menu-item hamburger-menu-logout"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
      <Suspense fallback={<div className="loading-message">Loading...</div>}>
        <Routes>
          <Route path="/" element={
            <>
              {/* Greeting message */}
              <div className="welcome-greeting">
                Hi, {user.username}
              </div>
              {/* Event selection dropdown */}
              <div className="section event-selector-section">
                <EventSelector 
                  onEventSelect={setSelectedEventId} 
                  selectedEventId={selectedEventId}
                  onSelectedEventChange={setSelectedEvent}
                  userType={user.user_type}
                  onFightCardImportComplete={handleFightCardImportComplete}
                />
              </div>
              <div className="section-divider" aria-hidden="true"></div>
              {/* Fights list for selected event */}
              <div className="section fights-section">
                <Fights
                  eventId={selectedEventId}
                  username={user.username}
                  user_id={user.user_id}
                  user_type={user.user_type}
                  onLeaderboardRefresh={handleLeaderboardRefreshRequest}
                  refreshToken={fightCardRefreshToken}
                />
              </div>
              <div className="section-divider" aria-hidden="true"></div>
              {/* Leaderboard for selected event */}
              <div className="section leaderboard-section">
                <Leaderboard
                  eventId={selectedEventId}
                  currentUser={user.username}
                  currentUserId={user.user_id}
                  refreshToken={leaderboardRefreshToken}
                />
              </div>
            </>
          } />
          <Route path="/stats" element={<HighlightsPage user={user} defaultYear={2025} />} />
          <Route path="/stats/:period" element={<HighlightsPage user={user} defaultYear={2025} />} />
          <Route path="/highlights" element={<HighlightsPage user={user} defaultYear={2025} />} />
          <Route path="/highlights/:year" element={<HighlightsPage user={user} defaultYear={2025} />} />
          <Route path="/profile/:user_id" element={<ProfilePage user={user} />} />
          <Route path="/profile" element={<ProfilePage user={user} />} />
        </Routes>
      </Suspense>
      <footer className="footer">Made by Scrap & Screach</footer>
    </div>
  );
}

export default App;
