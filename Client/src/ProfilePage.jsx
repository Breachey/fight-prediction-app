import React, { useEffect, useRef, useState } from 'react';
import { API_URL } from './config';
import { useParams } from 'react-router-dom';
import badgeBestPerc from './assets/badge_best_perc_1000x1000.svg';
import badgeMostGuesses from './assets/badge_most_guesses_1000x1000.svg';
import badgeMostPoints from './assets/badge_most_points_1000x1000.svg';
import badgeWorstPerc from './assets/badge_worst_perc_1000x1000.svg';

function formatAccountAge(createdAt) {
  if (!createdAt) return '';
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30.44);
  const diffYears = Math.floor(diffMonths / 12);

  if (diffYears >= 1) {
    // e.g. 'Member since Jan 2023'
    return `Member since ${created.toLocaleString('default', { month: 'short', year: 'numeric' })}`;
  } else if (diffMonths >= 1) {
    return `Member for ${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
  } else if (diffDays >= 1) {
    return `Member for ${diffDays} day${diffDays > 1 ? 's' : ''}`;
  } else {
    return 'Joined today';
  }
}

function ProfilePage({ user: loggedInUser }) {
  const cardRef = useRef(null);
  const usernameRef = useRef(null);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState(null);
  const [error, setError] = useState(null);
  const { username: routeUsername } = useParams();
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [accountAgeLoading, setAccountAgeLoading] = useState(true);
  const [accountAgeError, setAccountAgeError] = useState(null);

  // Animations
  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.animate([
        { opacity: 0, transform: 'scale(0.96) translateY(30px)' },
        { opacity: 1, transform: 'scale(1) translateY(0)' }
      ], {
        duration: 700,
        easing: 'cubic-bezier(.61,1.42,.41,.99)',
        fill: 'forwards'
      });
    }
    if (usernameRef.current) {
      usernameRef.current.animate([
        { opacity: 0, transform: 'translateX(-40px) scale(0.9)' },
        { opacity: 1, transform: 'translateX(0) scale(1)' }
      ], {
        duration: 800,
        delay: 300,
        easing: 'cubic-bezier(.61,1.42,.41,.99)',
        fill: 'forwards'
      });
    }
  }, [profileUser]);

  // CSS keyframes for animations
  const keyframes = `
    @keyframes usernameGlow {
      0% {
        text-shadow: 0 0 8px #a78bfa, 0 0 16px #4c1d95;
        color: #fff;
      }
      50% {
        text-shadow: 0 0 24px #a78bfa, 0 0 48px #4c1d95;
        color: #e0c3fc;
      }
      100% {
        text-shadow: 0 0 8px #a78bfa, 0 0 16px #4c1d95;
        color: #fff;
      }
    }
    @keyframes badgePop {
      0% { transform: scale(0.7) rotate(-10deg); opacity: 0; }
      60% { transform: scale(1.15) rotate(5deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }
    @keyframes spin { 
      0% { transform: rotate(0deg); } 
      100% { transform: rotate(360deg); } 
    }
  `;

  // Fetch user data and badges
  useEffect(() => {
    if (!loggedInUser) return;
    
    let isMounted = true;
    setLoading(true);
    setError(null);
    setAccountAgeLoading(true);
    setAccountAgeError(null);
    
    // Determine which username to show
    const usernameToShow = routeUsername || loggedInUser.username;
    
    fetch(`${API_URL}/leaderboard`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch leaderboard');
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        
        // Filter out bots
        const filtered = data.filter(entry => !entry.is_bot);
        
        // Find the user entry (case-insensitive, trimmed)
        const normalizedUsername = usernameToShow.trim().toLowerCase();
        const userEntry = filtered.find(entry => 
          (entry.user_id || '').trim().toLowerCase() === normalizedUsername
        );
        
        if (!userEntry) {
          setError('User not found');
          setLoading(false);
          return;
        }
        
        // Fetch account age info
        fetch(`${API_URL}/user/${encodeURIComponent(usernameToShow)}`)
          .then(res => {
            if (!res.ok) throw new Error('Failed to fetch user profile');
            return res.json();
          })
          .then(userData => {
            if (!isMounted) return;
            setAccountCreatedAt(userData.created_at);
            setAccountAgeLoading(false);
          })
          .catch(err => {
            if (isMounted) {
              setAccountAgeError('Could not load account age');
              setAccountAgeLoading(false);
            }
          });
        
        // Set user profile data
        setProfileUser({
          username: userEntry.user_id,
          phoneNumber: routeUsername ? undefined : loggedInUser.phoneNumber,
        });
        
        // Calculate badges
        const byPoints = [...filtered].sort((a, b) => b.total_points - a.total_points);
        const byAccuracy = [...filtered].sort((a, b) => parseFloat(b.accuracy) - parseFloat(a.accuracy));
        const byCorrect = [...filtered].sort((a, b) => b.correct_predictions - a.correct_predictions);
        
        const userBadges = [];
        
        if (byPoints[0] && (byPoints[0].user_id || '').trim().toLowerCase() === normalizedUsername) {
          userBadges.push({
            key: 'points',
            label: 'Most Points',
            svg: <img src={badgeMostPoints} alt="Most Points Badge" width={60} height={60} />
          });
        }
        
        if (byAccuracy[0] && (byAccuracy[0].user_id || '').trim().toLowerCase() === normalizedUsername) {
          userBadges.push({
            key: 'accuracy',
            label: 'Best Accuracy',
            svg: <img src={badgeBestPerc} alt="Best Accuracy Badge" width={60} height={60} />
          });
        }
        
        if (byCorrect[0] && (byCorrect[0].user_id || '').trim().toLowerCase() === normalizedUsername) {
          userBadges.push({
            key: 'correct',
            label: 'Most Correct Picks',
            svg: <img src={badgeMostGuesses} alt="Most Correct Picks Badge" width={60} height={60} />
          });
        }
        
        if (byAccuracy.length > 1 && (byAccuracy[byAccuracy.length-1].user_id || '').trim().toLowerCase() === normalizedUsername) {
          userBadges.push({
            key: 'worst_accuracy',
            label: 'Worst Accuracy',
            svg: <img src={badgeWorstPerc} alt="Worst Accuracy Badge" width={60} height={60} />
          });
        }
        
        setBadges(userBadges);
        setLoading(false);
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unknown error');
          setLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [routeUsername, loggedInUser]);

  // Loading timeout
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (loading) {
        setError('Loading timed out. Please refresh and try again.');
        setLoading(false);
      }
    }, 10000);
    
    return () => clearTimeout(timeoutId);
  }, [loading]);

  // Error states
  if (!loggedInUser) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', marginTop: 80, fontSize: '1.3rem' }}>
        <strong>Error:</strong><br />
        <span style={{ color: '#ff6b6b' }}>Unable to access profiles at this time. Please log in again.</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', marginTop: 80, fontSize: '1.3rem', background: '#2d1f47', padding: 32, borderRadius: 16 }}>
        <span style={{ fontSize: '2rem', color: '#ff6b6b' }}>🚫</span><br />
        <strong>{error === 'User not found' ? 'User not found' : 'Error loading profile'}</strong><br />
        <div style={{ marginTop: 24, fontSize: '1rem', color: '#a78bfa' }}>
          {error === 'User not found' 
            ? 'Please check the username and try again.' 
            : error}
        </div>
      </div>
    );
  }

  // Loading state
  if (!profileUser) {
    return (
      <div style={{ color: '#a78bfa', textAlign: 'center', marginTop: 80, fontSize: '1.5rem' }}>
        <div className="spinner" style={{ 
          margin: '0 auto 16px', 
          width: 40, 
          height: 40, 
          border: '4px solid #a78bfa', 
          borderTop: '4px solid #fff', 
          borderRadius: '50%', 
          animation: 'spin 1s linear infinite' 
        }} />
        Loading profile...
      </div>
    );
  }

  // Profile Display
  return (
    <>
      <style>{keyframes}</style>
      <div
        ref={cardRef}
        style={{
          maxWidth: 600,
          margin: '0 auto',
          padding: 32,
          background: 'linear-gradient(135deg, #1a1a1a 80%, #2d1f47 100%)',
          borderRadius: 16,
          border: '1px solid #4c1d95',
          color: '#fff',
          boxShadow: '0 8px 32px 0 rgba(76,29,149,0.18)',
          opacity: 0,
        }}
      >
        <h2 style={{ color: '#a78bfa', marginBottom: 24, letterSpacing: 2, fontWeight: 700, fontSize: '2.2rem' }}>Profile</h2>
        <div style={{ marginBottom: 16, fontSize: '1.3rem' }}>
          <strong>Username:</strong>{' '}
          <span
            ref={usernameRef}
            style={{
              fontWeight: 700,
              fontSize: '1.5rem',
              color: '#fff',
              animation: 'usernameGlow 2.5s infinite alternate',
              opacity: 0,
              padding: '0 8px',
              borderRadius: 8,
              background: 'linear-gradient(90deg, #4c1d95 0%, #a78bfa 100%)',
              boxShadow: '0 0 12px #a78bfa44',
              display: 'inline-block',
              transition: 'box-shadow 0.3s',
            }}
          >
            {profileUser.username}
          </span>
        </div>
        {/* Account Age Stat */}
        <div style={{ marginBottom: 24, fontSize: '1.05rem', color: '#a78bfa', minHeight: 24 }}>
          {accountAgeLoading ? (
            <span style={{ color: '#a78bfa' }}>Loading account age...</span>
          ) : accountAgeError ? (
            <span style={{ color: '#ff6b6b' }}>{accountAgeError}</span>
          ) : accountCreatedAt ? (
            <span>{formatAccountAge(accountCreatedAt)}</span>
          ) : null}
        </div>
        {profileUser.phoneNumber && (
          <div style={{ marginBottom: 32, fontSize: '1.1rem', color: '#e0e0e0' }}>
            <strong>Phone Number:</strong> {profileUser.phoneNumber}
          </div>
        )}
        
        {/* Badges Section */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ color: '#FFD700', marginBottom: 12, fontWeight: 700, fontSize: '1.2rem', letterSpacing: 1 }}>Badges</h3>
          {loading ? (
            <div style={{ color: '#a78bfa', fontStyle: 'italic' }}>Loading badges...</div>
          ) : badges.length === 0 ? (
            <div style={{ color: '#ccc', fontStyle: 'italic' }}>No badges yet. Get to the top of the leaderboard to earn some!</div>
          ) : (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              {badges.map((badge, i) => (
                <div key={badge.key} style={{ textAlign: 'center', animation: 'badgePop 0.7s cubic-bezier(.61,1.42,.41,.99) both', animationDelay: `${0.2 + i * 0.15}s` }}>
                  <div style={{ marginBottom: 6 }}>{badge.svg}</div>
                  <div style={{ color: '#fff', fontWeight: 600, fontSize: '1rem', letterSpacing: 0.5 }}>{badge.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <h3 style={{ color: '#a78bfa', marginBottom: 12, fontWeight: 600, fontSize: '1.2rem', letterSpacing: 1 }}>Your Voted Fights</h3>
        <div style={{ color: '#ccc', fontStyle: 'italic', fontSize: '1.05rem' }}>
          (Coming soon: List of fights you have voted on)
        </div>
      </div>
    </>
  );
}

export default ProfilePage; 