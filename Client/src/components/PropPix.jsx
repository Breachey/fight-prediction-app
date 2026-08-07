import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL } from '../config';
import { fetchWithAdminSession, hasActiveAdminSession } from '../utils/adminSession';
import { fetchWithUserSession } from '../utils/userSession';
import './PropPix.css';

const WAGER_PRESETS = ['1 Shot', '2 Shots', '3 Shots', 'Drink', 'Dinner'];
const EMPTY_DRAFT = {
  question: '',
  responseType: 'options',
  options: ['', ''],
  wagerLabel: '1 Shot',
  customWager: '',
};

async function throwResponseError(response, fallback) {
  const data = await response.json().catch(() => ({}));
  throw new Error(data.error || fallback);
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getVoteLabel(bet, vote) {
  if (!vote) return '';
  if (vote.response_text) return vote.response_text;
  return bet.options.find((option) => String(option.id) === String(vote.option_id))?.label || '';
}

function getClaimOutcome(bet, claimDraft = {}) {
  if (bet.response_type === 'options' && claimDraft.optionId !== 'other') {
    return bet.options.find((option) => String(option.id) === String(claimDraft.optionId))?.label?.trim() || '';
  }

  return (claimDraft.customOutcome || '').trim();
}

function PropPix({ eventId, userId, userType }) {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [voteDrafts, setVoteDrafts] = useState({});
  const [claimDrafts, setClaimDrafts] = useState({});
  const [claimOpen, setClaimOpen] = useState(null);
  const [activeTab, setActiveTab] = useState('open');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canManageAdminActions = userType === 'admin' && hasActiveAdminSession();

  const loadBets = useCallback(async () => {
    if (!eventId || !userId) {
      setBets([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetchWithUserSession(`${API_URL}/events/${eventId}/prop-pix`, { cache: 'no-store' });
      if (!response.ok) await throwResponseError(response, 'Failed to load Prop Pix bets');
      const data = await response.json();
      const nextBets = Array.isArray(data) ? data : [];
      setBets(nextBets);
      setVoteDrafts((previous) => {
        const next = { ...previous };
        nextBets.forEach((bet) => {
          if (bet.my_vote && !next[bet.id]) {
            next[bet.id] = {
              optionId: bet.my_vote.option_id ? String(bet.my_vote.option_id) : '',
              responseText: bet.my_vote.response_text || '',
            };
          }
        });
        return next;
      });
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Failed to load Prop Pix bets');
    } finally {
      setLoading(false);
    }
  }, [eventId, userId]);

  useEffect(() => {
    setComposerOpen(false);
    setDraft(EMPTY_DRAFT);
    setClaimOpen(null);
    setVoteDrafts({});
    setClaimDrafts({});
    loadBets();
  }, [eventId, loadBets]);

  const visibleBets = useMemo(
    () => bets.filter((bet) => activeTab === 'open'
      ? ['open', 'claim_pending'].includes(bet.status)
      : ['closed', 'cancelled'].includes(bet.status)),
    [activeTab, bets],
  );

  const updateDraftOption = (index, value) => {
    setDraft((previous) => ({
      ...previous,
      options: previous.options.map((option, optionIndex) => optionIndex === index ? value : option),
    }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const options = draft.options.map((option) => option.trim()).filter(Boolean);
    const wagerLabel = draft.wagerLabel === 'custom' ? draft.customWager.trim() : draft.wagerLabel;

    try {
      const response = await fetchWithUserSession(`${API_URL}/events/${eventId}/prop-pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: draft.question,
          response_type: draft.responseType,
          options: draft.responseType === 'options' ? options : [],
          wager_label: wagerLabel,
        }),
      });
      if (!response.ok) await throwResponseError(response, 'Failed to create Prop Pix');
      await response.json();
      setDraft(EMPTY_DRAFT);
      setComposerOpen(false);
      setActiveTab('open');
      setMessage('Prop Pix created.');
      await loadBets();
    } catch (createError) {
      setError(createError.message || 'Failed to create Prop Pix');
    }
  };

  const handleVote = async (bet) => {
    const voteDraft = voteDrafts[bet.id] || {};
    setError('');
    setMessage('');
    try {
      const response = await fetchWithUserSession(`${API_URL}/prop-pix/${bet.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          option_id: bet.response_type === 'options' ? voteDraft.optionId : null,
          response_text: bet.response_type === 'manual' ? voteDraft.responseText : null,
        }),
      });
      if (!response.ok) await throwResponseError(response, 'Failed to save your Prop Pix vote');
      await response.json();
      setMessage('Vote saved.');
      await loadBets();
    } catch (voteError) {
      setError(voteError.message || 'Failed to save your Prop Pix vote');
    }
  };

  const handleClaim = async (bet) => {
    const outcome = getClaimOutcome(bet, claimDrafts[bet.id]);
    setError('');
    setMessage('');
    try {
      const response = await fetchWithUserSession(`${API_URL}/prop-pix/${bet.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome_text: outcome }),
      });
      if (!response.ok) await throwResponseError(response, 'Failed to submit the claim');
      await response.json();
      setClaimOpen(null);
      setClaimDrafts((previous) => ({ ...previous, [bet.id]: { optionId: '', customOutcome: '' } }));
      setMessage('Claim submitted. Waiting for another voter to confirm it.');
      await loadBets();
    } catch (claimError) {
      setError(claimError.message || 'Failed to submit the claim');
    }
  };

  const handleConfirm = async (bet, claim) => {
    setError('');
    setMessage('');
    try {
      const response = await fetchWithUserSession(`${API_URL}/prop-pix/${bet.id}/claim/${claim.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) await throwResponseError(response, 'Failed to confirm the claim');
      await response.json();
      setMessage('Prop Pix closed and participants were notified.');
      await loadBets();
    } catch (confirmError) {
      setError(confirmError.message || 'Failed to confirm the claim');
    }
  };

  const handleAdminClose = async (bet, claim) => {
    setError('');
    setMessage('');
    try {
      const response = await fetchWithAdminSession(`${API_URL}/admin/prop-pix/${bet.id}/claim/${claim.id}/close`, {
        method: 'POST',
      });
      if (!response.ok) await throwResponseError(response, 'Failed to close the Prop Pix as admin');
      await response.json();
      setMessage('Prop Pix closed by admin and participants were notified.');
      await loadBets();
    } catch (adminCloseError) {
      setError(adminCloseError.message || 'Failed to close the Prop Pix as admin');
    }
  };

  const handleCancel = async (bet) => {
    setError('');
    try {
      const response = await fetchWithUserSession(`${API_URL}/prop-pix/${bet.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) await throwResponseError(response, 'Failed to cancel the Prop Pix');
      await response.json();
      setMessage('Prop Pix cancelled.');
      await loadBets();
    } catch (cancelError) {
      setError(cancelError.message || 'Failed to cancel the Prop Pix');
    }
  };

  if (!eventId) return null;

  return (
    <div className="prop-pix-container">
      <div className="prop-pix-header">
        <div>
          <p className="prop-pix-eyebrow">Just for fun</p>
          <h2 className="prop-pix-title">Prop Pix</h2>
          <p className="prop-pix-subtitle">Side bets for the event. No points, just bragging rights and consequences.</p>
        </div>
        <button className="prop-pix-create-button" type="button" onClick={() => setComposerOpen((open) => !open)}>
          {composerOpen ? 'Close' : '+ Create bet'}
        </button>
      </div>

      {composerOpen && (
        <form className="prop-pix-composer" onSubmit={handleCreate}>
          <div className="prop-pix-form-grid">
            <label>
              <span>What are we betting on?</span>
              <input value={draft.question} onChange={(event) => setDraft((previous) => ({ ...previous, question: event.target.value }))} placeholder="Who will arrive first?" maxLength={240} required />
            </label>
            <label>
              <span>Wager</span>
              <select value={draft.wagerLabel} onChange={(event) => setDraft((previous) => ({ ...previous, wagerLabel: event.target.value }))}>
                {WAGER_PRESETS.map((wager) => <option key={wager} value={wager}>{wager}</option>)}
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>

          {draft.wagerLabel === 'custom' && (
            <label>
              <span>Custom wager</span>
              <input value={draft.customWager} onChange={(event) => setDraft((previous) => ({ ...previous, customWager: event.target.value }))} placeholder="Loser buys tacos" maxLength={80} required />
            </label>
          )}

          <fieldset className="prop-pix-response-fieldset">
            <legend>How should friends answer?</legend>
            <div className="prop-pix-mode-toggle">
              <label><input type="radio" checked={draft.responseType === 'options'} onChange={() => setDraft((previous) => ({ ...previous, responseType: 'options' }))} /> Dropdown options</label>
              <label><input type="radio" checked={draft.responseType === 'manual'} onChange={() => setDraft((previous) => ({ ...previous, responseType: 'manual' }))} /> Manual entry</label>
            </div>
          </fieldset>

          {draft.responseType === 'options' && (
            <div className="prop-pix-options-editor">
              <div className="prop-pix-field-label">Options</div>
              {draft.options.map((option, index) => (
                <input key={index} value={option} onChange={(event) => updateDraftOption(index, event.target.value)} placeholder={`Option ${index + 1}`} maxLength={120} required />
              ))}
              {draft.options.length < 12 && <button className="prop-pix-secondary-button" type="button" onClick={() => setDraft((previous) => ({ ...previous, options: [...previous.options, ''] }))}>+ Add option</button>}
            </div>
          )}

          <button className="prop-pix-primary-button" type="submit">Create Prop Pix</button>
        </form>
      )}

      {(error || message) && <div className={`prop-pix-feedback ${error ? 'is-error' : ''}`} role="status">{error || message}</div>}

      <div className="prop-pix-tabs" role="tablist" aria-label="Prop Pix status">
        <button type="button" className={activeTab === 'open' ? 'is-active' : ''} onClick={() => setActiveTab('open')}>Open bets</button>
        <button type="button" className={activeTab === 'closed' ? 'is-active' : ''} onClick={() => setActiveTab('closed')}>Results</button>
      </div>

      {loading && <div className="prop-pix-empty">Loading Prop Pix...</div>}
      {!loading && visibleBets.length === 0 && <div className="prop-pix-empty">{activeTab === 'open' ? 'No open Prop Pix bets yet. Start one for the group.' : 'No closed Prop Pix results yet.'}</div>}

      <div className="prop-pix-list">
        {visibleBets.map((bet) => {
          const voteDraft = voteDrafts[bet.id] || {};
          const claimDraft = claimDrafts[bet.id] || {};
          const pendingClaim = bet.claims.find((claim) => claim.status === 'pending');
          const canConfirm = pendingClaim && bet.my_vote && String(pendingClaim.claimant_user_id) !== String(userId);
          const canClaim = bet.status === 'open' && bet.my_vote;
          const isCreator = String(bet.creator_user_id) === String(userId);

          return (
            <article className={`prop-pix-card prop-pix-card--${bet.status}`} key={bet.id}>
              <div className="prop-pix-card-topline"><span className="prop-pix-status">{bet.status === 'claim_pending' ? 'Claim pending' : bet.status}</span><span className="prop-pix-wager">{bet.wager_label}</span></div>
              <h3>{bet.question}</h3>
              <p className="prop-pix-creator">Started by {bet.creator_username} • {bet.participant_count} voter{bet.participant_count === 1 ? '' : 's'}</p>

              {bet.status === 'closed' && <div className="prop-pix-outcome"><span>Outcome</span><strong>{bet.outcome_text}</strong></div>}
              {bet.status === 'closed' && bet.my_result && (
                <div className={`prop-pix-result ${bet.my_result.is_correct ? 'is-correct' : 'is-owed'}`}>
                  <span>{bet.my_result.is_correct ? 'You won' : 'You owe'}</span>
                  <strong>{bet.my_result.is_correct ? 'Correct pick' : bet.my_result.wager_label}</strong>
                </div>
              )}
              {bet.status === 'cancelled' && <div className="prop-pix-outcome is-muted"><span>Outcome</span><strong>Cancelled</strong></div>}

              {bet.status === 'open' && !bet.my_vote && (
                <div className="prop-pix-vote-area">
                  {bet.response_type === 'options' ? (
                    <select value={voteDraft.optionId || ''} onChange={(event) => setVoteDrafts((previous) => ({ ...previous, [bet.id]: { ...voteDraft, optionId: event.target.value } }))}>
                      <option value="">Choose your answer</option>
                      {bet.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  ) : (
                    <input value={voteDraft.responseText || ''} onChange={(event) => setVoteDrafts((previous) => ({ ...previous, [bet.id]: { ...voteDraft, responseText: event.target.value } }))} placeholder="Your answer" maxLength={240} />
                  )}
                  <button className="prop-pix-primary-button" type="button" onClick={() => handleVote(bet)}>Vote</button>
                </div>
              )}

              {bet.my_vote && (
                <div className="prop-pix-vote-summary">
                  <span className="prop-pix-your-vote">Your pick: {getVoteLabel(bet, bet.my_vote)}. Vote locked.</span>
                  {bet.votes.length > 0 && (
                    <div className="prop-pix-voter-list">
                      <span className="prop-pix-voter-list-label">Votes</span>
                      <ul>
                        {bet.votes.map((vote) => (
                          <li key={vote.id}>
                            <strong>{vote.username}</strong>
                            <span>{getVoteLabel(bet, vote)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {bet.status === 'claim_pending' && pendingClaim && (
                <div className="prop-pix-claim-box">
                  <div><span>{pendingClaim.claimant_username} claims:</span> <strong>{pendingClaim.outcome_text}</strong></div>
                  {canConfirm && <button className="prop-pix-primary-button" type="button" onClick={() => handleConfirm(bet, pendingClaim)}>Agree and close bet</button>}
                  {canManageAdminActions && <button className="prop-pix-secondary-button" type="button" onClick={() => handleAdminClose(bet, pendingClaim)}>Admin close bet</button>}
                  {String(pendingClaim.claimant_user_id) === String(userId) && <small>Waiting for another voter to agree.</small>}
                </div>
              )}

              {canClaim && (
                <div className="prop-pix-claim-action">
                  {claimOpen === bet.id ? (
                    <div className="prop-pix-claim-editor">
                      {bet.response_type === 'options' ? (
                        <>
                          <select
                            value={claimDraft.optionId || ''}
                            onChange={(event) => setClaimDrafts((previous) => ({
                              ...previous,
                              [bet.id]: { ...claimDraft, optionId: event.target.value },
                            }))}
                          >
                            <option value="">Select the outcome</option>
                            {bet.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                            <option value="other">Other</option>
                          </select>
                          {claimDraft.optionId === 'other' && (
                            <input
                              value={claimDraft.customOutcome || ''}
                              onChange={(event) => setClaimDrafts((previous) => ({
                                ...previous,
                                [bet.id]: { ...claimDraft, customOutcome: event.target.value },
                              }))}
                              placeholder="Enter the outcome"
                              maxLength={240}
                            />
                          )}
                        </>
                      ) : (
                        <input
                          value={claimDraft.customOutcome || ''}
                          onChange={(event) => setClaimDrafts((previous) => ({
                            ...previous,
                            [bet.id]: { ...claimDraft, customOutcome: event.target.value },
                          }))}
                          placeholder="What happened?"
                          maxLength={240}
                        />
                      )}
                      <button className="prop-pix-primary-button" type="button" onClick={() => handleClaim(bet)}>Submit claim</button>
                      <button className="prop-pix-link-button" type="button" onClick={() => setClaimOpen(null)}>Cancel</button>
                    </div>
                  ) : <button className="prop-pix-link-button" type="button" onClick={() => setClaimOpen(bet.id)}>Report the outcome</button>}
                </div>
              )}

              {isCreator && ['open', 'claim_pending'].includes(bet.status) && <button className="prop-pix-cancel-button" type="button" onClick={() => handleCancel(bet)}>Cancel bet</button>}
              <div className="prop-pix-card-footer"><span>{formatTimestamp(bet.closed_at || bet.created_at)}</span>{bet.my_vote && <span className="prop-pix-voted-mark">Voted</span>}</div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default PropPix;
