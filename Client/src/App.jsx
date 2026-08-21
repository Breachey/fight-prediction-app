// client/src/App.js
// Main App component for Fight Picker application
import React, { useState, useEffect, lazy, Suspense, useRef, useCallback } from 'react';
import { Link, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import UserAuth from './UserAuth'; // User login/signup component
import SplashScreen from './components/SplashScreen'; // Splash/loading screen
import NotificationCenter from './components/NotificationCenter';
import logo from './assets/fytpix_500x500.png';
import { API_URL } from './config';
import { APP_VERSION_LABEL } from './buildInfo';
import { clearAdminSession, getAdminSessionExpiry, getAdminSessionToken, storeAdminSession } from './utils/adminSession';
import { clearUserSession, fetchWithUserSession, getUserSessionToken, storeUserSession } from './utils/userSession';
import { clearPrivateCache } from './utils/apiCache';
import { buildWorkspaceSearch, resolveWorkspaceState, VALID_WORKSPACE_VIEWS } from './utils/workspaceState';
import './App.css';

// Lazy load heavy components to improve initial load time
const EventSelector = lazy(() => import('./EventSelector'));
const Fights = lazy(() => import('./Fights'));
const Leaderboard = lazy(() => import('./Leaderboard'));
const PropPix = lazy(() => import('./components/PropPix'));
const ProfilePage = lazy(() => import('./ProfilePage'));
const HighlightsPage = lazy(() => import('./HighlightsPage'));
const LOGIN_BACKGROUND_1X = '/izzy_alex_640.jpg';
const LOGIN_BACKGROUND_2X = '/izzy_alex_1280.jpg';
const LOGIN_BACKGROUND_3X = '/izzy_alex_1920.jpg';
const LAST_EVENT_STORAGE_KEY = 'fight-picker:last-event';
const SHOW_AI_USERS_STORAGE_KEY = 'fight-picker:show-ai-users';

function readInitialEventId(locationSearch) {
  let storedEventId = null;
  try {
    storedEventId = localStorage.getItem(LAST_EVENT_STORAGE_KEY);
  } catch {
    // URL state remains available when storage is unavailable.
  }
  return resolveWorkspaceState(locationSearch, storedEventId).eventId;
}

function readShowAIUsersPreference() {
  try {
    return localStorage.getItem(SHOW_AI_USERS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function RouteLoadingState({ label = 'Loading view' }) {
  return (
    <div className="route-skeleton" role="status" aria-live="polite">
      <span className="route-skeleton__line route-skeleton__line--short"></span>
      <span className="route-skeleton__block"></span>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

function persistAuthenticatedUser(userData) {
  localStorage.setItem('user_id', userData.user_id);
  localStorage.setItem('username', userData.username);
  localStorage.setItem('user_type', userData.user_type || 'user');
  localStorage.removeItem('phoneNumber');

  if (userData.user_session_token) {
    storeUserSession(userData.user_session_token, userData.user_session_expires_at);
  } else {
    clearUserSession();
  }

  if (userData.admin_session_token) {
    storeAdminSession(userData.admin_session_token, userData.admin_session_expires_at);
  } else {
    clearAdminSession();
  }
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMainPage = location.pathname === '/';
  // State for selected event, user info, and loading status
  const [selectedEventId, setSelectedEventId] = useState(() => readInitialEventId(location.search));
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [leaderboardRefreshToken, setLeaderboardRefreshToken] = useState(0);
  const [fightCardRefreshToken, setFightCardRefreshToken] = useState(0);
  const [showAIUsers, setShowAIUsers] = useState(readShowAIUsersPreference);
  const menuRef = useRef(null);
  const workspaceState = resolveWorkspaceState(location.search);
  const activeWorkspaceView = workspaceState.view;

  useEffect(() => {
    let isMounted = true;
    const savedUserSessionToken = getUserSessionToken();
    const savedAdminSessionToken = getAdminSessionToken();
    const savedAdminSessionExpiry = getAdminSessionExpiry();

    (async () => {
      if (!savedUserSessionToken) {
        clearAdminSession();
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const response = await fetchWithUserSession(`${API_URL}/session`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Session validation failed');
        const userData = await response.json();
        localStorage.setItem('user_id', userData.user_id);
        localStorage.setItem('username', userData.username);
        localStorage.setItem('user_type', userData.user_type || 'user');
        localStorage.removeItem('phoneNumber');

        if (userData.user_type !== 'admin') clearAdminSession();
        if (isMounted) {
          setUser({
            ...userData,
            user_session_token: savedUserSessionToken,
            admin_session_token: userData.user_type === 'admin' ? (savedAdminSessionToken || null) : null,
            admin_session_expires_at: userData.user_type === 'admin' ? (savedAdminSessionExpiry || null) : null,
            playercard: userData.playercards || null,
          });
        }
      } catch (error) {
        clearUserSession();
        clearAdminSession();
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        localStorage.removeItem('user_type');
        localStorage.removeItem('phoneNumber');
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Called when user successfully logs in or signs up
  const handleAuthentication = (userData) => {
    persistAuthenticatedUser(userData);
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

    if (getUserSessionToken()) {
      try {
        await fetchWithUserSession(`${API_URL}/session/logout`, { method: 'POST' });
      } catch (error) {
        console.warn('Failed to revoke user session during logout:', error);
      }
    }

    localStorage.removeItem('username');
    localStorage.removeItem('phoneNumber');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_type');
    clearUserSession();
    clearAdminSession();
    clearPrivateCache();
    setUser(null);
    setIsMenuOpen(false);
  };

  const handleLeaderboardRefreshRequest = () => {
    setLeaderboardRefreshToken((current) => current + 1);
  };

  const handleFightCardImportComplete = () => {
    setFightCardRefreshToken((current) => current + 1);
  };

  const handleToggleAIUsers = () => {
    setShowAIUsers((current) => {
      const next = !current;
      try {
        localStorage.setItem(SHOW_AI_USERS_STORAGE_KEY, String(next));
      } catch {
        // The preference still applies for this session if storage is unavailable.
      }
      return next;
    });
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

  const updateWorkspaceUrl = useCallback((nextEventId, nextView = activeWorkspaceView, { replace = false } = {}) => {
    navigate(`/${buildWorkspaceSearch(nextEventId, nextView)}`, { replace });
  }, [activeWorkspaceView, navigate]);

  const handleEventSelect = useCallback((eventId) => {
    setSelectedEventId(eventId);
    try {
      localStorage.setItem(LAST_EVENT_STORAGE_KEY, String(eventId));
    } catch {
      // Storage can be unavailable in private browsing; URL state remains authoritative.
    }
    const currentQueryEventId = new URLSearchParams(location.search).get('event');
    if (String(currentQueryEventId || '') !== String(eventId)) {
      updateWorkspaceUrl(eventId, activeWorkspaceView, { replace: !currentQueryEventId });
    }
  }, [activeWorkspaceView, location.search, updateWorkspaceUrl]);

  useEffect(() => {
    if (!isMainPage) return;
    const params = new URLSearchParams(location.search);
    const queryEventId = params.get('event');
    const queryView = params.get('view');
    if (queryEventId && String(queryEventId) !== String(selectedEventId || '')) {
      setSelectedEventId(queryEventId);
    }
    if (!VALID_WORKSPACE_VIEWS.has(queryView)) {
      updateWorkspaceUrl(queryEventId || selectedEventId, 'picks', { replace: true });
    }
  }, [isMainPage, location.search, selectedEventId, updateWorkspaceUrl]);

  // Show splash screen while loading
  if (isLoading) {
    return <SplashScreen />;
  }

  // If not logged in, show login/signup screen
  if (!user) {
    const loginBackgroundImageSet = `url("${LOGIN_BACKGROUND_1X}") 1x, url("${LOGIN_BACKGROUND_2X}") 2x, url("${LOGIN_BACKGROUND_3X}") 3x`;
    const loginBackgroundStyle = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      '--login-background-image': `url("${LOGIN_BACKGROUND_2X}")`,
      '--login-background-image-set': loginBackgroundImageSet,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      filter: 'blur(8px) brightness(0.3)',
      zIndex: 0,
      transform: 'scale(1.1)' // Slight scale to prevent blur edge artifacts
    };

    return (
      <div className="app app--auth">
        <div className="login-background" style={loginBackgroundStyle}></div>
        <div className="auth-shell">
          <header className="header header--auth">
            <Link to="/">
              <img src={logo} alt="Fight Picks Logo" className="logo" width="501" height="501" />
            </Link>
          </header>
          <UserAuth onAuthenticate={handleAuthentication} />
          <footer className="footer">
            <span>Made by Scrap & Screach</span>
            <span className="footer-version">{APP_VERSION_LABEL}</span>
          </footer>
        </div>
      </div>
    );
  }

  // Main app UI when user is logged in
  return (
    <div className="app app--authenticated">
      <aside className="desktop-rail" aria-label="Primary navigation">
        <Link to={`/?event=${selectedEventId || ''}&view=picks`} className="desktop-rail__brand" aria-label="Fight Picks home">
          <img src={logo} alt="" width="501" height="501" />
        </Link>
        <nav className="desktop-rail__nav">
          <Link className={isMainPage && activeWorkspaceView === 'picks' ? 'is-active' : ''} to={`/?event=${selectedEventId || ''}&view=picks`}><span>P</span>Picks</Link>
          <Link className={isMainPage && activeWorkspaceView === 'props' ? 'is-active' : ''} to={`/?event=${selectedEventId || ''}&view=props`}><span>B</span>Prop Pix</Link>
          <Link className={isMainPage && activeWorkspaceView === 'leaderboard' ? 'is-active' : ''} to={`/?event=${selectedEventId || ''}&view=leaderboard`}><span>L</span>Leaderboard</Link>
          <Link className={location.pathname.startsWith('/stats') || location.pathname.startsWith('/highlights') ? 'is-active' : ''} to="/stats"><span>S</span>Stats</Link>
          <Link className={location.pathname.startsWith('/profile') ? 'is-active' : ''} to={`/profile/${user.user_id}`}><span>U</span>Profile</Link>
        </nav>
        <span className="desktop-rail__version">{APP_VERSION_LABEL}</span>
      </aside>
      <header className="header app-header">
        <Link to={`/?event=${selectedEventId || ''}&view=picks`} className="mobile-brand">
          <img src={logo} alt="Fight Picks" className="logo" width="501" height="501" />
        </Link>
        <div className="app-header__context">
          <span>{isMainPage ? selectedEvent?.name || 'Fight Picks' : 'Fight Picks'}</span>
          <small>{user.username}</small>
        </div>
        <div className="app-header-actions">
          <NotificationCenter userId={user.user_id} />
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
        </div>
      </header>
      {isMainPage && (
        <nav className="workspace-tabs" aria-label="Event workspace">
          {[
            ['picks', 'Picks'],
            ['props', 'Prop Pix'],
            ['leaderboard', 'Leaderboard'],
          ].map(([view, label]) => (
            <button
              key={view}
              type="button"
              className={activeWorkspaceView === view ? 'is-active' : ''}
              aria-pressed={activeWorkspaceView === view}
              onClick={() => updateWorkspaceUrl(selectedEventId, view)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <main className="app-main">
      <Suspense fallback={<RouteLoadingState />}>
        <Routes>
          <Route path="/" element={
            <>
              <div className="section event-selector-section">
                <EventSelector 
                  onEventSelect={handleEventSelect}
                  selectedEventId={selectedEventId}
                  onSelectedEventChange={setSelectedEvent}
                  userType={user.user_type}
                  onFightCardImportComplete={handleFightCardImportComplete}
                />
              </div>
              {activeWorkspaceView === 'picks' && <div className="section fights-section workspace-view">
                <Fights
                  eventId={selectedEventId}
                  username={user.username}
                  user_id={user.user_id}
                  user_type={user.user_type}
                  onLeaderboardRefresh={handleLeaderboardRefreshRequest}
                  refreshToken={fightCardRefreshToken}
                  isEventComplete={Boolean(selectedEvent?.is_completed)}
                  showAIUsers={showAIUsers}
                />
              </div>}
              {activeWorkspaceView === 'props' && <div className="section prop-pix-section workspace-view">
                <PropPix eventId={selectedEventId} userId={user.user_id} userType={user.user_type} />
              </div>}
              {activeWorkspaceView === 'leaderboard' && <div className="section leaderboard-section workspace-view">
                <Leaderboard
                  eventId={selectedEventId}
                  currentUser={user.username}
                  currentUserId={user.user_id}
                  refreshToken={leaderboardRefreshToken}
                  isEventComplete={Boolean(selectedEvent?.is_completed)}
                  showAIUsers={showAIUsers}
                />
              </div>}
            </>
          } />
          <Route path="/stats" element={<HighlightsPage user={user} />} />
          <Route path="/stats/:period" element={<HighlightsPage user={user} />} />
          <Route path="/highlights" element={<HighlightsPage user={user} />} />
          <Route path="/highlights/:year" element={<HighlightsPage user={user} />} />
          <Route path="/profile/:user_id" element={<ProfilePage user={user} />} />
          <Route path="/profile" element={<ProfilePage user={user} />} />
        </Routes>
      </Suspense>
      </main>
      <footer className="footer">
        <div className="footer-ai-preference">
          <span id="footer-ai-preference-label">AI users</span>
          <button
            type="button"
            className="footer-ai-toggle"
            role="switch"
            aria-checked={showAIUsers}
            aria-labelledby="footer-ai-preference-label footer-ai-preference-state"
            onClick={handleToggleAIUsers}
          >
            <span className="footer-ai-toggle__track" aria-hidden="true">
              <span className="footer-ai-toggle__thumb"></span>
            </span>
            <span id="footer-ai-preference-state">{showAIUsers ? 'Shown' : 'Hidden'}</span>
          </button>
        </div>
        <span>Made by Scrap & Screach</span>
        <span className="footer-version">{APP_VERSION_LABEL}</span>
      </footer>
    </div>
  );
}

export default App;
