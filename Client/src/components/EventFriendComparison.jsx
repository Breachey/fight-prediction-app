import React from 'react';
import SquidAvatar from './SquidAvatar';
import './EventFriendComparison.css';

function formatPoints(points) {
  const value = Number(points) || 0;
  return `${value} ${value === 1 ? 'pt' : 'pts'}`;
}

function getFightStateCopy(fight, friendName) {
  if (fight.comparison_state === 'locked') {
    return { label: 'Locked', detail: 'Make your pick' };
  }
  if (fight.comparison_state === 'canceled') {
    return { label: 'Canceled', detail: 'No sweat' };
  }
  if (fight.is_completed && fight.result_type === 'draw') {
    return { label: 'Draw', detail: 'No points' };
  }
  if (fight.is_completed && fight.result_type === 'no_contest') {
    return { label: 'No contest', detail: 'No points' };
  }
  if (fight.comparison_state === 'agreement') {
    if (!fight.is_completed) return { label: 'Agree', detail: 'Same side' };
    if (fight.viewer_pick?.is_correct) return { label: 'Agree', detail: 'Both hit' };
    return { label: 'Agree', detail: 'Both missed' };
  }
  if (fight.comparison_state === 'disagreement') {
    if (fight.is_sweat) return { label: 'Sweat', detail: 'Opposite sides' };
    if (fight.viewer_pick?.is_correct) return { label: 'Your edge', detail: 'You called it' };
    if (fight.friend_pick?.is_correct) return { label: `${friendName}'s edge`, detail: 'They called it' };
    return { label: 'Split', detail: 'No winner' };
  }
  if (fight.comparison_state === 'friend_missing') {
    return { label: 'No pick', detail: `${friendName} sat out` };
  }
  if (fight.comparison_state === 'viewer_missing') {
    return { label: 'No pick', detail: 'You sat out' };
  }
  return { label: 'No picks', detail: 'Both sat out' };
}

function PickLane({ pick, hidden = false, side, fallback }) {
  const resultLabel = pick?.is_correct === true
    ? 'Correct'
    : pick?.is_correct === false
      ? 'Missed'
      : null;

  return (
    <div className={`friend-comparison__pick friend-comparison__pick--${side}`}>
      <strong>{hidden ? 'Hidden' : pick?.fighter_name || fallback}</strong>
      {hidden ? (
        <small>Reveals after your pick</small>
      ) : pick ? (
        <small>
          <span className={`friend-comparison__corner friend-comparison__corner--${pick.corner || 'unknown'}`}>
            {pick.corner ? `${pick.corner} corner` : 'Pick'}
          </span>
          {resultLabel && <span>{resultLabel} · {formatPoints(pick.points)}</span>}
        </small>
      ) : (
        <small>No selection</small>
      )}
    </div>
  );
}

function PersonScore({ person, label, points, side }) {
  return (
    <div className={`friend-comparison__person friend-comparison__person--${side}`}>
      <span className="friend-comparison__avatar">
        <SquidAvatar config={person?.avatar_config} title={`${person?.username || label} avatar`} animated={false} />
      </span>
      <span className="friend-comparison__person-copy">
        <small>{label}</small>
        <strong>{person?.username || label}</strong>
      </span>
      <b>{formatPoints(points)}</b>
    </div>
  );
}

function EventFriendComparison({
  comparison,
  isLoading = false,
  error = '',
  selectedFriendId = '',
  onFriendChange,
}) {
  if (isLoading && !comparison) {
    return <div className="friend-comparison-state" role="status">Loading friend matchup…</div>;
  }

  if (error && !comparison) {
    return <div className="friend-comparison-state friend-comparison-state--error">{error}</div>;
  }

  if (!comparison) return null;

  const friends = comparison.friends || [];
  const friend = comparison.selected_friend;
  const summary = comparison.summary || {};

  return (
    <section className="friend-comparison" aria-labelledby="friend-comparison-title" aria-busy={isLoading}>
      <header className="friend-comparison__header">
        <div>
          <p className="app-section-heading friend-comparison__kicker">Card matchup</p>
          <h2 id="friend-comparison-title" className="app-content-heading friend-comparison__title">
            Compare with a friend
          </h2>
        </div>
        {isLoading && <span className="friend-comparison__updating" role="status">Updating…</span>}
      </header>

      {error && <p className="friend-comparison__inline-error">{error}</p>}

      {friends.length === 0 ? (
        <div className="friend-comparison__empty">
          No friends have picks on this card yet.
        </div>
      ) : (
        <>
          <label className="friend-comparison__selector">
            <span>Friend</span>
            <select
              value={selectedFriendId || friend?.user_id || ''}
              onChange={(event) => onFriendChange?.(event.target.value)}
              disabled={isLoading}
            >
              {friends.map((candidate) => (
                <option key={candidate.user_id} value={candidate.user_id}>
                  {candidate.username} · {candidate.pick_count} picks
                </option>
              ))}
            </select>
          </label>

          {friend && (
            <>
              <div className="friend-comparison__scoreboard">
                <PersonScore
                  person={comparison.viewer}
                  label="You"
                  points={summary.viewer_points}
                  side="viewer"
                />
                <div className="friend-comparison__versus" aria-label={`${summary.points_edge || 0} point edge`}>
                  <span>VS</span>
                  <strong>
                    {Number(summary.points_edge) === 0
                      ? 'Tied'
                      : `${Number(summary.points_edge) > 0 ? '+' : ''}${summary.points_edge}`}
                  </strong>
                </div>
                <PersonScore
                  person={friend}
                  label="Friend"
                  points={summary.friend_points}
                  side="friend"
                />
              </div>

              <dl className="friend-comparison__stats">
                <div>
                  <dt>Agreements</dt>
                  <dd>{summary.agreements || 0}</dd>
                </div>
                <div>
                  <dt>Disagreements</dt>
                  <dd>{summary.disagreements || 0}</dd>
                </div>
                <div className={Number(summary.remaining_sweats) > 0 ? 'is-live' : ''}>
                  <dt>Remaining sweats</dt>
                  <dd>{summary.remaining_sweats || 0}</dd>
                </div>
              </dl>

              <div className="friend-comparison__fight-list">
                <h3 className="app-subsection-heading friend-comparison__fight-list-title">Fight by fight</h3>
                {comparison.fights.map((fight) => {
                  const stateCopy = getFightStateCopy(fight, friend.username);
                  const matchup = (fight.matchup || []).map((fighter) => fighter.fighter_name).join(' vs ');
                  return (
                    <article
                      key={fight.fight_id}
                      className={`friend-comparison__fight friend-comparison__fight--${fight.comparison_state}`}
                    >
                      <div className="friend-comparison__fight-meta">
                        <span>{fight.card_segment || 'Fight card'}</span>
                        <strong>{matchup || `Fight ${fight.fight_order}`}</strong>
                      </div>
                      <div className="friend-comparison__fight-grid">
                        <PickLane pick={fight.viewer_pick} side="viewer" fallback="No pick" />
                        <div className="friend-comparison__fight-state">
                          <strong>{stateCopy.label}</strong>
                          <small>{stateCopy.detail}</small>
                        </div>
                        <PickLane
                          pick={fight.friend_pick}
                          hidden={!fight.is_visible}
                          side="friend"
                          fallback="No pick"
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default EventFriendComparison;
