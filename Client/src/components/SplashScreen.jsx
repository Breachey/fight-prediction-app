import React from 'react';
import logo from '../assets/fytpix_400x400.webp';
import './SplashScreen.css';

function SplashScreen() {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <img 
          src={logo}
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