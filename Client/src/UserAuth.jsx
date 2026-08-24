import React, { useState } from 'react';
import { API_URL } from './config';
import { isValidPhoneNumber, normalizePhoneNumber } from './utils/phoneNumber';
import './UserAuth.css';

function UserAuth({ onAuthenticate }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    setPhoneNumber(normalizedPhoneNumber);

    if (!isValidPhoneNumber(normalizedPhoneNumber)) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = isRegistering ? '/register' : '/login';
      const body = isRegistering
        ? { phoneNumber: normalizedPhoneNumber, username }
        : { phoneNumber: normalizedPhoneNumber };
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Authentication failed');
      }
      onAuthenticate(await response.json());
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="user-auth">
      <div className="user-auth__heading">
        <p>Fight night starts here</p>
        <h1 className="app-page-heading">{isRegistering ? 'Create account' : 'Welcome back'}</h1>
      </div>
      <form className="user-auth__form" onSubmit={handleSubmit}>
        <label>
          <span>Phone number</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(normalizePhoneNumber(event.target.value))}
            placeholder="333-333-4444"
            title="Enter a 10-digit phone number with or without formatting"
            required
          />
        </label>
        {isRegistering && (
          <label>
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Choose a display name"
              required
            />
          </label>
        )}
        {error && <div className="user-auth__error" role="alert">{error}</div>}
        <button className="user-auth__submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Working…' : isRegistering ? 'Create account' : 'Log in'}
        </button>
        <button className="user-auth__toggle" type="button" onClick={() => setIsRegistering((value) => !value)}>
          {isRegistering ? 'Already have an account? Log in' : 'New to Fight Picks? Create account'}
        </button>
      </form>
    </main>
  );
}

export default UserAuth;
