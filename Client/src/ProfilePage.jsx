import React, { useEffect, useRef, useState } from 'react';
import { API_URL } from './config';
import { appendViewerUserId } from './utils/audienceMode';
import { useParams } from 'react-router-dom';
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
  const currentSeasonYear = new Date().getFullYear();
  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState(null);
  const [error, setError] = useState(null);
  const { user_id: routeUserId } = useParams();
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [accountAgeLoading, setAccountAgeLoading] = useState(true);
  const [accountAgeError, setAccountAgeError] = useState(null);
  const [seasonRivalries, setSeasonRivalries] = useState({ biggestNemesis: null, pickTwin: null });
  const [seasonRivalriesLoading, setSeasonRivalriesLoading] = useState(true);
  const [seasonRivalriesError, setSeasonRivalriesError] = useState('');
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
  }, [profileUser]);

  // CSS keyframes for animations
  const keyframes = `
    @keyframes spin { 
      0% { transform: rotate(0deg); } 
      100% { transform: rotate(360deg); } 
    }
  `;

  // Fetch user data
  useEffect(() => {
    if (!loggedInUser) return;
    
    let isMounted = true;
    setLoading(true);
    setError(null);
    setAccountAgeLoading(true);
    setAccountAgeError(null);
    setSeasonRivalriesLoading(true);
    setSeasonRivalriesError('');
    setSeasonRivalries({ biggestNemesis: null, pickTwin: null });
    
    // Determine which user_id to show
    const userIdToShow = routeUserId || loggedInUser.user_id;
    
    fetch(appendViewerUserId(`${API_URL}/leaderboard`, loggedInUser.user_id))
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch leaderboard');
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        
        // Filter out bots
        const filtered = data.filter(entry => !entry.is_bot);
        const userById = new Map(filtered.map(entry => [String(entry.user_id), entry]));
        
        // Find the user entry by user_id
        const userEntry = filtered.find(entry => String(entry.user_id) === String(userIdToShow));
        
        if (!userEntry) {
          setError('User not found');
          setLoading(false);
          setSeasonRivalriesLoading(false);
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
          .catch(() => {
            if (isMounted) {
              setAccountAgeError('Could not load account age');
              setAccountAgeLoading(false);
            }
          });

        fetch(`${API_URL}/user/${encodeURIComponent(userEntry.user_id)}/highlights/${currentSeasonYear}`)
          .then(res => {
            if (!res.ok) throw new Error('Failed to fetch rivalry insights');
            return res.json();
          })
          .then(highlightsData => {
            if (!isMounted) return;

            const rivalryInsights = highlightsData?.rivalry_insights || {};
            const enrichWithCard = (rival) => {
              if (!rival) return null;
              const entry = userById.get(String(rival.user_id));
              return {
                ...rival,
                playercard: entry?.playercard || null
              };
            };

            setSeasonRivalries({
              biggestNemesis: enrichWithCard(rivalryInsights.biggest_nemesis),
              pickTwin: enrichWithCard(rivalryInsights.pick_twin)
            });
            setSeasonRivalriesLoading(false);
          })
          .catch(() => {
            if (isMounted) {
              setSeasonRivalriesError('Could not load rivalry insights right now.');
              setSeasonRivalriesLoading(false);
            }
          });
        
        // Set user profile data (display username, store user_id for backend if needed)
        setProfileUser({
          username: userEntry.username, // display username
          user_id: userEntry.user_id,   // keep user_id if needed for backend
          phoneNumber: routeUserId ? undefined : loggedInUser.phoneNumber,
          playercard: userEntry.playercard
        });
        
        setLoading(false);
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Unknown error');
          setLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [routeUserId, loggedInUser, currentSeasonYear]);

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

          <div style={{
            marginTop: 4,
            padding: 'clamp(14px, 3vw, 22px)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.24)',
            background: 'linear-gradient(145deg, rgba(43, 18, 84, 0.35), rgba(12, 26, 56, 0.4))'
          }}>
            <h3 style={{
              margin: '0 0 6px',
              fontSize: '1.32rem',
              fontWeight: 700,
              letterSpacing: 0.6,
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.95)'
            }}>
              Current Season Rivalries
            </h3>
            <div style={{
              marginBottom: 14,
              fontSize: '0.9rem',
              color: 'rgba(255, 255, 255, 0.74)',
              textAlign: 'center'
            }}>
              {currentSeasonYear} pick matchups
            </div>

            {seasonRivalriesLoading ? (
              <div style={{ color: 'rgba(255, 255, 255, 0.8)', textAlign: 'center', fontSize: '0.96rem' }}>
                Loading rivalry insights...
              </div>
            ) : seasonRivalriesError ? (
              <div style={{ color: '#ffb6b6', textAlign: 'center', fontSize: '0.96rem' }}>
                {seasonRivalriesError}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 12
              }}>
                <div style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  background: 'linear-gradient(140deg, rgba(127, 29, 29, 0.32), rgba(255, 255, 255, 0.05))'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: 'rgba(255, 225, 225, 0.96)' }}>
                    Biggest Nemesis
                  </div>
                  {seasonRivalries.biggestNemesis ? (
                    <>
                      <PlayerCard
                        username={seasonRivalries.biggestNemesis.username}
                        playercard={seasonRivalries.biggestNemesis.playercard}
                        size="medium"
                      />
                      <div style={{ marginTop: 10, color: 'rgba(255, 238, 238, 0.9)', fontSize: '0.88rem', lineHeight: 1.4 }}>
                        {seasonRivalries.biggestNemesis.times_they_were_right_you_wrong} swing fights
                        {seasonRivalries.biggestNemesis.shared_fights
                          ? ` over ${seasonRivalries.biggestNemesis.shared_fights} shared fights`
                          : ''}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'rgba(255, 238, 238, 0.75)', fontSize: '0.9rem' }}>
                      No nemesis identified yet this season.
                    </div>
                  )}
                </div>

                <div style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid rgba(34, 211, 238, 0.35)',
                  background: 'linear-gradient(140deg, rgba(8, 76, 104, 0.3), rgba(255, 255, 255, 0.05))'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: 'rgba(210, 250, 255, 0.96)' }}>
                    Pick Twin
                  </div>
                  {seasonRivalries.pickTwin ? (
                    <>
                      <PlayerCard
                        username={seasonRivalries.pickTwin.username}
                        playercard={seasonRivalries.pickTwin.playercard}
                        size="medium"
                      />
                      <div style={{ marginTop: 10, color: 'rgba(220, 250, 255, 0.9)', fontSize: '0.88rem', lineHeight: 1.4 }}>
                        {Number(seasonRivalries.pickTwin.overlap_pct || 0).toFixed(2)}% overlap
                        {seasonRivalries.pickTwin.shared_fights
                          ? ` across ${seasonRivalries.pickTwin.shared_fights} shared picks`
                          : ''}
                      </div>
                    </>
                  ) : (
                    <div style={{ color: 'rgba(220, 250, 255, 0.75)', fontSize: '0.9rem' }}>
                      Need at least 3 shared picks to detect a twin.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default ProfilePage; 
