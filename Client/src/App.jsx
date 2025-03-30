// client/src/App.js
import React, { useState, useEffect } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';

function App() {
  const [currentUsername, setCurrentUsername] = useState(() => {
    // Initialize from localStorage if available, ensure it's not empty
    const storedUsername = localStorage.getItem('username');
    return storedUsername && storedUsername.trim() ? storedUsername : '';
  });

  // Update localStorage when username changes
  useEffect(() => {
    if (currentUsername?.trim()) {
      localStorage.setItem('username', currentUsername);
    } else {
      localStorage.removeItem('username');
    }
  }, [currentUsername]);

  const handleSetUsername = (username) => {
    if (username?.trim()) {
      setCurrentUsername(username);
      localStorage.setItem('username', username);
    } else {
      setCurrentUsername('');
      localStorage.removeItem('username');
    }
  };

  return (
    <div className="App">
      <Fights setCurrentUsername={handleSetUsername} />
      {currentUsername?.trim() && <VotedFights currentUsername={currentUsername} />}
    </div>
  );
}

export default App;