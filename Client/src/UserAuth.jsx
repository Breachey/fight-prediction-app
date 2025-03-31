import React, { useState } from 'react';

function UserAuth({ onAuthenticate }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const endpoint = isRegistering ? '/register' : '/login';
      const body = isRegistering 
        ? { phoneNumber, username }
        : { phoneNumber };

      const response = await fetch(`https://fight-prediction-app-b0vt.onrender.com${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Authentication failed');
      }

      const userData = await response.json();
      localStorage.setItem('username', userData.username);
      localStorage.setItem('phoneNumber', userData.phoneNumber);
      onAuthenticate(userData);
    } catch (err) {
      console.error('Authentication error:', err);
      setError(err.message);
    }
  };

  const containerStyle = {
    padding: '20px',
    maxWidth: '400px',
    margin: '0 auto',
    boxSizing: 'border-box'
  };

  const titleStyle = {
    fontSize: '2rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '30px',
    color: '#ffffff'
  };

  const formStyle = {
    backgroundColor: '#1a1a1a',
    padding: '30px',
    borderRadius: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    marginBottom: '15px',
    borderRadius: '8px',
    backgroundColor: '#2c2c2c',
    border: '1px solid #3b3b3b',
    color: '#ffffff',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.3s ease'
  };

  const buttonStyle = {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    marginBottom: '10px'
  };

  const toggleButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'transparent',
    border: '1px solid #3b82f6'
  };

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    marginTop: '10px',
    fontSize: '0.9rem'
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>{isRegistering ? 'Register' : 'Login'}</h1>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="Phone Number"
          pattern="[0-9]{10}"
          title="Please enter a valid 10-digit phone number"
          style={inputStyle}
          required
        />
        
        {isRegistering && (
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            style={inputStyle}
            required
          />
        )}

        <button type="submit" style={buttonStyle}>
          {isRegistering ? 'Register' : 'Login'}
        </button>

        <button 
          type="button" 
          style={toggleButtonStyle}
          onClick={() => {
            setIsRegistering(!isRegistering);
            setError('');
          }}
        >
          {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
        </button>

        {error && <div style={errorStyle}>{error}</div>}
      </form>
    </div>
  );
}

export default UserAuth; 