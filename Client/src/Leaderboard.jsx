// Leaderboard.jsx
// This component displays a leaderboard for an event and/or overall, with options to toggle between them and show/hide AI users.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { API_URL } from './config';
import { cachedFetchJson } from './utils/apiCache';
import { getEventLiveStateChanges, shouldPollEventLeaderboard } from './utils/pollingPolicy';
import { fetchWithUserSession } from './utils/userSession';
import SquidAvatar from './components/SquidAvatar';
import EventRecap from './components/EventRecap';
import EventFriendComparison from './components/EventFriendComparison';
import './Leaderboard.css';

const EVENT_STATE_REFRESH_INTERVAL_MS = 15000;
const AVATAR_SCROLL_IDLE_MS = 160;
const AVATAR_VISIBILITY_MARGIN = '160px 0px';
const DENSE_AVATAR_MOBILE_QUERY = '(max-width: 768px), (pointer: coarse)';
function Leaderboard({ eventId, currentUser, currentUserId, refreshToken = 0, isEventComplete = false, showAIUsers = false }) {
  // State for event-specific leaderboard data
  const [eventLeaderboard, setEventLeaderboard] = useState([]);
  // State for overall leaderboard data
  const [overallLeaderboard, setOverallLeaderboard] = useState([]);
  // State for 2025 season leaderboard data
  const [season2025Leaderboard, setSeason2025Leaderboard] = useState([]);
  // State for current season (2026) leaderboard data
  const [seasonLeaderboard, setSeasonLeaderboard] = useState([]);
  // Loading and error state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [eventRecap, setEventRecap] = useState(null);
  const [isRecapLoading, setIsRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState('');
  const [eventComparison, setEventComparison] = useState(null);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState('');
  const loadedRef = useRef({ event: false, overall: false, season: false, '2025': false });
  const showBots = showAIUsers;
  // Which leaderboard is currently selected ('event' or 'overall' or 'season' or '2025')
  const [selectedLeaderboard, setSelectedLeaderboard] = useState(eventId ? 'event' : 'overall');
  const [rivalryMarkers, setRivalryMarkers] = useState({ pickTwinUserId: null, nemesisUserId: null });
  const lastAppliedRefreshTokenRef = useRef(refreshToken);
  const lastFocusRefreshRef = useRef(0);
  const activeRecapEventIdRef = useRef(eventId);
  const activeComparisonEventIdRef = useRef(eventId);
  const activeComparisonFriendIdRef = useRef('');
  const comparisonRequestIdRef = useRef(0);
  const eventLiveStateRef = useRef(null);
  const eventStateRefreshInFlightRef = useRef(false);
  const containerRef = useRef(null);

  const getEndpoint = useCallback((type) => {
    if (type === 'event') {
      return eventId ? `${API_URL}/events/${eventId}/leaderboard` : null;
    }
    if (type === 'overall') {
      return `${API_URL}/leaderboard`;
    }
    if (type === 'season') {
      const referenceParam = eventId ? `?reference_event_id=${encodeURIComponent(eventId)}` : '';
      return `${API_URL}/leaderboard/season${referenceParam}`;
    }
    if (type === '2025') {
      return `${API_URL}/leaderboard/2025`;
    }
    return null;
  }, [eventId]);

  const setLeaderboardData = useCallback((type, data) => {
    if (type === 'event') setEventLeaderboard(data);
    if (type === 'overall') setOverallLeaderboard(data);
    if (type === 'season') setSeasonLeaderboard(data);
    if (type === '2025') setSeason2025Leaderboard(data);
  }, []);

  const fetchLeaderboard = useCallback(async (type, { skipGlobalLoading = false, showManualIndicator = false } = {}) => {
    const endpoint = getEndpoint(type);
    if (!endpoint) {
      if (type === 'event') {
        setEventLeaderboard([]);
        loadedRef.current.event = true;
      }
      return;
    }

    const hasLoaded = loadedRef.current[type];
    const startLoading = () => {
      if (!skipGlobalLoading && !hasLoaded) {
        setIsLoading(true);
      }
      if (showManualIndicator) {
        setIsRefreshing(true);
      }
    };

    const stopLoading = () => {
      if (!skipGlobalLoading && !hasLoaded) {
        setIsLoading(false);
      }
      if (showManualIndicator) {
        setIsRefreshing(false);
      }
    };

    startLoading();

    try {
      setError('');
      const data = await cachedFetchJson(endpoint, {
        cacheKey: `leaderboard:${endpoint}`,
        ttlMs: type === 'event' ? EVENT_STATE_REFRESH_INTERVAL_MS : 60000,
        force: skipGlobalLoading || showManualIndicator,
        allowStaleOnError: hasLoaded,
        staleWhileRevalidate: !skipGlobalLoading && !showManualIndicator,
        fetchOptions: { cache: 'no-store' },
      });
      setLeaderboardData(type, data || []);
      loadedRef.current[type] = true;
    } catch (error) {
      console.error(`Error fetching ${type} leaderboard:`, error);
      if (!hasLoaded) {
        const baseMessage = type === 'event'
          ? 'Failed to load event leaderboard.'
          : type === 'overall'
          ? 'Failed to load overall leaderboard.'
          : type === 'season'
          ? 'Failed to load season leaderboard.'
          : 'Failed to load 2025 leaderboard.';
        setError(baseMessage);
        setLeaderboardData(type, []);
        loadedRef.current[type] = true;
      }
    } finally {
      stopLoading();
    }
  }, [getEndpoint, setLeaderboardData]);

  const fetchEventRecap = useCallback(async ({ force = false } = {}) => {
    if (!eventId || !isEventComplete) return;
    const requestedEventId = eventId;
    setIsRecapLoading(true);
    setRecapError('');
    try {
      const recap = await cachedFetchJson(`${API_URL}/events/${requestedEventId}/recap`, {
        cacheKey: `event-recap:${requestedEventId}`,
        ttlMs: 60000,
        force,
        allowStaleOnError: !force,
        staleWhileRevalidate: !force,
        fetchOptions: { cache: 'no-store' },
      });
      if (String(activeRecapEventIdRef.current) !== String(requestedEventId)) return;
      setEventRecap(recap || null);
    } catch (recapFetchError) {
      console.error('Error fetching event recap:', recapFetchError);
      if (String(activeRecapEventIdRef.current) === String(requestedEventId)) {
        setRecapError('The event recap could not be loaded.');
      }
    } finally {
      if (String(activeRecapEventIdRef.current) === String(requestedEventId)) {
        setIsRecapLoading(false);
      }
    }
  }, [eventId, isEventComplete]);

  const fetchEventComparison = useCallback(async ({ friendUserId = '', force = false } = {}) => {
    if (!eventId || !currentUserId) return;
    const requestedEventId = eventId;
    const requestedFriendId = friendUserId ? String(friendUserId) : '';
    const requestId = comparisonRequestIdRef.current + 1;
    comparisonRequestIdRef.current = requestId;
    setIsComparisonLoading(true);
    setComparisonError('');

    const friendParam = requestedFriendId
      ? `?friend_user_id=${encodeURIComponent(requestedFriendId)}`
      : '';
    const endpoint = `${API_URL}/events/${requestedEventId}/friend-comparison${friendParam}`;
    try {
      const comparison = await cachedFetchJson(endpoint, {
        cacheKey: `event-friend-comparison:${currentUserId}:${requestedEventId}:${requestedFriendId || 'default'}`,
        ttlMs: isEventComplete ? 60000 : EVENT_STATE_REFRESH_INTERVAL_MS,
        force,
        allowStaleOnError: !force,
        staleWhileRevalidate: !force,
        privateCache: true,
        fetcher: fetchWithUserSession,
        fetchOptions: { cache: 'no-store' },
      });
      if (
        comparisonRequestIdRef.current !== requestId ||
        String(activeComparisonEventIdRef.current) !== String(requestedEventId)
      ) return;
      setEventComparison(comparison || null);
      const resolvedFriendId = comparison?.selected_friend?.user_id
        ? String(comparison.selected_friend.user_id)
        : '';
      activeComparisonFriendIdRef.current = resolvedFriendId;
      if (requestedFriendId) setSelectedFriendId(resolvedFriendId);
    } catch (comparisonFetchError) {
      console.error('Error fetching event friend comparison:', comparisonFetchError);
      if (
        comparisonRequestIdRef.current === requestId &&
        String(activeComparisonEventIdRef.current) === String(requestedEventId)
      ) {
        setComparisonError('The friend comparison could not be loaded.');
      }
    } finally {
      if (
        comparisonRequestIdRef.current === requestId &&
        String(activeComparisonEventIdRef.current) === String(requestedEventId)
      ) {
        setIsComparisonLoading(false);
      }
    }
  }, [currentUserId, eventId, isEventComplete]);

  const refreshEventLiveState = useCallback(async () => {
    if (!eventId || eventStateRefreshInFlightRef.current) return;

    const requestedEventId = eventId;
    eventStateRefreshInFlightRef.current = true;
    try {
      const incomingState = await cachedFetchJson(`${API_URL}/events/${requestedEventId}/live-state?include_predictions=1`, {
        cacheKey: `event-live-state:${requestedEventId}:with-predictions`,
        force: true,
        allowStaleOnError: false,
        privateCache: true,
        fetcher: fetchWithUserSession,
        fetchOptions: { cache: 'no-store' },
      });
      if (String(activeComparisonEventIdRef.current) !== String(requestedEventId)) return;

      const previousState = eventLiveStateRef.current;
      eventLiveStateRef.current = incomingState;
      const changes = getEventLiveStateChanges(previousState, incomingState);

      if (changes.cardChanged || changes.resultsChanged) {
        fetchLeaderboard('event', { skipGlobalLoading: true });
      }
      if (changes.cardChanged || changes.resultsChanged || changes.predictionsChanged) {
        fetchEventComparison({
          friendUserId: activeComparisonFriendIdRef.current,
          force: true,
        });
      }
    } catch (liveStateError) {
      console.warn('Event state refresh failed:', liveStateError);
    } finally {
      eventStateRefreshInFlightRef.current = false;
    }
  }, [eventId, fetchEventComparison, fetchLeaderboard]);

  // Reset selected leaderboard if eventId changes
  useEffect(() => {
    activeRecapEventIdRef.current = eventId;
    activeComparisonEventIdRef.current = eventId;
    activeComparisonFriendIdRef.current = '';
    eventLiveStateRef.current = null;
    comparisonRequestIdRef.current += 1;
    setSelectedLeaderboard(eventId ? 'event' : 'overall');
    setEventLeaderboard([]);
    setEventRecap(null);
    setRecapError('');
    setEventComparison(null);
    setSelectedFriendId('');
    setComparisonError('');
    loadedRef.current.event = false;
  }, [eventId]);

  useEffect(() => {
    if (selectedLeaderboard !== 'event' || !eventId || !isEventComplete) return;
    fetchEventRecap();
  }, [eventId, fetchEventRecap, isEventComplete, selectedLeaderboard]);

  useEffect(() => {
    if (selectedLeaderboard !== 'event' || !eventId || !currentUserId) return;
    fetchEventComparison({ friendUserId: activeComparisonFriendIdRef.current });
  }, [currentUserId, eventId, fetchEventComparison, selectedLeaderboard]);

  const handleFriendChange = (friendUserId) => {
    const normalizedFriendId = String(friendUserId || '');
    activeComparisonFriendIdRef.current = normalizedFriendId;
    setSelectedFriendId(normalizedFriendId);
    fetchEventComparison({ friendUserId: normalizedFriendId, force: true });
  };

  const handleManualRefresh = () => {
    fetchLeaderboard(selectedLeaderboard, { skipGlobalLoading: true, showManualIndicator: true });
    if (selectedLeaderboard === 'event') {
      fetchEventComparison({
        friendUserId: activeComparisonFriendIdRef.current,
        force: true,
      });
    }
    if (selectedLeaderboard === 'event' && isEventComplete) {
      fetchEventRecap({ force: true });
    }
  };

  // Poll compact event revisions and refresh larger payloads only when they change.
  useEffect(() => {
    fetchLeaderboard(selectedLeaderboard);
    if (selectedLeaderboard !== 'event' || isEventComplete) return undefined;
    refreshEventLiveState();
    const refreshInterval = setInterval(() => {
      if (shouldPollEventLeaderboard({
        selectedLeaderboard,
        isEventComplete: isEventComplete || Boolean(eventLiveStateRef.current?.all_fights_resolved),
        visibilityState: document.visibilityState,
      })) {
        refreshEventLiveState();
      }
    }, EVENT_STATE_REFRESH_INTERVAL_MS);
    return () => clearInterval(refreshInterval);
  }, [selectedLeaderboard, fetchLeaderboard, isEventComplete, refreshEventLiveState]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 60000) return;
      lastFocusRefreshRef.current = now;
      if (selectedLeaderboard === 'event' && !isEventComplete) {
        refreshEventLiveState();
      } else {
        fetchLeaderboard(selectedLeaderboard, { skipGlobalLoading: true });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchLeaderboard, isEventComplete, refreshEventLiveState, selectedLeaderboard]);

  useEffect(() => {
    if (refreshToken === lastAppliedRefreshTokenRef.current) {
      return;
    }

    lastAppliedRefreshTokenRef.current = refreshToken;
    fetchLeaderboard(selectedLeaderboard, {
      skipGlobalLoading: true,
      showManualIndicator: true
    });
    if (selectedLeaderboard === 'event') {
      fetchEventComparison({
        friendUserId: activeComparisonFriendIdRef.current,
        force: true,
      });
    }
  }, [refreshToken, selectedLeaderboard, fetchEventComparison, fetchLeaderboard]);

  useEffect(() => {
    let cancelled = false;
    const loadRivalries = async () => {
      if (!currentUserId) {
        setRivalryMarkers({ pickTwinUserId: null, nemesisUserId: null });
        return;
      }
      const seasonYear = new Date().getFullYear();
      try {
        const highlights = await cachedFetchJson(
          `${API_URL}/user/${encodeURIComponent(currentUserId)}/highlights/${seasonYear}`,
          { ttlMs: 120000, cacheKey: `rivalry-markers:${currentUserId}:${seasonYear}` }
        );
        if (cancelled) return;
        setRivalryMarkers({
          pickTwinUserId: highlights?.rivalry_insights?.pick_twin?.user_id
            ? String(highlights.rivalry_insights.pick_twin.user_id)
            : null,
          nemesisUserId: highlights?.rivalry_insights?.biggest_nemesis?.user_id
            ? String(highlights.rivalry_insights.biggest_nemesis.user_id)
            : null
        });
      } catch {
        if (!cancelled) {
          setRivalryMarkers({ pickTwinUserId: null, nemesisUserId: null });
        }
      }
    };
    loadRivalries();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (window.matchMedia?.(DENSE_AVATAR_MOBILE_QUERY).matches) return undefined;

    const avatarHosts = [...container.querySelectorAll('.leaderboard-squid-avatar')];
    const setAvatarMotion = (host, active) => {
      const avatar = host.querySelector('.squid-avatar--motion-gated');
      avatar?.classList.toggle('squid-avatar--motion-active', active);
    };

    if (typeof IntersectionObserver !== 'function') {
      avatarHosts.forEach((host) => setAvatarMotion(host, true));
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => setAvatarMotion(entry.target, entry.isIntersecting));
    }, {
      rootMargin: AVATAR_VISIBILITY_MARGIN,
      threshold: 0.01,
    });

    avatarHosts.forEach((host) => observer.observe(host));
    return () => observer.disconnect();
  }, [eventLeaderboard, overallLeaderboard, season2025Leaderboard, seasonLeaderboard, selectedLeaderboard, showBots]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    if (window.matchMedia?.(DENSE_AVATAR_MOBILE_QUERY).matches) return undefined;

    let scrollIdleTimer;
    let animationFrame;
    let isScrolling = false;

    const syncMotionState = () => {
      animationFrame = undefined;
      const shouldPause = isScrolling || document.visibilityState !== 'visible';
      container.toggleAttribute('data-avatar-motion-paused', shouldPause);
    };

    const scheduleMotionSync = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(syncMotionState);
    };

    const handleScroll = () => {
      isScrolling = true;
      scheduleMotionSync();
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        isScrolling = false;
        scheduleMotionSync();
      }, AVATAR_SCROLL_IDLE_MS);
    };

    const handleVisibility = () => scheduleMotionSync();
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    syncMotionState();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearTimeout(scrollIdleTimer);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      container.removeAttribute('data-avatar-motion-paused');
    };
  }, [isLoading, error]);

  // --- Styling objects ---
  // These objects define the inline styles for the leaderboard UI

  const containerStyle = {
    padding: '20px',
    maxWidth: '900px',
    margin: '0 auto',
    boxSizing: 'border-box',
    fontFamily: 'Inter, system-ui, sans-serif'
  };

  const sectionHeaderStyle = {
    textAlign: 'center',
    marginBottom: '25px'
  };

  const sectionMetaStyle = {
    fontSize: '0.82rem',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.68)',
    letterSpacing: 0,
    textTransform: 'uppercase'
  };

  // Error message style
  const errorStyle = {
    color: '#ef4444',
    textAlign: 'center',
    padding: '20px',
    background: 'linear-gradient(135deg, rgba(233, 23, 13, 0.25) 0%, rgba(43, 49, 178, 0.25) 100%), rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
  };

  // Empty leaderboard style
  const emptyStyle = {
    padding: '30px',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.9)',
    background: 'linear-gradient(135deg, rgba(233, 23, 13, 0.25) 0%, rgba(43, 49, 178, 0.25) 100%), rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
  };

  // Loading message style
  const loadingStyle = {
    textAlign: 'center',
    padding: '20px',
    color: '#e9d5ff',
    fontSize: '1.2rem'
  };

  // Style for the filter/toggle button containers
  const filterToggleStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '20px'
  };

  const refreshButtonStyle = (disabled) => ({
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    outline: 'none',
    boxShadow: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.5 : 1,
    WebkitAppearance: 'none',
    MozAppearance: 'none',
  });

  const refreshIconStyle = (spinning) => ({
    display: 'inline-block',
    fontSize: '2.5rem',
    color: '#e5e7eb',
    transformOrigin: '50% 50%',
    animation: spinning ? 'leaderboard-refresh-spin 0.8s linear infinite' : 'none',
    transition: 'opacity 0.2s ease',
  });

  // Helper to interpolate between two colors (hex strings, e.g. '22c55e' and 'ef4444')
  // Memoize this function to avoid recomputation
  const interpolateColor = useCallback((color1, color2, factor) => {
    const c1 = color1.match(/\w\w/g).map(x => parseInt(x, 16));
    const c2 = color2.match(/\w\w/g).map(x => parseInt(x, 16));
    const result = c1.map((v, i) => Math.round(v + (c2[i] - v) * factor));
    return '#' + result.map(x => x.toString(16).padStart(2, '0')).join('');
  }, []);

  // --- LeaderboardCard subcomponent ---
  // Renders a single leaderboard entry as a card
  const LeaderboardCard = ({ entry, index, isCurrentUser, isPickTwin, isNemesis, minCorrect, maxCorrect, minAcc, maxAcc, minPoints, maxPoints }) => {
    const roundedAccuracy = Math.round(parseFloat(entry.accuracy));
    // Color interpolation for stats
    const getStatColor = (val, min, max) => {
      if (max === min) return '#b0a8c9'; // fallback if all values are the same
      const factor = (val - min) / (max - min);
      return interpolateColor('ef4444', '22c55e', factor); // red to green
    };
    const bgUrl = entry.playercard?.image_url || '';
    const fallbackBg = 'linear-gradient(135deg, rgba(233, 23, 13, 0.25) 0%, rgba(43, 49, 178, 0.25) 100%)';
    const crownSource = showBots ? entry.event_win_count : (entry.event_win_count_human ?? entry.event_win_count);
    const crownCount = Number(crownSource) || 0;
    const crownBadgeStyle = {
      background: 'rgba(251, 191, 36, 0.2)',
      color: '#fcd34d',
      padding: '0px 7px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      height: 16,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      border: '1px solid rgba(251, 191, 36, 0.4)',
      minWidth: 0,
      flexShrink: 0
    };
    const seasonWinnerBadgeStyle = {
      background: 'rgba(255, 215, 0, 0.2)',
      color: '#FFD700',
      padding: '0px 7px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      height: 16,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      border: '1px solid rgba(255, 215, 0, 0.4)',
      minWidth: 0,
      flexShrink: 0
    };
    const rivalryBadgeStyle = (type) => ({
      background: type === 'twin'
        ? 'rgba(43, 49, 178, 0.22)'
        : 'rgba(168, 85, 247, 0.25)',
      color: type === 'twin' ? '#d7daff' : '#e9d5ff',
      padding: '0px 7px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      height: 16,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'var(--font-family)',
      letterSpacing: '0.03em',
      border: type === 'twin'
        ? '1px solid rgba(43, 49, 178, 0.52)'
        : '1px solid rgba(168, 85, 247, 0.54)',
      minWidth: 0,
      flexShrink: 0,
      whiteSpace: 'nowrap'
    });
    const baseBoxShadow = isCurrentUser
      ? '0 2px 10px rgba(0, 0, 0, 0.24)'
      : index === 0
      ? '0 0 16px 2px #FFD70088, 0 2px 8px rgba(0,0,0,0.15)'
      : index === 1
      ? '0 0 16px 2px #C0C0C088, 0 2px 8px rgba(0,0,0,0.15)'
      : index === 2
      ? '0 0 16px 2px #CD7F3288, 0 2px 8px rgba(0,0,0,0.15)'
      : '0 2px 8px rgba(0,0,0,0.15)';
    const rivalryShadow = isPickTwin
      ? ', 0 0 0 2px rgba(43, 49, 178, 0.85), 0 0 18px rgba(43, 49, 178, 0.25)'
      : isNemesis
      ? ', 0 0 0 2px rgba(168, 85, 247, 0.9), 0 0 18px rgba(168, 85, 247, 0.28)'
      : '';
    const baseBorder = index === 0
      ? '2.5px solid #FFD700'
      : index === 1
      ? '2.5px solid #C0C0C0'
      : index === 2
      ? '2.5px solid #CD7F32'
      : '1px solid rgba(38, 46, 65, 0.9)';
    const rivalryBorder = isPickTwin
      ? '2.5px solid rgba(43, 49, 178, 0.9)'
      : isNemesis
      ? '2.5px solid rgba(168, 85, 247, 0.95)'
      : baseBorder;
    const statTextShadow = '0 2px 5px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.95)';
    const winStreakCount = entry.streak?.type === 'win' ? Number(entry.streak.count) || 0 : 0;
    const lossStreakCount = entry.streak?.type === 'loss' ? Number(entry.streak.count) || 0 : 0;
    const formatChange = (value) => {
      const numericValue = Number(value) || 0;
      return numericValue > 0 ? `+${numericValue}` : String(numericValue);
    };
    const getChangeColor = (value) => {
      const numericValue = Number(value) || 0;
      if (numericValue > 0) return '#22c55e';
      if (numericValue < 0) return '#ef4444';
      return '#d8d3ec';
    };
    const rankChange = Number(entry.rank_change) || 0;
    const pointsChange = Number(entry.points_change) || 0;
    const rankChangeStyle = {
      marginTop: 2,
      fontSize: 11,
      fontWeight: 800,
      lineHeight: 1,
      color: getChangeColor(rankChange),
      textShadow: statTextShadow
    };
    const pointsChangeStyle = {
      marginTop: 1,
      fontSize: 12,
      fontWeight: 800,
      lineHeight: 1,
      textAlign: 'right',
      color: getChangeColor(pointsChange),
      textShadow: statTextShadow
    };
    return (
      <div
        className="leaderboard-card"
        style={{
          position: 'relative',
          background: bgUrl ? `url('${bgUrl}') center/cover no-repeat` : fallbackBg,
          borderRadius: 20,
          padding: 0,
          marginBottom: 16,
          color: '#fff',
          boxShadow: `${baseBoxShadow}${rivalryShadow}`,
          border: rivalryBorder,
          overflow: 'hidden',
          minHeight: 90,
          display: 'flex',
          alignItems: 'stretch',
          flexWrap: 'wrap',
        }}
      >
        {/* Overlay for readability */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.52) 58%, rgba(0,0,0,0.66) 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }} />
        {/* Card Content */}
        <div style={{
          position: 'relative',
          zIndex: 3,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          flexWrap: 'wrap',
        }}>
          {/* Rank & Medal */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 48 }}>
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                marginRight: 6,
                color:
                  isCurrentUser
                    ? 'rgba(255, 255, 255, 1)'
                    : index === 0
                    ? '#FFD700'
                    : index === 1
                    ? '#C0C0C0'
                    : index === 2
                    ? '#CD7F32'
                    : 'rgba(255, 255, 255, 0.8)',
                textShadow:
                  isCurrentUser
                    ? '0 0 4px rgba(255, 255, 255, 0.5)'
                    : index === 0
                    ? '0 0 4px #FFD70088'
                    : index === 1
                    ? '0 0 4px #C0C0C088'
                    : index === 2
                    ? '0 0 4px #CD7F3288'
                    : undefined,
              }}
            >
              {index === 0 ? 'C' : index}
            </span>
            {rankChange !== 0 && (
              <span style={rankChangeStyle}>{formatChange(rankChange)}</span>
            )}
          </div>
          {/* Name & Details */}
          <div style={{ flex: '1 1 0', minWidth: 0, paddingRight: 12, display: 'flex', alignItems: 'center', gap: 9 }}>
            <span className={`leaderboard-squid-avatar squid-avatar-dense-host${isCurrentUser ? ' squid-avatar-dense-host--current' : ''}`}>
              <SquidAvatar
                config={entry.avatar_config}
                className="squid-avatar--dense squid-avatar--motion-gated"
                title={`${entry.username} avatar`}
                animated
                streakType={winStreakCount >= 3 ? 'hot' : lossStreakCount >= 2 ? 'cold' : null}
                streakCount={winStreakCount || lossStreakCount}
                reaction={isNemesis ? 'nemesis' : isPickTwin ? 'twin' : null}
              />
            </span>
            <div style={{ fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                minWidth: 0,
                width: '100%',
                maxWidth: '100%',
                flexShrink: 1,
              }}>
                <span style={{
                  display: 'block',
                  width: '100%',
                  fontSize: 'clamp(0.9rem, 2vw, 1.2rem)',
                  whiteSpace: 'normal',
                  textAlign: 'left',
                  overflow: 'visible',
                  overflowWrap: 'break-word',
                  lineHeight: 1.05,
                  color: '#fff',
                  textShadow: '0 2px 8px #000a, 0 0 2px #000',
                  fontWeight: 700,
                }}>
                  {entry.username}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 8px', marginTop: 2, maxWidth: '100%' }}>
                  {entry.is_bot && (
                    <span style={{
                      background: 'rgba(59,130,246,0.2)',
                      color: '#60a5fa',
                      padding: '0px 7px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1,
                      height: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      minHeight: 0,
                      minWidth: 0,
                      flexShrink: 0,
                    }}>
                      AI
                    </span>
                  )}
                  {entry.streak && entry.streak.count >= 2 && (
                    <span style={{
                      background: entry.streak.type === 'win' 
                        ? 'rgba(34, 197, 94, 0.15)' 
                        : 'rgba(43, 49, 178, 0.15)',
                      color: entry.streak.type === 'win' ? '#22c55e' : '#60a5fa',
                      padding: '0px 7px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1,
                      height: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                      minHeight: 0,
                      minWidth: 0,
                      flexShrink: 0,
                      border: entry.streak.type === 'win'
                        ? '1px solid rgba(34, 197, 94, 0.3)'
                        : '1px solid rgba(43, 49, 178, 0.3)',
                    }}>
                      {entry.streak.type === 'win' ? '🔥' : '❄️'}{entry.streak.count}
                    </span>
                  )}
                  {crownCount > 0 && (
                    <span style={crownBadgeStyle}>
                      👑 {crownCount}
                    </span>
                  )}
                  {entry.season_2025_winner && (
                    <span style={seasonWinnerBadgeStyle}>
                      🏆
                    </span>
                  )}
                  {isPickTwin && (
                    <span style={rivalryBadgeStyle('twin')}>
                      👯 Twin
                    </span>
                  )}
                  {isNemesis && (
                    <span style={rivalryBadgeStyle('nemesis')}>
                      😈 Nemesis
                    </span>
                  )}
                </div>
              </span>
            </div>
          </div>
          {/* Points (big) and stats (small, no text) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 70 }}>
            <div style={{ fontSize: 28, fontWeight: 800, textAlign: 'right', color: getStatColor(entry.total_points, minPoints, maxPoints), textShadow: statTextShadow }}>{entry.total_points}</div>
            {pointsChange !== 0 && (
              <div style={pointsChangeStyle}>{formatChange(pointsChange)}</div>
            )}
            <div style={{ fontSize: 20, color: '#d8d3ec', fontWeight: 500, marginTop: 4, letterSpacing: 1, display: 'flex', gap: 18, textShadow: statTextShadow }}>
              <span>
                <span style={{ color: getStatColor(entry.correct_predictions, minCorrect, maxCorrect) }}>{entry.correct_predictions}</span>
                /<span style={{ color: '#d8d3ec' }}>{entry.total_predictions}</span>
              </span>
              <span>
                <span style={{ color: getStatColor(roundedAccuracy, minAcc, maxAcc) }}>{roundedAccuracy}<span style={{ color: getStatColor(roundedAccuracy, minAcc, maxAcc) }}>%</span></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- LeaderboardCardsList subcomponent ---
  // Renders a list of leaderboard cards for the given data and title
  // Memoize this component to prevent unnecessary re-renders
  const LeaderboardCardsList = ({ data, title, showEventCount = true }) => {
    if (!data.length) {
      return (
        <div style={emptyStyle}>
          No predictions have been made yet
        </div>
      );
    }
    // Filter out bots if showBots is false
    const filteredData = showBots ? data : data.filter(entry => !entry.is_bot);
    const sortedData = [...filteredData].sort((a, b) => {
      const aValue = Number(a.total_points) || 0;
      const bValue = Number(b.total_points) || 0;
      return bValue - aValue;
    });
    if (!sortedData.length) {
      return (
        <div style={emptyStyle}>
          No predictions have been made yet
        </div>
      );
    }
    const fightCount = sortedData.reduce((max, entry) => {
      const totalPredictions = Number(entry.total_predictions) || 0;
      return Math.max(max, totalPredictions);
    }, 0);
    const eventCount = sortedData.reduce((max, entry) => {
      const eventsPlayed = Number(entry.events_played) || 0;
      return Math.max(max, eventsPlayed);
    }, 0);
    const metaParts = [
      `${fightCount} Fights`,
      ...(showEventCount && eventCount > 0 ? [`${eventCount} Events`] : [])
    ];

    // Find min/max for each stat
    const corrects = sortedData.map(e => e.correct_predictions);
    const accuracies = sortedData.map(e => Math.round(parseFloat(e.accuracy)));
    const pointsArr = sortedData.map(e => e.total_points);
    const minCorrect = Math.min(...corrects);
    const maxCorrect = Math.max(...corrects);
    const minAcc = Math.min(...accuracies);
    const maxAcc = Math.max(...accuracies);
    const minPoints = Math.min(...pointsArr);
    const maxPoints = Math.max(...pointsArr);

    return (
      <>
        <div style={sectionHeaderStyle}>
          <h2 className="app-content-heading leaderboard-list-heading">{title}</h2>
          <div style={sectionMetaStyle}>{metaParts.join(' | ')}</div>
        </div>
        <div style={{ width: '100%', maxWidth: 500, margin: '0 auto' }}>
          {sortedData.map((entry, index) => (
            <LeaderboardCard
              key={entry.username}
              entry={entry}
              index={index}
              isCurrentUser={entry.username === currentUser}
              isPickTwin={rivalryMarkers.pickTwinUserId != null && String(entry.user_id) === String(rivalryMarkers.pickTwinUserId)}
              isNemesis={rivalryMarkers.nemesisUserId != null && String(entry.user_id) === String(rivalryMarkers.nemesisUserId)}
              minCorrect={minCorrect}
              maxCorrect={maxCorrect}
              minAcc={minAcc}
              maxAcc={maxAcc}
              minPoints={minPoints}
              maxPoints={maxPoints}
            />
          ))}
        </div>
      </>
    );
  };

  // --- Main render logic ---

  // Show loading state
  if (isLoading) {
    return (
      <div style={containerStyle}>
        <h1 className="app-page-heading leaderboard-page-heading">Leaderboard</h1>
        <div style={loadingStyle}>
          Loading leaderboard...
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div style={containerStyle}>
        <h1 className="app-page-heading leaderboard-page-heading">Leaderboard</h1>
        <div style={errorStyle}>{error}</div>
      </div>
    );
  }

  // Main leaderboard UI
  return (
    <div ref={containerRef} style={containerStyle} className="leaderboard-container">
      <h1 className="app-page-heading leaderboard-page-heading">Leaderboard</h1>
      {/* Leaderboard selection toggle */}
      <div style={filterToggleStyle} className="leaderboard-toggle-group">
        {eventId && (
          <button
            className={`leaderboard-toggle-button${selectedLeaderboard === 'event' ? ' is-active' : ''}`}
            onClick={() => setSelectedLeaderboard('event')}
          >
            Event
          </button>
        )}
        <button
          className={`leaderboard-toggle-button${selectedLeaderboard === 'season' ? ' is-active' : ''}`}
          onClick={() => setSelectedLeaderboard('season')}
        >
          Season
        </button>
        <button
          className={`leaderboard-toggle-button${selectedLeaderboard === 'overall' ? ' is-active' : ''}`}
          onClick={() => setSelectedLeaderboard('overall')}
        >
          All Time
        </button>
        <button
          className={`leaderboard-toggle-button${selectedLeaderboard === '2025' ? ' is-active' : ''}`}
          onClick={() => setSelectedLeaderboard('2025')}
        >
          2025
        </button>
      </div>
      <div style={filterToggleStyle}>
        <style>
          {`@keyframes leaderboard-refresh-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .refresh-button,
            .refresh-button:hover,
            .refresh-button:focus,
            .refresh-button:active,
            .refresh-button:focus-visible {
              background: transparent !important;
              border: none !important;
              outline: none !important;
              box-shadow: none !important;
              -webkit-box-shadow: none !important;
              -moz-box-shadow: none !important;
            }`}
        </style>
        <button
          className="refresh-button"
          style={refreshButtonStyle(isRefreshing)}
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          aria-label="Refresh leaderboard"
          title="Refresh leaderboard"
        >
          <span style={refreshIconStyle(isRefreshing)}>⟳</span>
        </button>
      </div>
      {/* Show only the selected leaderboard */}
      {selectedLeaderboard === 'event' && eventId && (
        <>
          {isEventComplete && (
            <EventRecap recap={eventRecap} isLoading={isRecapLoading} error={recapError} />
          )}
          <LeaderboardCardsList
            data={eventLeaderboard}
            title="Event Leaderboard"
            showEventCount={false}
          />
          <EventFriendComparison
            comparison={eventComparison}
            isLoading={isComparisonLoading}
            error={comparisonError}
            selectedFriendId={selectedFriendId}
            onFriendChange={handleFriendChange}
          />
        </>
      )}
      {selectedLeaderboard === 'season' && (
        <LeaderboardCardsList
          data={seasonLeaderboard}
          title="Season Leaderboard"
        />
      )}
      {selectedLeaderboard === 'overall' && (
        <LeaderboardCardsList
          data={overallLeaderboard}
          title="All Time Leaderboard"
        />
      )}
      {selectedLeaderboard === '2025' && (
        <LeaderboardCardsList
          data={season2025Leaderboard}
          title="2025 Leaderboard"
        />
      )}
      <section className="leaderboard-points-explainer" aria-labelledby="leaderboard-points-explainer-title">
        <h2
          id="leaderboard-points-explainer-title"
          className="app-subsection-heading leaderboard-points-explainer-title"
        >
          How the points work
        </h2>
        <ul className="leaderboard-points-explainer-list">
          <li>Only correct picks earn points.</li>
          <li>Correct favorites earn fewer points. Example: <code>-200</code> pays <code>2</code> points.</li>
          <li>Correct underdogs earn more points. Example: <code>+150</code> pays <code>3</code> points.</li>
          <li>If odds are missing, a correct pick is worth <code>1</code> point.</li>
          <li>You get a streak bonus: <code>+1</code> for 3 straight correct picks and another <code>+1</code> at 5 straight in the same event.</li>
          <li>A perfect main card earns an extra <code>+2</code> points.</li>
        </ul>
        <p className="leaderboard-points-explainer-note">
          Your leaderboard total is the sum of your correct-pick points plus any event bonuses.
        </p>
      </section>
    </div>
  );
}

export default Leaderboard; 
