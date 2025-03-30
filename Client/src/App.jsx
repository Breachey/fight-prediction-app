// client/src/App.js
import React, { useState } from 'react';
import Fights from './Fights';
import VotedFights from './VotedFights';

function App() {
  // Assume you store the current username here after prediction submission.
  // Alternatively, you can use context or other state management.
  const [currentUsername, setCurrentUsername] = useState('');

  return (
    <div className="App">
      <Fights setCurrentUsername={setCurrentUsername} />
      {currentUsername && <VotedFights currentUsername={currentUsername} />}
    </div>
  );
}

export default App;