// client/src/App.js
import React, { useState, useEffect } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';
import FightAdmin from './FightAdmin';
import Leaderboard from './Leaderboard';
import EventSelector from './EventSelector';
import AdminPin from './AdminPin';
import SplashScreen from './SplashScreen';

function App() {
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  const appStyle = {
    minHeight: '100vh',
    backgroundColor: '#0f0f0f',
    color: '#ffffff',
    padding: '20px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  };

  const headerStyle = {
    textAlign: 'center',
    marginBottom: '40px',
    background: 'linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)',
    padding: '30px',
    borderRadius: '16px',
    boxShadow: '0 4px 20px rgba(109, 40, 217, 0.2)'
  };

  const titleStyle = {
    fontSize: '2.5rem',
    fontWeight: '700',
    marginBottom: '10px',
    background: 'linear-gradient(to right, #e9d5ff, #ffffff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  };

  const subtitleStyle = {
    fontSize: '1.1rem',
    color: '#e9d5ff',
    opacity: 0.9
  };

  const sectionStyle = {
    background: '#1a1a1a',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '30px',
    border: '1px solid #2d1f47',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
  };

  const adminSectionStyle = {
    ...sectionStyle,
    borderColor: '#4c1d95',
    background: 'linear-gradient(145deg, #1a1a1a 0%, #2d1f47 100%)'
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <div style={appStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Fight Prediction App</h1>
        <p style={subtitleStyle}>Predict fights, track your accuracy, compete with others</p>
      </header>

      <div style={sectionStyle}>
        <EventSelector 
          onEventSelect={setSelectedEventId} 
          selectedEventId={selectedEventId}
        />
      </div>

      <div style={sectionStyle}>
        <Fights eventId={selectedEventId} />
      </div>

      <div style={sectionStyle}>
        <VotedFights eventId={selectedEventId} />
      </div>

      <div style={sectionStyle}>
        <Leaderboard eventId={selectedEventId} />
      </div>

      {!isAdminAuthenticated ? (
        <div style={adminSectionStyle}>
          <AdminPin onAuthenticate={() => setIsAdminAuthenticated(true)} />
        </div>
      ) : (
        <div style={adminSectionStyle}>
          <FightAdmin eventId={selectedEventId} />
        </div>
      )}
    </div>
  );
}

export default App;