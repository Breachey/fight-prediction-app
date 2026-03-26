import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import './EventSelector.css';
import { API_URL } from './config';
import { cachedFetchJson, invalidateCache } from './utils/apiCache';
import {
  clearAdminSession,
  fetchWithAdminSession,
  getAdminSessionExpiry,
  hasActiveAdminSession,
} from './utils/adminSession';

const areEventIdsEqual = (a, b) => String(a) === String(b);

const getEventSeasonYear = (event) => {
  if (!event?.date) return null;
  const year = Number(String(event.date).slice(0, 4));
  return Number.isFinite(year) ? year : null;
};

const formatEventDate = (dateValue) => {
  if (!dateValue) return '';

  const [year, month, day] = String(dateValue).split('T')[0].split('-');
  if (!year || !month || !day) return '';

  const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
  if (!Number.isFinite(dateObj.getTime())) return '';

  return dateObj.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatUtahStartTime = (dateTimeValue) => {
  if (!dateTimeValue) return '';

  const startTime = new Date(dateTimeValue);
  if (!Number.isFinite(startTime.getTime())) return '';

  return startTime.toLocaleTimeString(undefined, {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
};

const buildUtahCardStartTimeLines = (cardStartTimes) => {
  if (!cardStartTimes || typeof cardStartTimes !== 'object') {
    return [];
  }

  const orderedSegments = [
    ['early_prelims', 'Early Prelims'],
    ['prelims', 'Prelims'],
    ['main_card', 'Main Card'],
  ];

  return orderedSegments.reduce((lines, [key, label]) => {
    const formattedTime = formatUtahStartTime(cardStartTimes[key]);
    if (formattedTime) {
      lines.push(`${label}: ${formattedTime}`);
    }
    return lines;
  }, []);
};

const buildApiErrorMessage = (payload, fallbackMessage) => {
  if (!payload || typeof payload !== 'object') {
    return fallbackMessage;
  }

  const primaryMessage = typeof payload.error === 'string' && payload.error.trim()
    ? payload.error.trim()
    : '';
  const detailMessage = typeof payload.details === 'string' && payload.details.trim()
    ? payload.details.trim()
    : '';

  if (primaryMessage && detailMessage && detailMessage !== primaryMessage) {
    return `${primaryMessage}: ${detailMessage}`;
  }

  return primaryMessage || detailMessage || fallbackMessage;
};

function EventSelector({
  onEventSelect,
  selectedEventId,
  userType = 'user',
  onSelectedEventChange,
  onFightCardImportComplete,
}) {
  const [allEvents, setAllEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSeasonYear, setActiveSeasonYear] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAtStart, setIsAtStart] = useState(true);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const carouselRef = useRef(null);
  const cardRefs = useRef([]);
  const touchStartX = useRef(null);
  const hasCenteredOnInit = useRef(false);
  const selectedEventIdRef = useRef(selectedEventId);
  const activeSeasonYearRef = useRef(activeSeasonYear);
  const fetchSequenceRef = useRef(0);
  const [finalizingEventId, setFinalizingEventId] = useState(null);
  const [finalizeFeedback, setFinalizeFeedback] = useState(null);
  const [previewingEventId, setPreviewingEventId] = useState(null);
  const [importingEventId, setImportingEventId] = useState(null);
  const [fightCardFeedback, setFightCardFeedback] = useState(null);
  const [fightCardPreview, setFightCardPreview] = useState(null);
  const [adminAccessFeedback, setAdminAccessFeedback] = useState(null);
  const [selectedEventCardStartTimes, setSelectedEventCardStartTimes] = useState({
    early_prelims: null,
    prelims: null,
    main_card: null,
  });
  const canManageAdminActions = userType === 'admin' && hasActiveAdminSession();
  const adminSessionExpiryLabel = useMemo(() => {
    if (!canManageAdminActions) {
      return '';
    }

    const rawExpiry = getAdminSessionExpiry().trim();
    if (!rawExpiry) {
      return 'Admin session active';
    }

    const expiryDate = new Date(rawExpiry);
    if (!Number.isFinite(expiryDate.getTime())) {
      return 'Admin session active';
    }

    return `Admin session active until ${expiryDate.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }, [canManageAdminActions]);

  const centerCardAtIndex = useCallback((index, behavior = 'smooth') => {
    const carousel = carouselRef.current;
    const selectedCard = carousel?.querySelector('.event-card.selected');
    const card = selectedCard || cardRefs.current[index];
    if (!carousel || !card) return;

    // Center using viewport-relative geometry so transforms/padding don't skew offsets.
    const carouselRect = carousel.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const delta = (cardRect.left + (cardRect.width / 2)) - (carouselRect.left + (carouselRect.width / 2));
    const targetScrollLeft = carousel.scrollLeft + delta;
    const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    const clampedScrollLeft = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft));

    if (behavior === 'smooth' && typeof carousel.scrollTo === 'function') {
      try {
        carousel.scrollTo({ left: clampedScrollLeft, behavior: 'smooth' });
        return;
      } catch (error) {
        // Fall back to direct assignment if browser rejects scroll options.
      }
    }

    carousel.scrollLeft = clampedScrollLeft;
  }, []);

  const seasonYears = useMemo(() => {
    const years = Array.from(
      new Set(allEvents.map(getEventSeasonYear).filter((year) => year !== null))
    );
    return years.sort((a, b) => a - b);
  }, [allEvents]);

  const latestSeasonYear = seasonYears.length ? seasonYears[seasonYears.length - 1] : null;
  const currentCalendarYear = new Date().getFullYear();
  const defaultSeasonYear = seasonYears.includes(currentCalendarYear)
    ? currentCalendarYear
    : latestSeasonYear;

  const events = useMemo(() => {
    if (activeSeasonYear === null) return [];
    return allEvents.filter((event) => getEventSeasonYear(event) === activeSeasonYear);
  }, [allEvents, activeSeasonYear]);

  const activeSeasonIndex = seasonYears.findIndex((year) => year === activeSeasonYear);
  const previousSeasonYear = activeSeasonIndex > 0 ? seasonYears[activeSeasonIndex - 1] : null;
  const nextSeasonYear = activeSeasonIndex !== -1 && activeSeasonIndex < seasonYears.length - 1
    ? seasonYears[activeSeasonIndex + 1]
    : null;

  const updateScrollBoundaries = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) {
      setIsAtStart(true);
      setIsAtEnd(true);
      return;
    }

    const thresholdPx = 6;
    const maxScrollLeft = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    setIsAtStart(carousel.scrollLeft <= thresholdPx);
    setIsAtEnd(carousel.scrollLeft >= maxScrollLeft - thresholdPx);
  }, []);

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  useEffect(() => {
    activeSeasonYearRef.current = activeSeasonYear;
  }, [activeSeasonYear]);

  useEffect(() => {
    if (activeSeasonYear !== null || !defaultSeasonYear) return;
    setActiveSeasonYear(defaultSeasonYear);
  }, [activeSeasonYear, defaultSeasonYear]);

  useEffect(() => {
    if (!allEvents.length || selectedEventId === null || selectedEventId === undefined) return;

    const selectedEvent = allEvents.find((event) => areEventIdsEqual(event.id, selectedEventId));
    if (!selectedEvent) return;

    const selectedSeasonYear = getEventSeasonYear(selectedEvent);
    if (selectedSeasonYear === null) return;

    if (selectedSeasonYear !== activeSeasonYearRef.current) {
      hasCenteredOnInit.current = false;
      setActiveSeasonYear(selectedSeasonYear);
    }
  }, [selectedEventId, allEvents]);

  useEffect(() => {
    if (!events.length) {
      setCurrentIndex(0);
      return;
    }

    const activeSelectedId = selectedEventIdRef.current;
    const selectedIdx = activeSelectedId !== null && activeSelectedId !== undefined
      ? events.findIndex((event) => areEventIdsEqual(event.id, activeSelectedId))
      : -1;

    if (selectedIdx !== -1) {
      if (selectedIdx !== currentIndex) {
        setCurrentIndex(selectedIdx);
      }
      return;
    }

    const upcomingIndex = events.findIndex((event) => event.status === 'Upcoming');
    const targetIndex = upcomingIndex !== -1 ? upcomingIndex : 0;
    const targetEvent = events[targetIndex];

    if (targetIndex !== currentIndex) {
      setCurrentIndex(targetIndex);
    }

    if (targetEvent && !areEventIdsEqual(targetEvent.id, activeSelectedId)) {
      onEventSelect(targetEvent.id);
    }
  }, [events, currentIndex, onEventSelect]);

  // Keep selected card centered after layout has settled.
  useLayoutEffect(() => {
    if (!events.length) return;

    let frame1 = 0;
    let frame2 = 0;
    const timeoutIds = [];
    const behavior = hasCenteredOnInit.current ? 'smooth' : 'auto';

    frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        centerCardAtIndex(currentIndex, behavior);
        hasCenteredOnInit.current = true;
      });
    });

    // Retry centering to beat delayed image/layout changes and browser scroll restoration.
    [80, 180, 350, 700, 1200, 1800].forEach(delayMs => {
      const timeoutId = window.setTimeout(() => {
        centerCardAtIndex(currentIndex, 'auto');
        updateScrollBoundaries();
      }, delayMs);
      timeoutIds.push(timeoutId);
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      window.cancelAnimationFrame(frame2);
      timeoutIds.forEach(id => window.clearTimeout(id));
    };
  }, [currentIndex, events, centerCardAtIndex, updateScrollBoundaries]);

  useEffect(() => {
    if (!events.length) return;

    const onResize = () => centerCardAtIndex(currentIndex, 'auto');
    const onPageShow = () => centerCardAtIndex(currentIndex, 'auto');
    window.addEventListener('resize', onResize);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [currentIndex, events.length, centerCardAtIndex]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    updateScrollBoundaries();
    const onScroll = () => updateScrollBoundaries();
    carousel.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      carousel.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [events, activeSeasonYear, updateScrollBoundaries]);

  const fetchEvents = useCallback(async () => {
    const fetchSequence = ++fetchSequenceRef.current;

    try {
      const data = await cachedFetchJson(`${API_URL}/events`, {
        ttlMs: 120000,
        cacheKey: `${API_URL}/events:v2`,
      });
      const sortedEvents = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));

      // Ignore stale async responses.
      if (fetchSequence !== fetchSequenceRef.current) return;

      console.log('Fetched events:', sortedEvents);
      setAllEvents(sortedEvents);
      setIsLoading(false);

      if (sortedEvents.length === 0) {
        setActiveSeasonYear(null);
        setCurrentIndex(0);
        return;
      }

      const availableSeasonYears = Array.from(
        new Set(sortedEvents.map(getEventSeasonYear).filter((year) => year !== null))
      ).sort((a, b) => a - b);

      const fallbackSeasonYear = availableSeasonYears.includes(currentCalendarYear)
        ? currentCalendarYear
        : availableSeasonYears[availableSeasonYears.length - 1] ?? null;

      const activeSelectedId = selectedEventIdRef.current;
      let targetSeasonYear = fallbackSeasonYear;

      if (activeSelectedId !== null && activeSelectedId !== undefined) {
        const selectedEvent = sortedEvents.find((event) => areEventIdsEqual(event.id, activeSelectedId));
        const selectedSeasonYear = selectedEvent ? getEventSeasonYear(selectedEvent) : null;
        if (selectedSeasonYear !== null) {
          targetSeasonYear = selectedSeasonYear;
        }
      }

      hasCenteredOnInit.current = false;
      setActiveSeasonYear(targetSeasonYear);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('Failed to load events');
      setIsLoading(false);
    }
  }, [currentCalendarYear]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    cardRefs.current = [];
  }, [activeSeasonYear, events.length]);

  const selectedEvent = events[currentIndex] || null;
  const selectedEventDateStr = formatEventDate(selectedEvent?.date);
  const selectedEventStartTimeLines = buildUtahCardStartTimeLines(selectedEventCardStartTimes);
  const selectedEventLocationStr = selectedEvent
    ? [selectedEvent.venue, selectedEvent.location_city, selectedEvent.location_state].filter(Boolean).join(', ')
    : '';
  const selectedEventLocationDisplay = selectedEventLocationStr || 'Location TBD';
  const canImportFightCard = Boolean(fightCardPreview?.previewToken)
    && (fightCardPreview?.blockers?.length || 0) === 0;
  const hasFightCardPreview = Boolean(fightCardPreview);
  const isFightCardActionBusy = selectedEvent
    ? previewingEventId === selectedEvent.id || importingEventId === selectedEvent.id
    : false;
  const previewStatusMessage = fightCardPreview
    ? fightCardPreview.existingFightCardRowCount > 0
      ? `Import will replace ${fightCardPreview.existingFightCardRowCount} existing fighter row${fightCardPreview.existingFightCardRowCount === 1 ? '' : 's'} for this event.`
      : 'This will be the first fight-card import for this event.'
    : null;
  useEffect(() => {
    if (typeof onSelectedEventChange !== 'function') return;
    onSelectedEventChange(selectedEvent || null);
  }, [selectedEvent, onSelectedEventChange]);

  useEffect(() => {
    let cancelled = false;

    const loadSelectedEventStartTimes = async () => {
      if (!selectedEvent?.id) {
        setSelectedEventCardStartTimes({
          early_prelims: null,
          prelims: null,
          main_card: null,
        });
        return;
      }

      try {
        const payload = await cachedFetchJson(`${API_URL}/events/${selectedEvent.id}/start-time`, {
          ttlMs: 30000,
          cacheKey: `${API_URL}/events/${selectedEvent.id}/start-time:v2`,
          force: true,
          allowStaleOnError: false,
        });

        if (!cancelled) {
          setSelectedEventCardStartTimes({
            early_prelims: typeof payload?.card_start_times?.early_prelims === 'string'
              ? payload.card_start_times.early_prelims
              : null,
            prelims: typeof payload?.card_start_times?.prelims === 'string'
              ? payload.card_start_times.prelims
              : null,
            main_card: typeof payload?.card_start_times?.main_card === 'string'
              ? payload.card_start_times.main_card
              : null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedEventCardStartTimes({
            early_prelims: null,
            prelims: null,
            main_card: null,
          });
        }
      }
    };

    loadSelectedEventStartTimes();

    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.id]);

  const isPrevSeasonEnabled = Boolean(previousSeasonYear) && isAtStart;
  const isNextSeasonEnabled = Boolean(nextSeasonYear) && isAtEnd;

  const handleSeasonChange = (targetSeasonYear) => {
    if (targetSeasonYear === null || targetSeasonYear === undefined) return;
    if (targetSeasonYear === activeSeasonYear) return;
    hasCenteredOnInit.current = false;
    setCurrentIndex(0);
    setActiveSeasonYear(targetSeasonYear);
    setIsAtStart(true);
    setIsAtEnd(false);
  };

  const invalidateEventCaches = useCallback((eventId) => {
    invalidateCache(`${API_URL}/events`);
    if (!eventId) return;
    invalidateCache(`${API_URL}/events/${eventId}/fights`);
    invalidateCache(`${API_URL}/events/${eventId}/vote-counts`);
  }, []);

  const handleFinalizeEvent = async (event) => {
    if (!event || !event.id) return;

    const confirmationMessage = event.is_completed
      ? 'Recalculate winners for this event now?'
      : 'Mark this event as Final and crown winners now?';
    if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(confirmationMessage)) {
      return;
    }

    setFinalizeFeedback(null);
    setAdminAccessFeedback(null);
    setFinalizingEventId(event.id);
    try {
      const response = await fetchWithAdminSession(`${API_URL}/events/${event.id}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'Final' })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(buildApiErrorMessage(errorPayload, 'Failed to finalize event'));
      }

      const data = await response.json();
      const winnerCount = data.winners?.length || 0;
      setFinalizeFeedback({
        type: 'success',
        message: winnerCount > 0
          ? `Event finalized! Crowned ${winnerCount} winner${winnerCount === 1 ? '' : 's'}.`
          : 'Event finalized, but no eligible winners were found.'
      });
      invalidateEventCaches(event.id);
      await fetchEvents();
    } catch (err) {
      setFinalizeFeedback({
        type: 'error',
        message: err.message || 'Failed to finalize event'
      });
    } finally {
      setFinalizingEventId(null);
    }
  };

  const handlePreviewFightCard = async (event) => {
    if (!event?.id) return;

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setFightCardPreview(null);
    setPreviewingEventId(event.id);

    try {
      const response = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/fight-card/preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to preview fight card'));
      }

      setFightCardPreview(payload);
      setFightCardFeedback({
        type: payload.blockers?.length ? 'error' : 'success',
        message: payload.blockers?.length
          ? 'Preview found blockers that must be resolved before import.'
          : `Preview ready: ${payload.fightCount} fights and ${payload.rowCount} fighter rows.`
      });
    } catch (err) {
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to preview fight card'
      });
    } finally {
      setPreviewingEventId(null);
    }
  };

  const handleImportFightCard = async (event) => {
    if (!event?.id || !fightCardPreview?.previewToken) return;

    if (
      typeof window !== 'undefined'
      && typeof window.confirm === 'function'
      && !window.confirm(
        fightCardPreview.existingFightCardRowCount > 0
          ? `Import and replace ${fightCardPreview.existingFightCardRowCount} existing fighter rows for ${event.name}?`
          : `Import ${fightCardPreview.fightCount} fights for ${event.name}?`
      )
    ) {
      return;
    }

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setImportingEventId(event.id);

    try {
      const response = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/fight-card/import`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            previewToken: fightCardPreview.previewToken
          })
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to import fight card'));
      }

      invalidateEventCaches(event.id);
      await fetchEvents();
      onFightCardImportComplete?.(event.id);
      setFightCardPreview(null);
      setFightCardFeedback({
        type: 'success',
        message: `Imported ${payload.rowCount} fighter rows across ${payload.fightCount} fights.`
      });
    } catch (err) {
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to import fight card'
      });
    } finally {
      setImportingEventId(null);
    }
  };

  const handleClearAdminSession = () => {
    clearAdminSession();
    setAdminAccessFeedback({
      type: 'success',
      message: 'Stored admin session cleared. Log out and back in as an admin before your next protected action.'
    });
  };

  const handleDiscardFightCardPreview = () => {
    setFightCardPreview(null);
    setFightCardFeedback(null);
  };

  useEffect(() => {
    setFinalizeFeedback(null);
    setFightCardFeedback(null);
    setFightCardPreview(null);
    setAdminAccessFeedback(null);
  }, [selectedEventId]);

  const handleSelect = (idx) => {
    if (!events[idx]) return;
    setCurrentIndex(idx);
    onEventSelect(events[idx].id);
  };

  // Touch/swipe handlers
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (deltaX > 50 && currentIndex > 0) {
      handleSelect(currentIndex - 1);
    } else if (deltaX < -50 && currentIndex < events.length - 1) {
      handleSelect(currentIndex + 1);
    }
    touchStartX.current = null;
  };

  if (isLoading) {
    return (
      <div className="event-selector-carousel-container">
        <div className="event-selector-heading">Choose an Event</div>
        <div className="loading-message">Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="event-selector-carousel-container">
        <div className="event-selector-heading">Choose an Event</div>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <>
      {/* SVG Filter for electric border effect */}
      <svg className="electric-border-svg" style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter
            id="electric-border-filter"
            colorInterpolationFilters="sRGB"
            filterUnits="objectBoundingBox"
            x="0"
            y="0"
            width="1"
            height="1"
          >
            <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves="4" result="noise1" seed="1" />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
              <animate attributeName="dy" values="250; 0" dur="4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves="4" result="noise2" seed="1" />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
              <animate attributeName="dy" values="0; -250" dur="4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves="4" result="noise3" seed="2" />
            <feOffset in="noise3" dx="0" dy="0" result="offsetNoise3">
              <animate attributeName="dx" values="180; 0" dur="4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.025" numOctaves="4" result="noise4" seed="2" />
            <feOffset in="noise4" dx="0" dy="0" result="offsetNoise4">
              <animate attributeName="dx" values="0; -180" dur="4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
            <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
            <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />

            <feDisplacementMap in="SourceGraphic" in2="combinedNoise" scale="8" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </defs>
      </svg>

      <div className="event-selector-heading">Choose an Event</div>
      <div className="event-season-nav" role="group" aria-label="Season navigation">
        <button
          type="button"
          className={`event-season-nav__button event-season-nav__button--left${isPrevSeasonEnabled ? ' enabled' : ''}`}
          onClick={() => handleSeasonChange(previousSeasonYear)}
          disabled={!isPrevSeasonEnabled}
          title={isPrevSeasonEnabled ? `Switch to ${previousSeasonYear} season` : 'Scroll to the far left to enable'}
        >
          {previousSeasonYear ? `\u2190 ${previousSeasonYear}` : '\u2190'}
        </button>
        <div className="event-season-nav__label">
          {activeSeasonYear ? `${activeSeasonYear} Season` : 'Season'}
        </div>
        <button
          type="button"
          className={`event-season-nav__button event-season-nav__button--right${isNextSeasonEnabled ? ' enabled' : ''}`}
          onClick={() => handleSeasonChange(nextSeasonYear)}
          disabled={!isNextSeasonEnabled}
          title={isNextSeasonEnabled ? `Switch to ${nextSeasonYear} season` : 'Scroll to the far right to enable'}
        >
          {nextSeasonYear ? `${nextSeasonYear} \u2192` : '\u2192'}
        </button>
      </div>
      <div className="event-selector-carousel-container">
        {events.length === 0 ? (
          <div className="loading-message">No events found for this season.</div>
        ) : (
          <div
            className="event-carousel"
            ref={carouselRef}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {events.map((event, idx) => {
              const dateStr = formatEventDate(event.date);
              // Format location
              const locationParts = [event.venue, event.location_city, event.location_state].filter(Boolean);
              const locationStr = locationParts.join(', ');
              const isSelected = idx === currentIndex;
              return (
                <div
                  key={event.id}
                  className={`event-card${event.image_url ? ' has-image' : ''}${isSelected ? ' selected' : ''}${event.status === 'Complete' ? ' completed' : ''}`}
                  onClick={() => handleSelect(idx)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  ref={el => cardRefs.current[idx] = el}
                >
                  {/* Electric border layers for selected card */}
                  {isSelected && (
                    <>
                      <div className="electric-border-outer">
                        <div className="electric-border-inner"></div>
                      </div>
                      <div className="electric-glow-1"></div>
                      <div className="electric-glow-2"></div>
                      <div className="electric-background-glow"></div>
                    </>
                  )}
                  
                  {event.image_url ? (
                    <div className="event-image-container">
                      <img 
                        src={event.image_url} 
                        alt={`${event.name} logo`}
                        className="event-image"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          // Show text content when image fails to load
                          const card = e.target.closest('.event-card');
                          const textContent = card.querySelector('.event-text-content');
                          if (textContent) {
                            textContent.style.display = 'flex';
                          }
                        }}
                      />
                      {/* Status badge overlay */}
                      <div className={`status-badge-overlay ${event.status === 'Complete' ? 'completed' : (event.has_fight_data === false ? 'coming-soon' : 'upcoming')}`}>
                        {event.status === 'Complete' ? 'Completed' : (event.has_fight_data === false ? 'Coming Soon' : 'Upcoming')}
                      </div>
                    </div>
                  ) : (
                    <div className="event-text-content">
                      <span className="event-title">{event.name}</span>
                      {dateStr && <span className="event-date">{dateStr}</span>}
                      {locationStr && <span className="event-location">{locationStr}</span>}
                      <div className="event-badges">
                        <span className={`status-badge ${event.status === 'Complete' ? 'completed' : 'active'}`}>
                          {event.status === 'Complete' ? 'Completed' : (event.has_fight_data === false ? 'Coming Soon' : 'Upcoming')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {selectedEvent && (
        <div className="event-admin-panel">
          <div className="event-admin-panel__content">
            <div className="event-admin-panel__text">
              <span className="event-admin-panel__label">{canManageAdminActions ? 'Admin' : 'Event'}</span>
              <span className="event-admin-panel__title">{selectedEvent.name}</span>
              {selectedEventDateStr && (
                <div className="event-admin-panel__date">{selectedEventDateStr}</div>
              )}
              {selectedEventStartTimeLines.map((line) => (
                <div key={line} className="event-admin-panel__time">{line}</div>
              ))}
              <div className="event-admin-panel__location">{selectedEventLocationDisplay}</div>
              {userType === 'admin' && (
                <>
                  <div className={`event-admin-session-indicator${canManageAdminActions ? ' active' : ''}`}>
                    {canManageAdminActions
                      ? adminSessionExpiryLabel
                      : 'Admin session missing. Log out and back in to unlock admin controls.'}
                  </div>
                  {canManageAdminActions && (
                    <p className="event-admin-panel__hint">
                      Preview and import the fight card first, then mark the event as Final once scores are verified.
                    </p>
                  )}
                </>
              )}
            </div>
            {canManageAdminActions && (
              <div className="event-admin-panel__actions">
                {finalizeFeedback && (
                  <div className={`event-admin-feedback ${finalizeFeedback.type}`}>
                    {finalizeFeedback.message}
                  </div>
                )}
                <button
                  className="event-admin-finalize-button"
                  onClick={() => handleFinalizeEvent(selectedEvent)}
                  disabled={finalizingEventId === selectedEvent.id}
                >
                  {finalizingEventId === selectedEvent.id
                    ? 'Finalizing...'
                    : selectedEvent.is_completed
                    ? 'Recalculate Winners'
                    : 'Mark Final & Crown Winners'}
                </button>
                {fightCardFeedback && (
                  <div className={`event-admin-feedback ${fightCardFeedback.type}`}>
                    {fightCardFeedback.message}
                  </div>
                )}
                {adminAccessFeedback && (
                  <div className={`event-admin-feedback ${adminAccessFeedback.type}`}>
                    {adminAccessFeedback.message}
                  </div>
                )}
                <div className="event-admin-action-row">
                  <button
                    className="event-admin-preview-button"
                    onClick={() => handlePreviewFightCard(selectedEvent)}
                    disabled={isFightCardActionBusy}
                  >
                    {previewingEventId === selectedEvent.id
                      ? 'Scraping...'
                      : selectedEvent.has_fight_data
                      ? 'Refresh Fight Card Preview'
                      : 'Scrape Fight Card'}
                  </button>
                  {canImportFightCard && (
                    <button
                      className="event-admin-import-button"
                      onClick={() => handleImportFightCard(selectedEvent)}
                      disabled={isFightCardActionBusy}
                    >
                      {importingEventId === selectedEvent.id ? 'Importing...' : 'Import Fight Card'}
                    </button>
                  )}
                </div>
                <div className="event-admin-secondary-actions">
                  {hasFightCardPreview && (
                    <button
                      className="event-admin-secondary-button"
                      onClick={handleDiscardFightCardPreview}
                      disabled={isFightCardActionBusy}
                    >
                      Discard Preview
                    </button>
                  )}
                    <button
                      className="event-admin-secondary-button"
                      onClick={handleClearAdminSession}
                      disabled={finalizingEventId === selectedEvent.id || isFightCardActionBusy}
                    >
                      Clear Admin Session
                  </button>
                </div>
                {fightCardPreview && (
                  <div className="event-admin-import-preview">
                    <div className="event-admin-import-preview__stats">
                      <span>{fightCardPreview.fightCount} fights</span>
                      <span>{fightCardPreview.rowCount} rows</span>
                      <span>{fightCardPreview.existingFightCardRowCount} existing rows</span>
                      <span>{fightCardPreview.existingFightResultCount} existing results</span>
                    </div>
                    {fightCardPreview.previewEvent && (
                      <div className="event-admin-import-preview__summary">
                        {fightCardPreview.previewEvent.name}
                        {fightCardPreview.previewEvent.venue ? ` at ${fightCardPreview.previewEvent.venue}` : ''}
                        {fightCardPreview.previewEvent.location_city
                          ? `, ${fightCardPreview.previewEvent.location_city}`
                          : ''}
                        {fightCardPreview.previewEvent.location_state
                          ? `, ${fightCardPreview.previewEvent.location_state}`
                          : ''}
                        {fightCardPreview.previewEvent.location_country
                          ? `, ${fightCardPreview.previewEvent.location_country}`
                          : ''}
                      </div>
                    )}
                    {fightCardPreview.csvFileName && (
                      <div className="event-admin-import-preview__meta">
                        Source file: {fightCardPreview.csvFileName}
                      </div>
                    )}
                    {previewStatusMessage && (
                      <div className="event-admin-import-preview__meta">
                        {previewStatusMessage}
                      </div>
                    )}
                    {fightCardPreview.eventFieldChanges?.length > 0 && (
                      <div className="event-admin-import-preview__section">
                        <div className="event-admin-import-preview__title">Event updates</div>
                        <ul className="event-admin-import-preview__list">
                          {fightCardPreview.eventFieldChanges.map((change) => (
                            <li key={change.field}>
                              {change.field}: {change.from || 'empty'} {' -> '} {change.to || 'empty'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {fightCardPreview.warnings?.length > 0 && (
                      <div className="event-admin-import-preview__section">
                        <div className="event-admin-import-preview__title">Warnings</div>
                        <ul className="event-admin-import-preview__list">
                          {fightCardPreview.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {fightCardPreview.blockers?.length > 0 && (
                      <div className="event-admin-import-preview__section event-admin-import-preview__section--blocker">
                        <div className="event-admin-import-preview__title">Blockers</div>
                        <ul className="event-admin-import-preview__list">
                          {fightCardPreview.blockers.map((blocker) => (
                            <li key={blocker}>{blocker}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {fightCardPreview.previewToken && fightCardPreview.expiresAt && (
                      <div className="event-admin-import-preview__expiry">
                        Preview token ready until {new Date(fightCardPreview.expiresAt).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default EventSelector;
