import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from './config';
import { useParams } from 'react-router-dom';
import PlayerCard from './components/PlayerCard';
import PlayerCardSelector from './components/PlayerCardSelector';
import AvatarCustomizer from './components/AvatarCustomizer';
import { cachedFetchJson } from './utils/apiCache';
import './ProfilePage.css';

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
  const profileRequestRef = useRef(null);
  const rivalriesRequestRef = useRef(null);
  const currentSeasonYear = new Date().getFullYear();
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileUser, setProfileUser] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const { user_id: routeUserId } = useParams();
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [accountAgeLoading, setAccountAgeLoading] = useState(true);
  const [accountAgeError, setAccountAgeError] = useState(null);
  const [seasonRivalries, setSeasonRivalries] = useState({ biggestNemesis: null, pickTwin: null });
  const [seasonRivalriesLoading, setSeasonRivalriesLoading] = useState(true);
  const [seasonRivalriesLoaded, setSeasonRivalriesLoaded] = useState(false);
  const [seasonRivalriesError, setSeasonRivalriesError] = useState('');
  const userIdToShow = routeUserId || loggedInUser?.user_id;
  const normalizedLoggedInUserId = loggedInUser?.user_id != null ? String(loggedInUser.user_id) : null;
  const normalizedProfileUserId = profileUser?.user_id != null ? String(profileUser.user_id) : null;
  const isOwnProfile = Boolean(
    normalizedLoggedInUserId &&
    normalizedProfileUserId &&
    normalizedLoggedInUserId === normalizedProfileUserId
  );

  // CSS keyframes for animations
  const keyframes = `
    @keyframes spin { 
      0% { transform: rotate(0deg); } 
      100% { transform: rotate(360deg); } 
    }
  `;

  const loadProfile = useCallback(async ({ force = false } = {}) => {
    if (!userIdToShow) return;

    profileRequestRef.current?.controller.abort();
    if (profileRequestRef.current?.timeoutId) {
      clearTimeout(profileRequestRef.current.timeoutId);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10000);
    profileRequestRef.current = { controller, timeoutId };

    setProfileLoading(true);
    setProfileError(null);
    setAccountAgeLoading(true);
    setAccountAgeError(null);

    try {
      const userData = await cachedFetchJson(
        `${API_URL}/user/by-id/${encodeURIComponent(userIdToShow)}`,
        {
          ttlMs: 120000,
          cacheKey: `profile:${userIdToShow}:v3`,
          force,
          allowStaleOnError: true,
          fetchOptions: { signal: controller.signal },
        }
      );
      if (controller.signal.aborted) return;

      setProfileUser({
        username: userData.username,
        user_id: userData.user_id || userIdToShow,
        playercard: userData.playercards || null,
        avatarConfig: userData.avatar_config || null,
      });
      setAccountCreatedAt(userData.created_at);
    } catch (loadError) {
      if (controller.signal.aborted && !timedOut) return;
      setProfileError(timedOut
        ? 'Loading the profile timed out. Please try again.'
        : (loadError.message || 'Could not load profile'));
      setAccountAgeError('Could not load account age');
      throw loadError;
    } finally {
      clearTimeout(timeoutId);
      if (profileRequestRef.current?.controller === controller) {
        setProfileLoading(false);
        setAccountAgeLoading(false);
      }
    }
  }, [userIdToShow]);

  const loadSeasonRivalries = useCallback(async ({ force = false } = {}) => {
    if (!userIdToShow) return;

    rivalriesRequestRef.current?.controller.abort();
    if (rivalriesRequestRef.current?.timeoutId) {
      clearTimeout(rivalriesRequestRef.current.timeoutId);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10000);
    rivalriesRequestRef.current = { controller, timeoutId };

    setSeasonRivalriesLoading(true);
    setSeasonRivalriesError('');

    try {
      const highlightsData = await cachedFetchJson(
        `${API_URL}/user/${encodeURIComponent(userIdToShow)}/highlights/${currentSeasonYear}`,
        {
          ttlMs: 120000,
          cacheKey: `profile-rivalries:${userIdToShow}:${currentSeasonYear}:v3`,
          force,
          allowStaleOnError: true,
          fetchOptions: { signal: controller.signal },
        }
      );
      if (controller.signal.aborted) return;

      const rivalryInsights = highlightsData?.rivalry_insights || {};
      setSeasonRivalries({
        biggestNemesis: rivalryInsights.biggest_nemesis || null,
        pickTwin: rivalryInsights.pick_twin || null,
      });
      setSeasonRivalriesLoaded(true);
    } catch (loadError) {
      if (controller.signal.aborted && !timedOut) return;
      setSeasonRivalriesError(timedOut
        ? 'Rivalry insights timed out. Please try again.'
        : 'Could not load rivalry insights right now.');
      throw loadError;
    } finally {
      clearTimeout(timeoutId);
      if (rivalriesRequestRef.current?.controller === controller) {
        setSeasonRivalriesLoading(false);
      }
    }
  }, [currentSeasonYear, userIdToShow]);

  // Start both profile sections together, but settle them independently.
  useEffect(() => {
    if (!normalizedLoggedInUserId || !userIdToShow) return undefined;

    setProfileUser(null);
    setSeasonRivalries({ biggestNemesis: null, pickTwin: null });
    setSeasonRivalriesLoaded(false);
    void Promise.allSettled([
      loadProfile(),
      loadSeasonRivalries(),
    ]);

    return () => {
      profileRequestRef.current?.controller.abort();
      rivalriesRequestRef.current?.controller.abort();
      clearTimeout(profileRequestRef.current?.timeoutId);
      clearTimeout(rivalriesRequestRef.current?.timeoutId);
    };
  }, [loadProfile, loadSeasonRivalries, normalizedLoggedInUserId, userIdToShow]);

  // Error states
  if (!loggedInUser) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', marginTop: 80, fontSize: '1.3rem' }}>
        <strong>Error:</strong><br />
        <span style={{ color: '#ff6b6b' }}>Unable to access profiles at this time. Please log in again.</span>
      </div>
    );
  }

  if (profileError && !profileUser) {
    return (
      <div style={{ 
        color: '#fff', 
        textAlign: 'center', 
        marginTop: 80, 
        fontSize: '1.3rem', 
        background: 'linear-gradient(135deg, rgba(233, 23, 13, 0.25) 0%, rgba(43, 49, 178, 0.25) 100%), rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        padding: 32, 
        borderRadius: 16,
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
      }}>
        <span style={{ fontSize: '2rem', color: '#ff6b6b' }}>🚫</span><br />
        <strong>{profileError === 'User not found' ? 'User not found' : 'Error loading profile'}</strong><br />
        <div style={{ marginTop: 24, fontSize: '1rem', color: 'rgba(255, 255, 255, 0.9)' }}>
          {profileError === 'User not found'
            ? 'Please check the username and try again.' 
            : profileError}
        </div>
        <button
          type="button"
          className="profile-retry-button"
          disabled={profileLoading}
          onClick={() => { void loadProfile({ force: true }).catch(() => {}); }}
        >
          {profileLoading ? 'Retrying…' : 'Retry profile'}
        </button>
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
        className="profile-page"
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
            background: 'linear-gradient(135deg, rgba(233, 23, 13, 0.25) 0%, rgba(43, 49, 178, 0.25) 100%), rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: '#fff',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            opacity: 0,
            boxSizing: 'border-box',
            overflow: 'visible'
          }}
        >
          {/* Profile Title */}
          <h1 className="app-page-heading" style={{
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

          {profileError && (
            <div className="profile-section-error profile-section-error--inline" role="alert">
              <div>{profileError} Showing the last profile data we loaded.</div>
              <button
                type="button"
                className="profile-retry-button"
                disabled={profileLoading}
                onClick={() => { void loadProfile({ force: true }).catch(() => {}); }}
              >
                {profileLoading ? 'Retrying…' : 'Retry profile'}
              </button>
            </div>
          )}

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
                  avatarConfig={profileUser.avatarConfig}
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

              {isOwnProfile && (
                <AvatarCustomizer
                  userId={profileUser.user_id}
                  value={profileUser.avatarConfig}
                  onChange={(avatarConfig) => {
                    setProfileUser((previous) => ({ ...previous, avatarConfig }));
                  }}
                />
              )}

              {/* Playercard Selector for Current User */}
              {isOwnProfile && (
                <div style={{ width: '100%', maxWidth: 600 }}>
                  <PlayerCardSelector
                    currentPlayercardId={profileUser.playercard?.id}
                    currentPlayercard={profileUser.playercard}
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

          <div className="profile-rivalries" style={{
            marginTop: 4,
            padding: 'clamp(14px, 3vw, 22px)',
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.24)',
            background: 'linear-gradient(145deg, rgba(43, 18, 84, 0.35), rgba(12, 26, 56, 0.4))'
          }}>
            <h3 className="app-subsection-heading" style={{
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

            {seasonRivalriesLoading && !seasonRivalriesLoaded ? (
              <div style={{ color: 'rgba(255, 255, 255, 0.8)', textAlign: 'center', fontSize: '0.96rem' }}>
                Loading rivalry insights...
              </div>
            ) : seasonRivalriesError && !seasonRivalriesLoaded ? (
              <div className="profile-section-error" role="alert">
                <div>{seasonRivalriesError}</div>
                <button
                  type="button"
                  className="profile-retry-button"
                  disabled={seasonRivalriesLoading}
                  onClick={() => { void loadSeasonRivalries({ force: true }).catch(() => {}); }}
                >
                  {seasonRivalriesLoading ? 'Retrying…' : 'Retry rivalries'}
                </button>
              </div>
            ) : (
              <>
              {(seasonRivalriesLoading || seasonRivalriesError) && (
                <div className="profile-section-error profile-section-error--inline" role={seasonRivalriesError ? 'alert' : 'status'}>
                  <div>{seasonRivalriesError || 'Updating rivalry insights…'}</div>
                  {seasonRivalriesError && (
                    <button
                      type="button"
                      className="profile-retry-button"
                      disabled={seasonRivalriesLoading}
                      onClick={() => { void loadSeasonRivalries({ force: true }).catch(() => {}); }}
                    >
                      {seasonRivalriesLoading ? 'Retrying…' : 'Retry rivalries'}
                    </button>
                  )}
                </div>
              )}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 12
              }}>
                <div className="profile-rivalry profile-rivalry--nemesis" style={{
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
                        avatarConfig={seasonRivalries.biggestNemesis.avatar_config}
                        size="medium"
                        reaction="nemesis"
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
                      No qualifying nemesis identified yet this season.
                    </div>
                  )}
                </div>

                <div className="profile-rivalry profile-rivalry--twin" style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid rgba(43, 49, 178, 0.35)',
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
                        avatarConfig={seasonRivalries.pickTwin.avatar_config}
                        size="medium"
                        reaction="twin"
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
                      Need more qualifying shared picks to detect a twin.
                    </div>
                  )}
                </div>
              </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default ProfilePage; 
