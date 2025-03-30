// client/src/App.js
import React, { useState, useEffect } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';

function App() {
  const [currentUsername, setCurrentUsername] = useState(() => {
    // Initialize from localStorage if available
    return localStorage.getItem('username') || '';
  });

  // Update localStorage when username changes
  useEffect(() => {
    if (currentUsername) {
      localStorage.setItem('username', currentUsername);
    }
  }, [currentUsername]);

  const handleSetUsername = (username) => {
    setCurrentUsername(username);
    localStorage.setItem('username', username);
  };

  return (
    <div className="App">
      <Fights setCurrentUsername={handleSetUsername} />
      {currentUsername && <VotedFights currentUsername={currentUsername} />}
    </div>
  );
}

export default App;