import React from 'react';
import './SplashScreen.css';

function SplashScreen() {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <img 
          src="/src/assets/Fight Picks Logo_White 500x500.png" 
          alt="Fight Picks Logo"
          className="splash-logo"
        />
        <div className="loading-bar">
          <div className="loading-progress"></div>
        </div>
      </div>
    </div>
  );
}

export default SplashScreen; 