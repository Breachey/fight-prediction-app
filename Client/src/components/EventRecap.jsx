import React, { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import SquidAvatar from './SquidAvatar';
import './EventRecap.css';

function formatPlace(place) {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return String(place);
}

function EventRecap({ recap, isLoading = false, error = '', onRetry }) {
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    setShareStatus('');
  }, [recap?.event?.id]);

  const handleShare = async () => {
    if (!recap?.share_text) return;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const payload = {
      title: `${recap.event?.name || 'Fight Picks'} Recap`,
      text: recap.share_text,
      ...(url ? { url } : {}),
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        setShareStatus('Shared');
        return;
      } catch (shareError) {
        if (shareError?.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText([recap.share_text, url].filter(Boolean).join('\n'));
        setShareStatus('Copied');
        return;
      } catch {
        // Fall through to the visible error state.
      }
    }

    setShareStatus('Could not share');
  };

  if (isLoading && !recap) {
    return <div className="event-recap-state" role="status">Building event recap…</div>;
  }

  if (error && !recap) {
    return (
      <div className="event-recap-state event-recap-state--error" role="alert">
        <span>{error}</span>
        {onRetry && <button type="button" onClick={onRetry}>Retry recap</button>}
      </div>
    );
  }

  if (!recap || recap.status !== 'complete' || recap.podium.length === 0) {
    return null;
  }

  return (
    <section className="event-recap" aria-labelledby="event-recap-title" aria-busy={isLoading}>
      <header className="event-recap__header">
        <div>
          <p className="app-section-heading event-recap__kicker">Fight night recap</p>
          <h2 id="event-recap-title" className="app-content-heading event-recap__title">
            {recap.event?.name || 'Event Recap'}
          </h2>
          <p className="event-recap__meta">
            {recap.participant_count} {recap.participant_count === 1 ? 'player' : 'players'} · {recap.completed_fight_count} fights
          </p>
        </div>
        <div className="event-recap__share-wrap">
          {isLoading && <span className="event-recap__updating" role="status">Updating…</span>}
          <button
            type="button"
            className="event-recap__share"
            onClick={handleShare}
            aria-label="Share event recap"
            title="Share event recap"
          >
            <Share2 size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="event-recap__share-status" aria-live="polite">{shareStatus}</span>
        </div>
      </header>

      {error && (
        <div className="event-recap__inline-error" role="alert">
          <span>{error} Showing the last recap we loaded.</span>
          {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
        </div>
      )}

      <div className="event-recap__podium" aria-label="Event podium">
        {recap.podium.map((entry) => (
          <article key={entry.user_id} className={`event-recap__podium-entry event-recap__podium-entry--${entry.place}`}>
            <span className="event-recap__place">{formatPlace(entry.place)}</span>
            <span className="event-recap__avatar">
              <SquidAvatar
                config={entry.avatar_config}
                title={`${entry.username} avatar`}
                animated={false}
              />
            </span>
            <strong>{entry.username}</strong>
            <span>{entry.total_points} pts</span>
            <small>{entry.correct_predictions}/{entry.total_predictions} correct</small>
          </article>
        ))}
      </div>

      {recap.awards.length > 0 && (
        <div className="event-recap__awards">
          <h3 className="app-subsection-heading event-recap__awards-title">Night awards</h3>
          <div className="event-recap__award-list">
            {recap.awards.map((award) => (
              <article key={award.id} className="event-recap__award">
                <div className="event-recap__award-copy">
                  <span className="event-recap__award-label">{award.title}</span>
                  <strong>{award.headline}</strong>
                  <p>{award.detail}</p>
                </div>
                <span className="event-recap__award-value">{award.value}</span>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default EventRecap;
