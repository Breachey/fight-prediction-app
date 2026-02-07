import React, { useEffect, useRef, useState } from 'react';
import { API_URL } from './config';
import { useParams } from 'react-router-dom';
import badgeBestPerc from './assets/badge_best_perc_1000x1000.svg';
import badgeMostGuesses from './assets/badge_most_guesses_1000x1000.svg';
import badgeMostPoints from './assets/badge_most_points_1000x1000.svg';
import badgeWorstPerc from './assets/badge_worst_perc_1000x1000.svg';
import PlayerCard from './components/PlayerCard';
import PlayerCardSelector from './components/PlayerCardSelector';

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
  const { user_id: routeUserId } = useParams();
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [accountAgeLoading, setAccountAgeLoading] = useState(true);
  const [accountAgeError, setAccountAgeError] = useState(null);
  const normalizedLoggedInUserId = loggedInUser?.user_id != null ? String(loggedInUser.user_id) : null;
  const normalizedProfileUserId = profileUser?.user_id != null ? String(profileUser.user_id) : null;
  const isOwnProfile = Boolean(
    normalizedLoggedInUserId &&
    normalizedProfileUserId &&
    normalizedLoggedInUserId === normalizedProfileUserId
  );

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
        text-shadow: 0 0 8px rgba(255, 255, 255, 0.5), 0 0 16px rgba(255, 255, 255, 0.3);
        color: #fff;
      }
      50% {
        text-shadow: 0 0 24px rgba(255, 255, 255, 0.8), 0 0 48px rgba(255, 255, 255, 0.5);
        color: #fff;
      }
      100% {
        text-shadow: 0 0 8px rgba(255, 255, 255, 0.5), 0 0 16px rgba(255, 255, 255, 0.3);
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
    
    // Determine which user_id to show
    const userIdToShow = routeUserId || loggedInUser.user_id;
    
    fetch(`${API_URL}/leaderboard`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch leaderboard');
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        
        // Filter out bots
        const filtered = data.filter(entry => !entry.is_bot);
        
        // Find the user entry by user_id
        const userEntry = filtered.find(entry => String(entry.user_id) === String(userIdToShow));
        
        if (!userEntry) {
          setError('User not found');
          setLoading(false);
          return;
        }
        
        // Fetch account age info using user_id (new endpoint)
        fetch(`${API_URL}/user/by-id/${encodeURIComponent(userEntry.user_id)}`)
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
        
        // Set user profile data (display username, store user_id for backend if needed)
        setProfileUser({
          username: userEntry.username, // display username
          user_id: userEntry.user_id,   // keep user_id if needed for backend
          phoneNumber: routeUserId ? undefined : loggedInUser.phoneNumber,
          playercard: userEntry.playercard
        });
        
        // Calculate badges
        const byPoints = [...filtered].sort((a, b) => b.total_points - a.total_points);
        const byAccuracy = [...filtered].sort((a, b) => parseFloat(b.accuracy) - parseFloat(a.accuracy));
        const byCorrect = [...filtered].sort((a, b) => b.correct_predictions - a.correct_predictions);
        
        const userBadges = [];
        
        if (byPoints[0] && String(byPoints[0].user_id) === String(userIdToShow)) {
          userBadges.push({
            key: 'points',
            label: 'Most Points',
            svg: <img src={badgeMostPoints} alt="Most Points Badge" width={60} height={60} />
          });
        }
        
        if (byAccuracy[0] && String(byAccuracy[0].user_id) === String(userIdToShow)) {
          userBadges.push({
            key: 'accuracy',
            label: 'Best Accuracy',
            svg: <img src={badgeBestPerc} alt="Best Accuracy Badge" width={60} height={60} />
          });
        }
        
        if (byCorrect[0] && String(byCorrect[0].user_id) === String(userIdToShow)) {
          userBadges.push({
            key: 'correct',
            label: 'Most Correct Picks',
            svg: <img src={badgeMostGuesses} alt="Most Correct Picks Badge" width={60} height={60} />
          });
        }
        
        if (byAccuracy.length > 1 && String(byAccuracy[byAccuracy.length-1].user_id) === String(userIdToShow)) {
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
  }, [routeUserId, loggedInUser]);

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
      <div style={{ 
        color: '#fff', 
        textAlign: 'center', 
        marginTop: 80, 
        fontSize: '1.3rem', 
        background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.25) 0%, rgba(37, 99, 235, 0.25) 100%), rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        padding: 32, 
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
      }}>
        <span style={{ fontSize: '2rem', color: '#ff6b6b' }}>🚫</span><br />
        <strong>{error === 'User not found' ? 'User not found' : 'Error loading profile'}</strong><br />
        <div style={{ marginTop: 24, fontSize: '1rem', color: 'rgba(255, 255, 255, 0.9)' }}>
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
      <div style={{ color: 'rgba(255, 255, 255, 0.9)', textAlign: 'center', marginTop: 80, fontSize: '1.5rem' }}>
        <div className="spinner" style={{ 
          margin: '0 auto 16px', 
          width: 40, 
          height: 40, 
          border: '4px solid rgba(255, 255, 255, 0.3)', 
          borderTop: '4px solid rgba(255, 255, 255, 0.9)', 
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
        style={{
          width: '100%',
          padding: '0 clamp(12px, 4vw, 28px)',
          boxSizing: 'border-box'
        }}
      >
        {/* Profile Title */}
        <div
          ref={cardRef}
          style={{
            width: '100%',
            maxWidth: 800,
            margin: '0 auto',
            padding: 'clamp(16px, 4vw, 28px)',
            background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.25) 0%, rgba(37, 99, 235, 0.25) 100%), rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: '#fff',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            opacity: 0,
            boxSizing: 'border-box',
            overflow: 'hidden'
          }}
        >
          {/* Profile Title */}
          <h1 style={{ 
            color: 'rgba(255, 255, 255, 1)', 
            marginBottom: 32, 
            letterSpacing: 2, 
            fontWeight: 700, 
            fontSize: '2.5rem',
            textAlign: 'center',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)'
          }}>
            Profile
          </h1>

          {/* Current Playercard with Username Overlay */}
          {profileUser && (
            <div style={{ 
              marginBottom: 40, 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              position: 'relative',
              width: '100%'
            }}>
              <div style={{ position: 'relative', marginBottom: 16, width: '100%' }}>
                <PlayerCard
                  username={profileUser.username}
                  playercard={profileUser.playercard}
                  size="large"
                  isCurrentUser={isOwnProfile}
                />
              </div>

              {/* Account Age */}
              <div style={{ fontSize: '1rem', color: 'rgba(255, 255, 255, 0.8)', marginBottom: 20, textAlign: 'center', width: '100%' }}>
                {accountAgeLoading ? (
                  <span style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Loading account age...</span>
                ) : accountAgeError ? (
                  <span style={{ color: '#ff6b6b' }}>{accountAgeError}</span>
                ) : accountCreatedAt ? (
                  <span>{formatAccountAge(accountCreatedAt)}</span>
                ) : null}
              </div>

              {/* Playercard Selector for Current User */}
              {isOwnProfile && (
                <div style={{ width: '100%', maxWidth: 600 }}>
                  <h3 style={{ 
                    color: 'rgba(255, 255, 255, 0.9)', 
                    marginBottom: 16, 
                    fontWeight: 600, 
                    fontSize: '1.3rem', 
                    letterSpacing: 1,
                    textAlign: 'center'
                  }}>
                    Change Your Playercard
                  </h3>
                  <PlayerCardSelector
                    currentPlayercardId={profileUser.playercard?.id}
                    userId={profileUser.user_id}
                    onChange={(newCard) => {
                      // update the displayed card immediately
                      setProfileUser(prev => ({
                        ...prev,
                        playercard: newCard
                      }));

                      // If the header (App state) needs an update you'll get it on next session refresh; no full reload required here.
                    }}
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Badges Section */}
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ 
              color: '#FFD700', 
              marginBottom: 20, 
              fontWeight: 700, 
              fontSize: '1.4rem', 
              letterSpacing: 1,
              textAlign: 'center',
              textShadow: '0 2px 8px rgba(255, 215, 0, 0.3)'
            }}>
              Badges
            </h3>
            {loading ? (
              <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontStyle: 'italic', textAlign: 'center' }}>Loading badges...</div>
            ) : badges.length === 0 ? (
              <div style={{ 
                color: 'rgba(255, 255, 255, 0.7)', 
                fontStyle: 'italic', 
                textAlign: 'center',
                padding: 20,
                background: 'rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: 12,
                border: '1px dashed rgba(255, 255, 255, 0.3)'
              }}>
                No badges yet. Get to the top of the leaderboard to earn some!
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                gap: 24, 
                flexWrap: 'wrap', 
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {badges.map((badge, i) => (
                  <div 
                    key={badge.key} 
                    style={{ 
                      textAlign: 'center', 
                      animation: 'badgePop 0.7s cubic-bezier(.61,1.42,.41,.99) both', 
                      animationDelay: `${0.2 + i * 0.15}s`,
                      padding: 16,
                      background: 'rgba(255, 215, 0, 0.1)',
                      borderRadius: 16,
                      border: '1px solid rgba(255, 215, 0, 0.3)'
                    }}
                  >
                    <div style={{ marginBottom: 8 }}>{badge.svg}</div>
                    <div style={{ 
                      color: '#FFD700', 
                      fontWeight: 600, 
                      fontSize: '1rem', 
                      letterSpacing: 0.5 
                    }}>
                      {badge.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* User Event Stats Section */}
          <UserEventStats userId={profileUser.user_id} username={profileUser.username} />
        </div>
      </div>
    </>
  );
}

// --- UserEventStats subcomponent ---
function UserEventStats({ userId, username }) {
  const [eventStats, setEventStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        const statsRes = await fetch(`${API_URL}/user/${encodeURIComponent(userId)}/event-stats`);
        if (!statsRes.ok) throw new Error('Failed to fetch event stats');
        const stats = await statsRes.json();
        if (isMounted) {
          setEventStats(stats || []);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load event stats');
          setLoading(false);
        }
      }
    }
    fetchStats();
    return () => { isMounted = false; };
  }, [userId]);

  if (loading) return <div style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: 24, textAlign: 'center' }}>Loading event stats...</div>;
  if (error) return <div style={{ color: '#ff6b6b', marginBottom: 24, textAlign: 'center' }}>{error}</div>;
  if (!eventStats.length) return (
    <div style={{ 
      color: 'rgba(255, 255, 255, 0.7)', 
      fontStyle: 'italic', 
      marginBottom: 24, 
      textAlign: 'center',
      padding: 20,
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      borderRadius: 12,
      border: '1px dashed rgba(255, 255, 255, 0.3)'
    }}>
      No event stats yet. Vote in some fights to see your stats!
    </div>
  );

  // Render event stats as cards (similar to leaderboard)
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ 
        color: 'rgba(255, 255, 255, 0.9)', 
        marginBottom: 20, 
        fontWeight: 700, 
        fontSize: '1.4rem', 
        letterSpacing: 1,
        textAlign: 'center',
        textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)'
      }}>
        Your Event Stats
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {eventStats.map((stat, i) => {
          const dateStr = stat.event.date ? new Date(stat.event.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
          const locationParts = [stat.event.venue, stat.event.location_city, stat.event.location_state].filter(Boolean);
          const locationStr = locationParts.join(', ');
          const roundedAccuracy = Math.round(parseFloat(stat.accuracy));
          return (
            <div key={stat.event.id} style={{
              background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.15) 0%, rgba(37, 99, 235, 0.15) 100%), rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(15px) saturate(180%)',
              WebkitBackdropFilter: 'blur(15px) saturate(180%)',
              borderRadius: 16,
              padding: 20,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 8px 24px rgba(255, 255, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2)';
            }}>
              <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'rgba(255, 255, 255, 0.9)' }}>{stat.event.name}</div>
              <div style={{ fontSize: '1rem', color: 'rgba(255, 255, 255, 0.8)' }}>{dateStr}</div>
              {locationStr && <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)' }}>{locationStr}</div>}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 16, 
                marginTop: 12, 
                fontSize: '1rem',
                alignItems: 'center'
              }}>
                <div style={{ textAlign: 'center', padding: 8, background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(5px)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.85rem', marginBottom: 4 }}>Points</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{stat.total_points}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 8, background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(5px)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.85rem', marginBottom: 4 }}>Correct</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{stat.correct_predictions}/{stat.total_predictions}</div>
                </div>
                <div style={{ textAlign: 'center', padding: 8, background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(5px)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.85rem', marginBottom: 4 }}>Accuracy</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{roundedAccuracy}%</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ProfilePage; 
