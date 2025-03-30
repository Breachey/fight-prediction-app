// client/src/App.js
import React, { useState } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';
import FightAdmin from './FightAdmin';
import Leaderboard from './Leaderboard';
import EventSelector from './EventSelector';
import AdminPin from './AdminPin';
import logo from './assets/logo.png';
import './App.css';

function App() {
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  return (
    <div className="app">
      <header className="header">
        <img src={logo} alt="Fight Picks Logo" className="logo" />
      </header>

      <div className="section">
        <EventSelector 
          onEventSelect={setSelectedEventId} 
          selectedEventId={selectedEventId}
        />
      </div>

      <div className="section">
        <Fights eventId={selectedEventId} />
      </div>

      <div className="section">
        <VotedFights eventId={selectedEventId} />
      </div>

      <div className="section">
        <Leaderboard eventId={selectedEventId} />
      </div>

      {!isAdminAuthenticated ? (
        <div className="admin-section">
          <AdminPin onAuthenticate={() => setIsAdminAuthenticated(true)} />
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