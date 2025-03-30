// client/src/App.js
import React, { useState, useEffect } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';

function App() {
  const [currentUsername, setCurrentUsername] = useState(() => {
    // Initialize from localStorage if available, ensure it's not empty
    const storedUsername = localStorage.getItem('currentUsername');
    return storedUsername && storedUsername.trim() ? storedUsername : '';
  });

  // Update localStorage when username changes
  useEffect(() => {
    if (currentUsername?.trim()) {
      localStorage.setItem('currentUsername', currentUsername);
    } else {
      localStorage.removeItem('currentUsername');
    }
  }, [currentUsername]);

  const handleSetUsername = (username) => {
    if (username?.trim()) {
      setCurrentUsername(username);
      localStorage.setItem('currentUsername', username);
    } else {
      setCurrentUsername('');
      localStorage.removeItem('currentUsername');
    }
  };

  const appStyle = {
    width: '100%',
    maxWidth: '100vw',
    overflowX: 'hidden',
    position: 'relative'
  };

  return (
    <div className="App" style={appStyle}>
      <Fights currentUsername={currentUsername} setCurrentUsername={handleSetUsername} />
      <VotedFights />
    </div>
  );
}

export default App;