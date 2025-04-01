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
    padding: '0',
    maxWidth: '400px',
    margin: '0 auto',
    boxSizing: 'border-box',
    width: '100%'
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

  const titleStyle = {
    fontSize: '2rem',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '30px',
    color: '#ffffff'
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