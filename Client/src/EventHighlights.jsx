import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from './config';
import { cachedFetchJson } from './utils/apiCache';
import EventRecap from './components/EventRecap';
import './EventHighlights.css';

function EventHighlights({ eventId, isEventComplete = false }) {
  const [recap, setRecap] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const activeEventIdRef = useRef(eventId);
  activeEventIdRef.current = eventId;

  const fetchRecap = useCallback(async ({ force = false } = {}) => {
    if (!eventId || !isEventComplete) return;
    const requestedEventId = eventId;
    setIsLoading(true);
    setError('');
    try {
      const result = await cachedFetchJson(`${API_URL}/events/${requestedEventId}/recap`, {
        cacheKey: `event-recap:${requestedEventId}`,
        ttlMs: 60000,
        force,
        allowStaleOnError: true,
        staleWhileRevalidate: false,
        fetchOptions: { cache: 'no-store' },
      });
      if (String(activeEventIdRef.current) === String(requestedEventId)) setRecap(result || null);
    } catch (recapError) {
      console.error('Error fetching event recap:', recapError);
      if (String(activeEventIdRef.current) === String(requestedEventId)) {
        setError('The event highlights could not be loaded.');
      }
    } finally {
      if (String(activeEventIdRef.current) === String(requestedEventId)) setIsLoading(false);
    }
  }, [eventId, isEventComplete]);

  useEffect(() => {
    if (!eventId || !isEventComplete) return;
    void fetchRecap();
  }, [eventId, isEventComplete, fetchRecap]);

  const currentRecap = String(recap?.event?.id) === String(eventId) ? recap : null;

  return (
    <div className="event-highlights">
      <h1 className="app-page-heading event-highlights__heading">Highlights</h1>
      {!eventId ? (
        <p className="event-highlights__state">Select an event to see its highlights.</p>
      ) : !isEventComplete ? (
        <p className="event-highlights__state">Highlights appear after the event is complete.</p>
      ) : currentRecap?.status === 'complete' && currentRecap.podium.length === 0 ? (
        <p className="event-highlights__state">No player highlights are available for this event.</p>
      ) : currentRecap?.status === 'pending' ? (
        <p className="event-highlights__state">Highlights are being prepared for this event.</p>
      ) : !currentRecap && !isLoading && !error ? (
        <p className="event-highlights__state">No highlights are available for this event.</p>
      ) : (
        <EventRecap
          recap={currentRecap}
          isLoading={isLoading}
          error={error}
          onRetry={() => { void fetchRecap({ force: true }); }}
        />
      )}
    </div>
  );
}

export default EventHighlights;
