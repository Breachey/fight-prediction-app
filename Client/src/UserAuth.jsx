import React, { useState } from 'react';
import { API_URL } from './config';
import './UserAuth.css';

function UserAuth({ onAuthenticate }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [isButtonHovered, setIsButtonHovered] = useState(false);

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
      localStorage.setItem('user_type', userData.user_type);
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    padding: '30px',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    color: '#ffffff',
    fontSize: '1rem',
    outline: 'none',
    transition: 'all 0.3s ease',
    boxSizing: 'border-box'
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    background: isButtonHovered 
      ? 'rgba(255, 255, 255, 0.95)' 
      : 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: '#000000',
    border: '1px solid rgba(255, 255, 255, 0.5)',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '15px',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
  };

  const toggleStyle = {
    background: 'none',
    border: 'none',
    color: '#ffffff',
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
          className="user-auth-input"
          required
        />
        
        {isRegistering && (
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            style={inputStyle}
            className="user-auth-input"
            required
          />
        )}

        {error && <div style={errorStyle}>{error}</div>}

        <button 
          type="submit" 
          style={buttonStyle}
          onMouseEnter={() => setIsButtonHovered(true)}
          onMouseLeave={() => setIsButtonHovered(false)}
        >
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