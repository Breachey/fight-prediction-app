import React, { useState } from 'react';
import { API_URL } from './config';

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

      const response = await fetch(`${API_URL}${endpoint}`, {
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
      localStorage.setItem('user_id', userData.user_id);
      localStorage.setItem('username', userData.username);
      localStorage.setItem('phoneNumber', userData.phoneNumber);
      onAuthenticate(userData);
    } catch (err) {
      console.error('Authentication error:', err);
      setError(err.message);
    }
  };

  const containerStyle = {
    padding: '0',
    maxWidth: '400px',
    margin: '0 auto',
    boxSizing: 'border-box',
    width: '100%'
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
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    border: '1px solid #4c1d95',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    boxSizing: 'border-box'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    marginBottom: '15px',
    borderRadius: '8px',
    backgroundColor: '#2c2c2c',
    border: '1px solid #6d28d9',
    color: '#ffffff',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.3s ease',
    boxSizing: 'border-box'
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)',
    color: '#ffffff',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    marginBottom: '15px',
    transition: 'opacity 0.2s ease'
  };

  const toggleStyle = {
    background: 'none',
    border: 'none',
    color: '#6d28d9',
    cursor: 'pointer',
    fontSize: '0.9rem',
    textDecoration: 'underline'
  };

  const errorStyle = {
    color: '#ef4444',
    marginBottom: '15px',
    fontSize: '0.9rem'
  };

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>{isRegistering ? 'Register' : 'Login'}</h2>
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

        {error && <div style={errorStyle}>{error}</div>}

        <button type="submit" style={buttonStyle}>
          {isRegistering ? 'Register' : 'Login'}
        </button>

        <button
          type="button"
          onClick={() => setIsRegistering(!isRegistering)}
          style={toggleStyle}
        >
          {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
        </button>
      </form>
    </div>
  );
}

export default UserAuth; 