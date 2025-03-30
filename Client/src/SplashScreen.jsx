import React from 'react';

function SplashScreen() {
  const containerStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const logoStyle = {
    fontSize: '3rem',
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: '20px',
    animation: 'pulse 2s infinite',
    background: 'linear-gradient(45deg, #6366f1, #8b5cf6, #d946ef)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textShadow: '0 0 30px rgba(139, 92, 246, 0.5)'
  };

  const pulseStyle = {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    animation: 'ripple 1.5s infinite ease-out',
    position: 'absolute'
  };

  return (
    <div style={containerStyle}>
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
          }
          @keyframes ripple {
            0% { transform: scale(0.8); opacity: 1; }
            100% { transform: scale(2); opacity: 0; }
          }
        `}
      </style>
      <div style={pulseStyle}></div>
      <div style={logoStyle}>Fight Picker</div>
    </div>
  );
}

export default SplashScreen; 