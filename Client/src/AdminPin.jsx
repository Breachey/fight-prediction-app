import React, { useState } from 'react';

function AdminPin({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === '1016') {
      onSuccess();
    } else {
      setError('Incorrect PIN');
      setPin('');
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
    borderRadius: '8px',
    backgroundColor: '#2c2c2c',
    border: '1px solid #3b3b3b',
    color: '#ffffff',
    fontSize: '1.5rem',
    textAlign: 'center',
    letterSpacing: '0.5em',
    marginBottom: '20px',
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
    transition: 'all 0.3s ease'
  };

  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    marginTop: '10px',
    fontSize: '0.9rem'
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Admin Access</h1>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Enter PIN"
          maxLength="4"
          style={inputStyle}
          autoFocus
        />
        <button type="submit" style={buttonStyle}>
          Enter
        </button>
        {error && <div style={errorStyle}>{error}</div>}
      </form>
    </div>
  );
}

export default AdminPin; 