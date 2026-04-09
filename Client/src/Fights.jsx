import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { API_URL } from './config';
import { cachedFetchJson, invalidateCache } from './utils/apiCache';
import { fetchWithAdminSession, hasActiveAdminSession } from './utils/adminSession';
import ReactCountryFlag from 'react-country-flag';
import { getCountryCode, convertInchesToHeightString, formatStreak } from './utils/countryUtils';
import './Fights.css';
import PlayerCard from './components/PlayerCard';
import VoteCard from './components/VoteCard';

const toggleButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 2px',
  borderRadius: '0',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(255, 255, 255, 0.24)',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  transition: 'color 0.2s ease, border-color 0.2s ease, transform 0.2s ease, opacity 0.2s ease',
  marginBottom: '10px',
  width: 'auto',
  margin: '0 auto 18px auto',
  opacity: 0.74
};

const REMINDER_TYPE_BROKEN_HEART = 'broken_heart';
const REMINDER_TYPE_HEART_EYES = 'heart_eyes';
const REMINDER_EMOJI_MAP = {
  [REMINDER_TYPE_BROKEN_HEART]: '💔',
  [REMINDER_TYPE_HEART_EYES]: '😍'
};

const BROKEN_HEART_MESSAGES = [
  "We'll remind you to never vote for this fool again.",
  "We'll remind you this dude did you dirty.",
  "We'll remind you this clown wrecked your picks.",
  "We'll remind you this fighter sold your night.",
  "We'll remind you this one broke your heart before.",
  "We'll remind you this pick brought pure pain.",
  "We'll remind you this man burned your trust.",
  "We'll remind you this fighter had you sick.",
  "We'll remind you this dude fumbled your ticket.",
  "We'll remind you to keep this one in timeout."
];

const HEART_EYES_MESSAGES = [
  "We'll remember you would suck this dude's dick.",
  "We'll remember this is your king.",
  "We'll remember you never doubt this savage.",
  "We'll remember this fighter is your golden boy.",
  "We'll remember this is your ride-or-die pick.",
  "We'll remember you think this motherfucker throws down.",
  "We'll remember this dude is your favorite menace.",
  "We'll remember this fighter is your lock.",
  "We'll remember you believe this one is built different.",
  "We'll remember this is your certified killer."
];

const FINISH_METHOD_BREAKDOWN = [
  {
    label: 'KO/TKO',
    winsKey: 'ko_tko_wins',
    lossesKey: 'ko_tko_losses',
    color: 'rgba(251, 146, 60, 0.96)'
  },
  {
    label: 'Submission',
    winsKey: 'submission_wins',
    lossesKey: 'submission_losses',
    color: 'rgba(56, 189, 248, 0.96)'
  },
  {
    label: 'Decision',
    winsKey: 'decision_wins',
    lossesKey: 'decision_losses',
    color: 'rgba(192, 132, 252, 0.96)'
  }
];

function parseMethodCount(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
}

function parseRecordTotals(record) {
  const match = String(record || '').match(/(\d+)\s*-\s*(\d+)/);

  return {
    wins: match ? Number(match[1]) : 0,
    losses: match ? Number(match[2]) : 0
  };
}

function hasMethodValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function getMethodWidth(count, total) {
  if (!total || count <= 0) {
    return 0;
  }

  return Math.min((count / total) * 100, 100);
}

function getMethodPercentLabel(count, total) {
  if (!total) {
    return '--';
  }

  return `${Math.round((count / total) * 100)}%`;
}

function getMethodChartBackground(rows, totalFights) {
  if (!totalFights) {
    return 'conic-gradient(from -90deg, rgba(255, 255, 255, 0.16) 0deg 360deg)';
  }

  let currentAngle = 0;
  const segments = rows
    .map((row) => {
      const totalByMethod = row.wins + row.losses;

      if (!totalByMethod) {
        return null;
      }

      const startAngle = currentAngle;
      currentAngle += (totalByMethod / totalFights) * 360;

      return `${row.color} ${startAngle}deg ${currentAngle}deg`;
    })
    .filter(Boolean);

  if (segments.length === 0) {
    return 'conic-gradient(from -90deg, rgba(255, 255, 255, 0.16) 0deg 360deg)';
  }

  return `conic-gradient(from -90deg, ${segments.join(', ')})`;
}

function getFightFormatDetails(fight) {
  const details = [];

  if (typeof fight?.title_fight_name === 'string' && fight.title_fight_name.trim()) {
    details.push(fight.title_fight_name.trim());
  } else if (fight?.is_title_fight) {
    details.push('Title Fight');
  }

  const scheduledRounds = Number(fight?.scheduled_rounds);
  if (Number.isFinite(scheduledRounds) && scheduledRounds > 0) {
    details.push(`${scheduledRounds} ${scheduledRounds === 1 ? 'Round' : 'Rounds'}`);
  }

  return details.join(' • ');
}

function FinishMethodBreakdown({ fight, fighterKey }) {
  const recordTotals = parseRecordTotals(fight?.[`${fighterKey}_record`]);
  const hasAnyMethodData = FINISH_METHOD_BREAKDOWN.some(({ winsKey, lossesKey }) => (
    hasMethodValue(fight?.[`${fighterKey}_${winsKey}`]) ||
    hasMethodValue(fight?.[`${fighterKey}_${lossesKey}`])
  ));

  if (!hasAnyMethodData) {
    return (
      <div className="finish-method-breakdown finish-method-breakdown--empty">
        <div className="finish-method-breakdown-header">
          <span className="finish-method-breakdown-title">Method Breakdown</span>
          <span className="finish-method-breakdown-empty-copy">Unavailable</span>
        </div>
      </div>
    );
  }

  const rows = FINISH_METHOD_BREAKDOWN.map(({ label, winsKey, lossesKey, color }) => ({
    label,
    wins: parseMethodCount(fight?.[`${fighterKey}_${winsKey}`]),
    losses: parseMethodCount(fight?.[`${fighterKey}_${lossesKey}`]),
    color
  }));

  const fallbackWins = rows.reduce((total, row) => total + row.wins, 0);
  const fallbackLosses = rows.reduce((total, row) => total + row.losses, 0);
  const totalWins = recordTotals.wins || fallbackWins;
  const totalLosses = recordTotals.losses || fallbackLosses;
  const totalFights = totalWins + totalLosses;
  const chartBackground = getMethodChartBackground(rows, totalFights);

  return (
    <div className="finish-method-breakdown">
      <div className="finish-method-breakdown-header">
        <span className="finish-method-breakdown-title">Method Breakdown</span>
        <span className="finish-method-breakdown-summary">
          {totalWins}W • {totalLosses}L
        </span>
      </div>
      <div className="finish-method-chart-panel">
        <div
          className="finish-method-chart"
          role="img"
          aria-label={`Fight endings: ${rows.map((row) => `${row.label} ${row.wins + row.losses}`).join(', ')}`}
          style={{ background: chartBackground }}
        >
          <div className="finish-method-chart-center">
            <span className="finish-method-chart-total">{totalFights}</span>
            <span className="finish-method-chart-caption">Fights</span>
          </div>
        </div>
        <div className="finish-method-chart-legend">
          {rows.map((row) => {
            const totalByMethod = row.wins + row.losses;

            return (
              <div key={row.label} className="finish-method-chart-legend-item">
                <span
                  className="finish-method-chart-legend-swatch"
                  aria-hidden="true"
                  style={{ backgroundColor: row.color }}
                />
                <span className="finish-method-chart-legend-label">{row.label}</span>
                <span className="finish-method-chart-legend-value">
                  {totalByMethod} • {getMethodPercentLabel(totalByMethod, totalFights)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="finish-method-breakdown-list">
        {rows.map((row) => {
          const winWidth = getMethodWidth(row.wins, totalWins);
          const lossWidth = getMethodWidth(row.losses, totalLosses);

          return (
            <div
              key={row.label}
              className="finish-method-row"
              aria-label={`${row.label}: ${row.wins} wins and ${row.losses} losses by this method`}
            >
              <div className="finish-method-row-top">
                <span className="finish-method-name">{row.label}</span>
                <span className="finish-method-counts">{row.wins}W • {row.losses}L</span>
              </div>
              <div className="finish-method-lanes">
                <div className="finish-method-lane">
                  <span className="finish-method-lane-label finish-method-lane-label--win">W</span>
                  <div className="finish-method-track" aria-hidden="true">
                    <div
                      className="finish-method-fill finish-method-fill--win"
                      style={{ width: `${winWidth}%` }}
                    />
                  </div>
                  <span className="finish-method-percent">{getMethodPercentLabel(row.wins, totalWins)}</span>
                </div>
                <div className="finish-method-lane">
                  <span className="finish-method-lane-label finish-method-lane-label--loss">L</span>
                  <div className="finish-method-track" aria-hidden="true">
                    <div
                      className="finish-method-fill finish-method-fill--loss"
                      style={{ width: `${lossWidth}%` }}
                    />
                  </div>
                  <span className="finish-method-percent">{getMethodPercentLabel(row.losses, totalLosses)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Fights({ eventId, username, user_id, user_type, onLeaderboardRefresh, refreshToken = 0 }) {
  const currentSeasonYear = new Date().getFullYear();
  const canManageAdminActions = user_type === 'admin' && hasActiveAdminSession();
  const reminderStorageKey = `voteReminders_${user_id || username || 'guest'}`;
  const normalizeReminderMap = useCallback((rows) => {
    if (!Array.isArray(rows)) {
      return {};
    }

    return rows.reduce((acc, row) => {
      if (row?.fighter_id === undefined || row?.fighter_id === null) {
        return acc;
      }

      acc[String(row.fighter_id)] = {
        fighterName: row.fighter_name || '',
        reminderType: row.reminder_type || REMINDER_TYPE_BROKEN_HEART,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
      };
      return acc;
    }, {});
  }, []);
  const [fights, setFights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openRankTooltipId, setOpenRankTooltipId] = useState(null);
  const [selectedFights, setSelectedFights] = useState(() => {
    // Initialize from localStorage if available
    const saved = localStorage.getItem(`selectedFights_${eventId}_${username}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [submittedFights, setSubmittedFights] = useState(() => {
    // Initialize from localStorage if available, will be updated with API data
    const saved = localStorage.getItem(`submittedFights_${eventId}_${username}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [voteErrors, setVoteErrors] = useState({});
  const [expandedFights, setExpandedFights] = useState({});
  const [fightVotes, setFightVotes] = useState({});
  const [voteCounts, setVoteCounts] = useState({}); // Store vote counts (total + human) for button ratio
  const [, setFadeOutMessages] = useState({});
  const [showAIVotes, setShowAIVotes] = useState(false);
  const [expandedFightStats, setExpandedFightStats] = useState({});
  const [expandedAdminControls, setExpandedAdminControls] = useState({});
  const [editingFight, setEditingFight] = useState(null);
  const [predictionHistory, setPredictionHistory] = useState([]);
  const [rivalryMarkers, setRivalryMarkers] = useState({ pickTwinUserId: null, nemesisUserId: null });
  const [voteReminders, setVoteReminders] = useState(() => {
    const saved = localStorage.getItem(reminderStorageKey);
    return saved ? JSON.parse(saved) : {};
  });

  const invalidateLeaderboardCaches = useCallback((targetEventId) => {
    const cacheKeys = [
      `${API_URL}/leaderboard`,
      `${API_URL}/leaderboard/season`,
      `${API_URL}/leaderboard/2025`
    ];

    if (targetEventId) {
      cacheKeys.push(`${API_URL}/events/${targetEventId}/leaderboard`);
    }

    cacheKeys.forEach((key) => invalidateCache(key));
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (event.target.closest('.rank-tooltip-wrap')) {
        return;
      }
      setOpenRankTooltipId(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenRankTooltipId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const renderFighterRank = (rank, tooltipId) => {
    if (rank === 0) {
      return <span className="champion-rank">C</span>;
    }

    if (!rank) {
      return 'NR';
    }

    const numericRank = Number(rank);
    const isUnofficialRank = Number.isFinite(numericRank) && numericRank > 15;
    const isTooltipOpen = openRankTooltipId === tooltipId;

    return (
      <span className="fighter-rank-value">
        <span>{rank}</span>
        {isUnofficialRank && (
          <span
            className={`rank-tooltip-wrap ${isTooltipOpen ? 'is-open' : ''}`}
            onMouseEnter={() => setOpenRankTooltipId(tooltipId)}
            onMouseLeave={() => setOpenRankTooltipId((prev) => (prev === tooltipId ? null : prev))}
          >
            <span
              role="button"
              tabIndex={0}
              className="rank-tooltip-trigger"
              aria-label="Unofficial rank by Tapology"
              aria-expanded={isTooltipOpen ? 'true' : 'false'}
              onClick={(event) => {
                event.stopPropagation();
                setOpenRankTooltipId((prev) => (prev === tooltipId ? null : tooltipId));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpenRankTooltipId((prev) => (prev === tooltipId ? null : tooltipId));
                }
              }}
            >
              *
            </span>
            <span className="rank-tooltip" role="tooltip">
              Unofficial rank by Tapology
            </span>
          </span>
        )}
      </span>
    );
  };

  // Admin function to handle fight result updates
  const handleResultUpdate = async (fightId, winner) => {
    try {
      const response = await fetchWithAdminSession(`${API_URL}/ufc_full_fight_card/${fightId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ winner }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error('Failed to update fight result');
      }

      const updatedFight = await response.json();

      // Find the existing fight to merge missing fields
      const existingFight = fights.find(fight => fight.id === fightId);

      // Merge while preserving existing values when updated ones are null/undefined
      const mergedFight = { ...existingFight };
      Object.keys(updatedFight).forEach(key => {
        const val = updatedFight[key];
        if (val !== null && val !== undefined) {
          mergedFight[key] = val;
        }
      });

      setFights(fights.map(fight => 
        fight.id === fightId ? mergedFight : fight
      ));
      invalidateLeaderboardCaches(mergedFight.event_id || eventId);
      onLeaderboardRefresh?.();
      setEditingFight(null);
    } catch (err) {
      console.error('Error updating fight result:', err);
      setError('Failed to update fight result');
    }
  };

  // Admin function to handle fight cancellation
  const handleFightCancel = async (fightId) => {
    if (!fightId) {
      setError('No fight ID provided');
      return;
    }

    try {
      const response = await fetchWithAdminSession(`${API_URL}/ufc_full_fight_card/${fightId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fight cancel error:', response.status, errorText);
        throw new Error(`Failed to cancel fight: ${response.status}`);
      }

      const updatedFight = await response.json();
      
      // Update local state with the complete updated fight data
      setFights(fights.map(fight => 
        fight.id === fightId ? updatedFight : fight
      ));
      invalidateLeaderboardCaches(updatedFight.event_id || eventId);
      onLeaderboardRefresh?.();
      setEditingFight(null);
      
      // Show success message
      setError('Fight canceled successfully!');
      setTimeout(() => setError(''), 3000);
      
    } catch (err) {
      console.error('Error canceling fight:', err);
      setError(`Failed to cancel fight: ${err.message}`);
    }
  };

  // Fetch both fights and predictions when component mounts or eventId/user_id changes
  useEffect(() => {
    if (eventId && user_id) {
      Promise.all([
        // Fetch fights
        fetch(`${API_URL}/events/${eventId}/fights`),
        // Fetch user prediction history with fight outcomes
        fetch(`${API_URL}/predictions/history?user_id=${encodeURIComponent(user_id)}`)
      ])
        .then(async ([fightsResponse, predictionHistoryResponse]) => {
          if (!fightsResponse.ok) throw new Error('Failed to fetch fights');
          if (!predictionHistoryResponse.ok) throw new Error('Failed to fetch prediction history');

          const [fightsData, predictionHistoryData] = await Promise.all([
            fightsResponse.json(),
            predictionHistoryResponse.json()
          ]);

          // Create a map of fight ID to selected fighter
          const submittedVotes = {};
          predictionHistoryData.forEach(pred => {
            submittedVotes[pred.fight_id] = String(pred.fighter_id); // Ensure fighter_id is stored as string
          });

          const fightsWithStringIds = fightsData.map(fight => ({
            ...fight,
            fighter1_id: String(fight.fighter1_id), // Ensure fighter IDs are strings
            fighter2_id: String(fight.fighter2_id)
          }));

          setFights(fightsWithStringIds);
          setSubmittedFights(submittedVotes);
          setPredictionHistory(Array.isArray(predictionHistoryData) ? predictionHistoryData : []);
          setLoading(false);
        })
        .catch(err => {
          console.error('Error fetching data:', err);
          setError('Failed to load fights and predictions');
          setPredictionHistory([]);
          setLoading(false);
        });
    }
  }, [eventId, user_id, refreshToken]);

  useEffect(() => {
    let cancelled = false;
    const loadRivalries = async () => {
      if (!user_id) {
        setRivalryMarkers({ pickTwinUserId: null, nemesisUserId: null });
        return;
      }
      try {
        const highlights = await cachedFetchJson(
          `${API_URL}/user/${encodeURIComponent(user_id)}/highlights/${currentSeasonYear}`,
          { ttlMs: 120000, cacheKey: `rivalry-markers:${user_id}:${currentSeasonYear}` }
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
  }, [user_id, currentSeasonYear]);

  useEffect(() => {
    let cancelled = false;
    const saved = localStorage.getItem(reminderStorageKey);
    const localReminders = saved ? JSON.parse(saved) : {};
    setVoteReminders(localReminders);

    const loadReminderState = async () => {
      if (!user_id) {
        return;
      }

      try {
        const response = await fetch(`${API_URL}/user/${encodeURIComponent(user_id)}/vote-reminders`);
        if (!response.ok) {
          throw new Error('Failed to fetch vote reminders');
        }

        const reminderRows = await response.json();
        if (cancelled) {
          return;
        }

        const normalizedReminders = normalizeReminderMap(reminderRows);
        setVoteReminders(normalizedReminders);
        localStorage.setItem(reminderStorageKey, JSON.stringify(normalizedReminders));
      } catch (err) {
        console.error('Error loading vote reminders:', err);
      }
    };

    loadReminderState();

    return () => {
      cancelled = true;
    };
  }, [normalizeReminderMap, reminderStorageKey, user_id]);

  // Save selectedFights to localStorage whenever it changes
  useEffect(() => {
    if (eventId && username) {
      localStorage.setItem(`selectedFights_${eventId}_${username}`, JSON.stringify(selectedFights));
    }
  }, [selectedFights, eventId, username]);

  // Save submittedFights to localStorage whenever it changes
  useEffect(() => {
    if (eventId && username) {
      localStorage.setItem(`submittedFights_${eventId}_${username}`, JSON.stringify(submittedFights));
    }
  }, [submittedFights, eventId, username]);

  useEffect(() => {
    localStorage.setItem(reminderStorageKey, JSON.stringify(voteReminders));
  }, [voteReminders, reminderStorageKey]);

  // Clear both selected and submitted fights when username or eventId changes
  useEffect(() => {
    setSelectedFights({});
    setSubmittedFights({});
    localStorage.removeItem(`selectedFights_${eventId}_${username}`);
    localStorage.removeItem(`submittedFights_${eventId}_${username}`);
  }, [username, eventId]);

  const fetchEventVoteCounts = useCallback(async () => {
    if (!eventId) return;
    try {
      const data = await cachedFetchJson(`${API_URL}/events/${eventId}/vote-counts`, { ttlMs: 30000 });
      const mappedCounts = {};
      fights.forEach(fight => {
        const fightKey = String(fight.id);
        const fighterMap = data[fightKey] || {};
        const fighter1Counts = fighterMap[String(fight.fighter1_id)] || { total: 0, human: 0 };
        const fighter2Counts = fighterMap[String(fight.fighter2_id)] || { total: 0, human: 0 };
        mappedCounts[fightKey] = {
          fighter1: fighter1Counts,
          fighter2: fighter2Counts
        };
      });
      setVoteCounts(mappedCounts);
    } catch (err) {
      console.error('Error fetching event vote counts:', err);
    }
  }, [eventId, fights]);

  useEffect(() => {
    if (eventId && fights.length > 0) {
      fetchEventVoteCounts();
    }
  }, [eventId, fights, fetchEventVoteCounts]);

  // Function to handle selection (but not submission) of a fighter
  const handleSelection = (fightId, fighterId, fighterName) => {
    // Only allow selection if vote hasn't been submitted and fight isn't completed
    if (submittedFights[fightId] || fights.find(f => f.id === fightId)?.is_completed) return;

    const reminder = voteReminders[String(fighterId)];
    const reminderType = reminder?.reminderType || REMINDER_TYPE_BROKEN_HEART;
    if (reminder && reminderType === REMINDER_TYPE_BROKEN_HEART) {
      const shouldContinue = window.confirm(
        `Reminder: you asked not to vote for ${fighterName} again.\n\nSelect ${fighterName} anyway?`
      );
      if (!shouldContinue) {
        setVoteErrors(prev => ({
          ...prev,
          [fightId]: `Reminder active: you asked not to vote for ${fighterName} again.`
        }));
        return;
      }
    }

    setVoteErrors(prev => ({ ...prev, [fightId]: '' }));
    setSelectedFights(prev => ({ ...prev, [fightId]: fighterId }));
  };

  // Function to handle message fade out
  const handleMessageFadeOut = (fightId) => {
    setTimeout(() => {
      setFadeOutMessages(prev => ({ ...prev, [fightId]: true }));
      // Remove the message completely after animation
      setTimeout(() => {
        setFadeOutMessages(prev => {
          const newState = { ...prev };
          delete newState[fightId];
          return newState;
        });
      }, 500); // Match this with the CSS animation duration
    }, 3000); // Show message for 3 seconds before starting fade
  };

  // Function to submit the selected vote for a fight
  const handleSubmitVote = async (fightId) => {
    if (!user_id) {
      setVoteErrors(prev => ({ ...prev, [fightId]: 'Please log in to vote' }));
      return;
    }

    const selectedFighter = selectedFights[fightId];
    if (!selectedFighter) {
      setVoteErrors(prev => ({ ...prev, [fightId]: 'No fighter selected' }));
      return;
    }

    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id,
          username,
          fightId,
          fighter_id: selectedFighter,
          selected_fighter: selectedFighter,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        console.error('Server error on vote submission:', errorData);
        setVoteErrors(prev => ({ ...prev, [fightId]: `Server error: ${errorData.error || 'Failed to submit vote'}` }));
        return;
      }

      // Mark this fight's vote as submitted
      setSubmittedFights(prev => ({ ...prev, [fightId]: selectedFighter }));
      
      // Clear any previous vote error for this fight
      setVoteErrors(prev => ({ ...prev, [fightId]: '' }));
      
      // Start fade out timer for the submission message
      handleMessageFadeOut(fightId);
      
      // Clear the selection state for this fight
      setSelectedFights(prev => {
        const newState = { ...prev };
        delete newState[fightId];
        return newState;
      });

      // Optimistically update vote counts immediately for instant UI feedback
      const fightKey = String(fightId);
      const fight = fights.find(f => String(f.id) === fightKey);
      if (fight) {
        setVoteCounts(prev => {
          const current = prev[fightKey] || {
            fighter1: { total: 0, human: 0 },
            fighter2: { total: 0, human: 0 }
          };
          const isFighter1 = String(selectedFighter) === String(fight.fighter1_id);
          const targetKey = isFighter1 ? 'fighter1' : 'fighter2';
          return {
            ...prev,
            [fightKey]: {
              ...current,
              [targetKey]: {
                total: current[targetKey].total + 1,
                human: current[targetKey].human + 1
              }
            }
          };
        });
      }

      // Refresh event counts after a short delay to ensure API has processed the vote
      setTimeout(() => {
        fetchEventVoteCounts();
      }, 500);

      // Refresh the votes display if the fight is expanded
      if (expandedFights[fightId]) {
        const fight = fights.find(f => f.id === fightId);
        if (fight) {
          const [fighter1Response, fighter2Response] = await Promise.all([
            fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter1_id)}`),
            fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter2_id)}`)
          ]);

          const [fighter1Votes, fighter2Votes] = await Promise.all([
            fighter1Response.json(),
            fighter2Response.json()
          ]);

          setFightVotes(prev => ({
            ...prev,
            [fightId]: {
              fighter1Votes,
              fighter2Votes
            }
          }));

          // Update vote counts from the fetched data
          const fighter1Human = fighter1Votes.filter(vote => !vote.is_bot).length;
          const fighter2Human = fighter2Votes.filter(vote => !vote.is_bot).length;
          setVoteCounts(prev => ({
            ...prev,
            [fightId]: {
              fighter1: { total: fighter1Votes.length, human: fighter1Human },
              fighter2: { total: fighter2Votes.length, human: fighter2Human }
            }
          }));
        }
      }
    } catch (err) {
      console.error('Error submitting prediction:', err);
      setVoteErrors(prev => ({ ...prev, [fightId]: `Failed to submit prediction: ${err.message}` }));
    }
  };

  const toggleFightExpansion = async (fightId) => {
    const fight = fights.find(f => f.id === fightId);
    if (!fight) return;

    // Only allow expansion if user has voted or fight is completed
    if (!submittedFights[fightId] && !fight.is_completed) {
      setError(`You must vote on this fight to see other predictions`);
      return;
    }

    setExpandedFights(prev => {
      const newState = { ...prev };
      if (newState[fightId]) {
        delete newState[fightId];
      } else {
        newState[fightId] = true;
      }
      return newState;
    });

    // Fetch votes if expanding and we don't have them yet
    if (!expandedFights[fightId] && !fightVotes[fightId]) {
      try {
        const [fighter1Response, fighter2Response] = await Promise.all([
          fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter1_id)}`),
          fetch(`${API_URL}/predictions/filter?fight_id=${fightId}&fighter_id=${encodeURIComponent(fight.fighter2_id)}`)
        ]);

        if (!fighter1Response.ok) {
          console.error('Fighter 1 response error:', await fighter1Response.text());
          throw new Error('Failed to fetch votes for fighter 1');
        }
        if (!fighter2Response.ok) {
          console.error('Fighter 2 response error:', await fighter2Response.text());
          throw new Error('Failed to fetch votes for fighter 2');
        }

        const [fighter1Votes, fighter2Votes] = await Promise.all([
          fighter1Response.json(),
          fighter2Response.json()
        ]);

        setFightVotes(prev => ({
          ...prev,
          [fightId]: {
            fighter1Votes,
            fighter2Votes
          }
        }));

        // Update vote counts from the fetched data
        const fighter1Human = fighter1Votes.filter(vote => !vote.is_bot).length;
        const fighter2Human = fighter2Votes.filter(vote => !vote.is_bot).length;
        setVoteCounts(prev => ({
          ...prev,
          [fightId]: {
            fighter1: { total: fighter1Votes.length, human: fighter1Human },
            fighter2: { total: fighter2Votes.length, human: fighter2Human }
          }
        }));
      } catch (err) {
        console.error('Error fetching votes:', err);
        setError('Failed to load votes');
      }
    }
  };

  const toggleFightStats = (fightId, e) => {
    if (e) {
      e.stopPropagation();
    }
    setExpandedFightStats(prev => ({
      ...prev,
      [fightId]: !prev[fightId]
    }));
  };

  const toggleAdminControls = (fightId, e) => {
    if (e) {
      e.stopPropagation();
    }
    setExpandedAdminControls(prev => ({
      ...prev,
      [fightId]: !prev[fightId]
    }));
  };

  // Dynamic toggle button style based on showAIVotes state
  const dynamicToggleStyle = useMemo(() => ({
    ...toggleButtonStyle,
    color: showAIVotes ? 'rgba(147, 197, 253, 0.92)' : 'rgba(255, 255, 255, 0.68)',
    borderBottom: `1px solid ${showAIVotes ? 'rgba(147, 197, 253, 0.58)' : 'rgba(255, 255, 255, 0.28)'}`,
    opacity: showAIVotes ? 0.95 : 0.74
  }), [showAIVotes]);

  const completedHistoryByFighter = useMemo(() => {
    const historyMap = new Map();
    predictionHistory.forEach(entry => {
      if (typeof entry.fighter_won !== 'boolean') {
        return;
      }
      const fighterId = String(entry.fighter_id);
      const parsedEventTimestamp = entry.event_date ? Date.parse(entry.event_date) : Number.NEGATIVE_INFINITY;
      const eventTimestamp = Number.isFinite(parsedEventTimestamp) ? parsedEventTimestamp : Number.NEGATIVE_INFINITY;
      const historyEntry = {
        fightId: String(entry.fight_id),
        fightIdNumeric: Number.isFinite(Number(entry.fight_id)) ? Number(entry.fight_id) : Number.NEGATIVE_INFINITY,
        fighterWon: entry.fighter_won,
        eventTimestamp,
      };
      if (!historyMap.has(fighterId)) {
        historyMap.set(fighterId, [historyEntry]);
      } else {
        historyMap.get(fighterId).push(historyEntry);
      }
    });

    historyMap.forEach(entries => {
      entries.sort((a, b) => {
        if (b.eventTimestamp !== a.eventTimestamp) {
          return b.eventTimestamp - a.eventTimestamp;
        }
        return b.fightIdNumeric - a.fightIdNumeric;
      });
    });
    return historyMap;
  }, [predictionHistory]);

  const getLastVoteOutcomeForFighter = useCallback((fight, fighterId) => {
    const fighterHistory = completedHistoryByFighter.get(String(fighterId));
    if (!fighterHistory || fighterHistory.length === 0) {
      return null;
    }

    const currentFightId = String(fight.id);
    const currentEventTimestamp = fight.event_date ? Date.parse(fight.event_date) : Number.POSITIVE_INFINITY;

    for (const entry of fighterHistory) {
      if (entry.fightId === currentFightId) {
        continue;
      }

      if (Number.isFinite(currentEventTimestamp) && Number.isFinite(entry.eventTimestamp) && entry.eventTimestamp >= currentEventTimestamp) {
        continue;
      }

      return entry.fighterWon ? 'won' : 'lost';
    }

    return null;
  }, [completedHistoryByFighter]);

  const setVoteReminderType = useCallback(async (fighterId, fighterName, reminderType) => {
    const fighterKey = String(fighterId);
    const previousReminders = voteReminders;
    const nextReminders = {
      ...previousReminders,
      [fighterKey]: {
        fighterName,
        reminderType,
        createdAt: previousReminders[fighterKey]?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };

    setVoteReminders(nextReminders);

    if (!user_id) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/user/${encodeURIComponent(user_id)}/vote-reminders/${encodeURIComponent(fighterId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fighter_name: fighterName,
            reminder_type: reminderType
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save reminder');
      }

      const savedReminder = await response.json();
      setVoteReminders(prev => ({
        ...prev,
        [fighterKey]: {
          fighterName: savedReminder?.fighter_name || fighterName,
          reminderType: savedReminder?.reminder_type || reminderType,
          createdAt: savedReminder?.created_at || prev[fighterKey]?.createdAt || null,
          updatedAt: savedReminder?.updated_at || prev[fighterKey]?.updatedAt || null
        }
      }));
    } catch (err) {
      console.error('Error updating vote reminder:', err);
      setVoteReminders(previousReminders);
      setError(err.message || 'Failed to update vote reminder');
    }
  }, [user_id, voteReminders]);

  const clearVoteReminder = useCallback(async (fighterId) => {
    const fighterKey = String(fighterId);
    const previousReminders = voteReminders;
    const nextReminders = { ...previousReminders };
    delete nextReminders[fighterKey];
    setVoteReminders(nextReminders);

    if (!user_id) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/user/${encodeURIComponent(user_id)}/vote-reminders/${encodeURIComponent(fighterId)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error('Failed to remove reminder');
      }
    } catch (err) {
      console.error('Error removing vote reminder:', err);
      setVoteReminders(previousReminders);
      setError(err.message || 'Failed to remove vote reminder');
    }
  }, [user_id, voteReminders]);

  const hasVoteReminder = useCallback((fighterId) => (
    Boolean(voteReminders[String(fighterId)])
  ), [voteReminders]);

  const getReminder = useCallback((fighterId) => (
    voteReminders[String(fighterId)] || null
  ), [voteReminders]);

  const getReminderType = useCallback((fighterId) => {
    const reminder = getReminder(fighterId);
    return reminder ? (reminder.reminderType || REMINDER_TYPE_BROKEN_HEART) : null;
  }, [getReminder]);

  const getReminderEmoji = useCallback((fighterId) => {
    const reminderType = getReminderType(fighterId);
    if (!reminderType) return null;
    return REMINDER_EMOJI_MAP[reminderType] || REMINDER_EMOJI_MAP[REMINDER_TYPE_BROKEN_HEART];
  }, [getReminderType]);

  const getReminderStatusMessage = useCallback((fighterId) => {
    const fighterKey = String(fighterId);
    const reminder = voteReminders[fighterKey];
    if (!reminder) {
      return null;
    }
    const reminderType = reminder.reminderType || REMINDER_TYPE_BROKEN_HEART;
    const messagePool = reminderType === REMINDER_TYPE_HEART_EYES
      ? HEART_EYES_MESSAGES
      : BROKEN_HEART_MESSAGES;
    const seed = `${fighterKey}:${reminder.updatedAt || reminder.createdAt || ''}`;
    const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return messagePool[hash % messagePool.length];
  }, [voteReminders]);

  const getVoteRivalryMarker = useCallback((vote) => {
    const voteUserId = vote?.user_id != null ? String(vote.user_id) : null;
    if (!voteUserId) return null;
    if (rivalryMarkers.pickTwinUserId && voteUserId === String(rivalryMarkers.pickTwinUserId)) {
      return 'twin';
    }
    if (rivalryMarkers.nemesisUserId && voteUserId === String(rivalryMarkers.nemesisUserId)) {
      return 'nemesis';
    }
    return null;
  }, [rivalryMarkers]);

  const eventVoteProgress = useMemo(() => {
    const trackableFights = fights.filter((fight) => !fight.is_canceled);
    const totalFights = trackableFights.length;

    if (totalFights === 0) {
      return null;
    }

    const submittedCount = trackableFights.reduce((count, fight) => (
      submittedFights[fight.id] ? count + 1 : count
    ), 0);
    const remainingOpenCount = trackableFights.reduce((count, fight) => (
      !submittedFights[fight.id] && !fight.is_completed ? count + 1 : count
    ), 0);

    if (remainingOpenCount === 0) {
      return null;
    }

    return {
      label: `${remainingOpenCount} ${remainingOpenCount === 1 ? 'vote' : 'votes'} left`,
      progress: `${submittedCount}/${totalFights} voted`
    };
  }, [fights, submittedFights]);

  if (loading) {
    return <div className="loading-message">Loading fights...</div>;
  }

  // Removed the global error return so that even if there's an error, we still render all fights.
  
  return (
    <>
      <svg className="title-fight-border-svg" style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter
            id="title-fight-border-filter"
            colorInterpolationFilters="sRGB"
            filterUnits="objectBoundingBox"
            x="0"
            y="0"
            width="1"
            height="1"
          >
            <feTurbulence
              type="turbulence"
              baseFrequency="0.032"
              numOctaves="3"
              stitchTiles="stitch"
              result="noise1"
              seed="1"
            />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
              <animate attributeName="dx" values="-72;72;-72" keyTimes="0;0.5;1" dur="3.4s" repeatCount="indefinite" calcMode="linear" />
              <animate attributeName="dy" values="104;-104;104" keyTimes="0;0.5;1" dur="4.1s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence
              type="turbulence"
              baseFrequency="0.029"
              numOctaves="3"
              stitchTiles="stitch"
              result="noise2"
              seed="3"
            />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
              <animate attributeName="dx" values="86;-86;86" keyTimes="0;0.5;1" dur="2.8s" repeatCount="indefinite" calcMode="linear" />
              <animate attributeName="dy" values="-56;56;-56" keyTimes="0;0.5;1" dur="3.6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence
              type="turbulence"
              baseFrequency="0.026"
              numOctaves="3"
              stitchTiles="stitch"
              result="noise3"
              seed="5"
            />
            <feOffset in="noise3" dx="0" dy="0" result="offsetNoise3">
              <animate attributeName="dx" values="-64;64;-64" keyTimes="0;0.5;1" dur="3.1s" repeatCount="indefinite" calcMode="linear" />
              <animate attributeName="dy" values="-82;82;-82" keyTimes="0;0.5;1" dur="4.4s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence
              type="turbulence"
              baseFrequency="0.034"
              numOctaves="2"
              stitchTiles="stitch"
              result="noise4"
              seed="7"
            />
            <feOffset in="noise4" dx="0" dy="0" result="offsetNoise4">
              <animate attributeName="dx" values="58;-58;58" keyTimes="0;0.5;1" dur="2.5s" repeatCount="indefinite" calcMode="linear" />
              <animate attributeName="dy" values="44;-44;44" keyTimes="0;0.5;1" dur="3.3s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
            <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
            <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />
            <feDisplacementMap in="SourceGraphic" in2="combinedNoise" scale="4.6" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </defs>
      </svg>

    <div className="fights-container">
      <div className="fights-header">
        <h2 className="fights-title">Upcoming Fights</h2>
        <button 
          className="ai-votes-toggle"
          style={dynamicToggleStyle}
          onClick={() => setShowAIVotes(!showAIVotes)}
        >
          {showAIVotes ? '● Show AI Users' : '○ Show AI Users'}
        </button>
      </div>

      <div className="fights-content">
        {error && (
          // Global error (e.g. from fetching fights) is still displayed at the top
          <div className="error-message">{error}</div>
        )}

        {eventVoteProgress && (
          <div className="floating-vote-progress" aria-live="polite" aria-atomic="true">
            <span className="floating-vote-progress-primary">{eventVoteProgress.label}</span>
            <span className="floating-vote-progress-secondary">{eventVoteProgress.progress}</span>
          </div>
        )}

        {fights.map((fight) => {
          const fightFormatDetails = getFightFormatDetails(fight);
          const hasFightMeta = fight.card_tier || fight.weightclass || fight.is_canceled || fightFormatDetails;
          const fightCardClassName = `fight-card ${fight.is_completed ? 'completed' : ''} ${fight.is_canceled ? 'canceled' : ''} ${fight.is_title_fight ? 'title-fight' : ''}`.trim();
          const fightMetaClassName = `fight-meta ${fight.is_title_fight ? 'title-fight' : ''}`.trim();

          return (
        <div key={fight.id} className={fightCardClassName}>
          {fight.is_title_fight && (
            <>
              <div className="title-fight-border-outer">
                <div className="title-fight-border-inner" />
              </div>
              <div className="title-fight-glow-1" />
              <div className="title-fight-glow-2" />
              <div className="title-fight-background-glow" />
            </>
          )}
          {hasFightMeta && (
            <div className={fightMetaClassName}>
              {fight.is_title_fight && (
                <div className="title-fight-banner">TITLE FIGHT</div>
              )}
              {fight.card_tier && <h4 className="card-tier">{fight.card_tier}</h4>}
              {typeof fight.weightclass === 'string' && fight.weightclass && (
                <div className="weight-class-container">
                  <p className="weight-class">
                    {fight.weightclass.split(' ').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                    ).join(' ')}
                  </p>
                  {(fight.weightclass_official || fight.weightclass_lbs) && (
                    <p className="weight-class-details">
                      {fight.weightclass_official && fight.weightclass_lbs 
                        ? `${typeof fight.weightclass_official === 'string' ? fight.weightclass_official.split(' ').map(word => 
                            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                          ).join(' ') : fight.weightclass_official} (${fight.weightclass_lbs} lbs)`
                        : fight.weightclass_official 
                          ? (typeof fight.weightclass_official === 'string' ? fight.weightclass_official.split(' ').map(word => 
                              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                            ).join(' ') : fight.weightclass_official)
                          : fight.weightclass_lbs 
                            ? `${fight.weightclass_lbs} lbs`
                            : ''
                      }
                    </p>
                  )}
                  {fightFormatDetails && (
                    <p className="fight-format-details">{fightFormatDetails}</p>
                  )}
                </div>
              )}
              {!fight.weightclass && fightFormatDetails && (
                <p className="fight-format-details">{fightFormatDetails}</p>
              )}
              {fight.is_canceled && (
                <div className="fight-canceled">
                  <span className="canceled-icon">✕</span>
                  CANCELED
                </div>
              )}
            </div>
          )}
          <div className="fighters-container">
            {/* Fighter 1 Card */}
            <div
              className={`fighter-card ${
                fight.is_completed
                  ? String(fight.winner) === String(fight.fighter1_id)
                    ? 'winner'
                    : 'loser'
                  : (selectedFights[fight.id] === fight.fighter1_id || submittedFights[fight.id] === fight.fighter1_id)
                    ? 'selected'
                    : (submittedFights[fight.id] && submittedFights[fight.id] !== fight.fighter1_id)
                      ? 'unselected'
                      : ''
              }`}
              onClick={() => !fight.is_completed && !fight.is_canceled && handleSelection(fight.id, fight.fighter1_id, fight.fighter1_name)}
            >
              <div className="fighter-card-flag-background">
                <ReactCountryFlag 
                  countryCode={getCountryCode(fight.fighter1_country)} 
                  svg 
                  style={{
                    width: '100%',
                    height: '100%',
                    opacity: 0.3,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    borderRadius: '16px',
                    filter: 'blur(2px) brightness(1.1)',
                    objectFit: 'cover'
                  }}
                />
              </div>
              {hasVoteReminder(fight.fighter1_id) && (
                <div
                  className="fighter-reminder-badge"
                  role="img"
                  aria-label="Reminder active"
                  title="Reminder active"
                >
                  {getReminderEmoji(fight.fighter1_id)}
                </div>
              )}
              <div className="fighter-image-container">
                <img
                  src={fight.fighter1_image}
                  alt={fight.fighter1_name}
                  className="fighter-image"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <h3 className="fighter-name">
                <span className="fighter-name-text">{fight.fighter1_firstName}</span>
                {fight.fighter1_nickname && (
                  <span className="fighter-nickname">{fight.fighter1_nickname}</span>
                )}
                <span className="fighter-name-text">{fight.fighter1_lastName}</span>
              </h3>
              <div className="stat-container">
                <div className="stat-row">
                  <span className="stat-label">Rank</span>
                  <span>{renderFighterRank(fight.fighter1_rank, `${fight.id}-fighter1-rank`)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Record</span>
                  <span>{fight.fighter1_record ? fight.fighter1_record.split('-').join(' - ') : 'N/A'}</span>
                </div>
                <div className="stat-row odds-row">
                  <span className="stat-label">Odds</span>
                  <span className={parseInt(fight.fighter1_odds) < 0 ? 'favorite-odds' : 'underdog-odds'}>
                    {fight.fighter1_odds ? fight.fighter1_odds : 'N/A'}
                  </span>
                </div>
              </div>
              {expandedFightStats[fight.id] && (
                <div className="expanded-stats">
                  <div className="stat-row">
                    <span className="stat-label">Age</span>
                    <span>{fight.fighter1_age || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Weight</span>
                    <span>{fight.fighter1_weight ? `${fight.fighter1_weight} lb` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Height</span>
                    <span>{convertInchesToHeightString(fight.fighter1_height)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Reach</span>
                    <span>{fight.fighter1_reach ? `${fight.fighter1_reach}"` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Stance</span>
                    <span>{fight.fighter1_stance || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Style</span>
                    <span>{fight.fighter1_style || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Streak</span>
                    <span>{fight.fighter1_streak !== null ? formatStreak(fight.fighter1_streak) : 'N/A'}</span>
                  </div>
                  <FinishMethodBreakdown fight={fight} fighterKey="fighter1" />
                  {(() => {
                    const lastVoteOutcome = getLastVoteOutcomeForFighter(fight, fight.fighter1_id);
                    if (!lastVoteOutcome) return null;
                    return (
                      <div className="last-vote-outcome">
                        Last time you voted for this fighter, they {lastVoteOutcome}.
                      </div>
                    );
                  })()}
                  {hasVoteReminder(fight.fighter1_id) && (
                    <div className="vote-reminder-status">
                      {getReminderStatusMessage(fight.fighter1_id)}
                    </div>
                  )}
                  <div className="vote-reminder-controls">
                    <div className="vote-reminder-options">
                      <button
                        type="button"
                        className={`vote-reminder-button ${getReminderType(fight.fighter1_id) === REMINDER_TYPE_BROKEN_HEART ? 'active active-broken-heart' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setVoteReminderType(fight.fighter1_id, fight.fighter1_name, REMINDER_TYPE_BROKEN_HEART);
                        }}
                        aria-label="Set broken heart reminder"
                        title="Broken heart reminder"
                      >
                        💔
                      </button>
                      <button
                        type="button"
                        className={`vote-reminder-button ${getReminderType(fight.fighter1_id) === REMINDER_TYPE_HEART_EYES ? 'active active-heart-eyes' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setVoteReminderType(fight.fighter1_id, fight.fighter1_name, REMINDER_TYPE_HEART_EYES);
                        }}
                        aria-label="Set heart eyes reminder"
                        title="Heart eyes reminder"
                      >
                        😍
                      </button>
                    </div>
                  </div>
                  {hasVoteReminder(fight.fighter1_id) && (
                    <button
                      type="button"
                      className="vote-reminder-clear-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearVoteReminder(fight.fighter1_id);
                      }}
                    >
                      Clear Reminder
                    </button>
                  )}
                </div>
              )}
              {String(submittedFights[fight.id]) === String(fight.fighter1_id) && (
                <div className="vote-badge">Your Pick</div>
              )}
            </div>

            <div className="vs-text">VS</div>

            {/* Fighter 2 Card */}
            <div
              className={`fighter-card ${
                fight.is_completed
                  ? String(fight.winner) === String(fight.fighter2_id)
                    ? 'winner'
                    : 'loser'
                  : (selectedFights[fight.id] === fight.fighter2_id || submittedFights[fight.id] === fight.fighter2_id)
                    ? 'selected'
                    : (submittedFights[fight.id] && submittedFights[fight.id] !== fight.fighter2_id)
                      ? 'unselected'
                      : ''
              }`}
              onClick={() => !fight.is_completed && !fight.is_canceled && handleSelection(fight.id, fight.fighter2_id, fight.fighter2_name)}
            >
              <div className="fighter-card-flag-background">
                <ReactCountryFlag 
                  countryCode={getCountryCode(fight.fighter2_country)} 
                  svg 
                  style={{
                    width: '100%',
                    height: '100%',
                    opacity: 0.3,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    borderRadius: '16px',
                    filter: 'blur(2px) brightness(1.1)',
                    objectFit: 'cover'
                  }}
                />
              </div>
              {hasVoteReminder(fight.fighter2_id) && (
                <div
                  className="fighter-reminder-badge"
                  role="img"
                  aria-label="Reminder active"
                  title="Reminder active"
                >
                  {getReminderEmoji(fight.fighter2_id)}
                </div>
              )}
              <div className="fighter-image-container">
                <img
                  src={fight.fighter2_image}
                  alt={fight.fighter2_name}
                  className="fighter-image"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <h3 className="fighter-name">
                <span className="fighter-name-text">{fight.fighter2_firstName}</span>
                {fight.fighter2_nickname && (
                  <span className="fighter-nickname">{fight.fighter2_nickname}</span>
                )}
                <span className="fighter-name-text">{fight.fighter2_lastName}</span>
              </h3>
              <div className="stat-container">
                <div className="stat-row">
                  <span className="stat-label">Rank</span>
                  <span>{renderFighterRank(fight.fighter2_rank, `${fight.id}-fighter2-rank`)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Record</span>
                  <span>{fight.fighter2_record ? fight.fighter2_record.split('-').join(' - ') : 'N/A'}</span>
                </div>
                <div className="stat-row odds-row">
                  <span className="stat-label">Odds</span>
                  <span className={parseInt(fight.fighter2_odds) < 0 ? 'favorite-odds' : 'underdog-odds'}>
                    {fight.fighter2_odds ? fight.fighter2_odds : 'N/A'}
                  </span>
                </div>
              </div>
              {expandedFightStats[fight.id] && (
                <div className="expanded-stats">
                  <div className="stat-row">
                    <span className="stat-label">Age</span>
                    <span>{fight.fighter2_age || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Weight</span>
                    <span>{fight.fighter2_weight ? `${fight.fighter2_weight} lb` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Height</span>
                    <span>{convertInchesToHeightString(fight.fighter2_height)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Reach</span>
                    <span>{fight.fighter2_reach ? `${fight.fighter2_reach}"` : 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Stance</span>
                    <span>{fight.fighter2_stance || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Style</span>
                    <span>{fight.fighter2_style || 'N/A'}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Streak</span>
                    <span>{fight.fighter2_streak !== null ? formatStreak(fight.fighter2_streak) : 'N/A'}</span>
                  </div>
                  <FinishMethodBreakdown fight={fight} fighterKey="fighter2" />
                  {(() => {
                    const lastVoteOutcome = getLastVoteOutcomeForFighter(fight, fight.fighter2_id);
                    if (!lastVoteOutcome) return null;
                    return (
                      <div className="last-vote-outcome">
                        Last time you voted for this fighter, they {lastVoteOutcome}.
                      </div>
                    );
                  })()}
                  {hasVoteReminder(fight.fighter2_id) && (
                    <div className="vote-reminder-status">
                      {getReminderStatusMessage(fight.fighter2_id)}
                    </div>
                  )}
                  <div className="vote-reminder-controls">
                    <div className="vote-reminder-options">
                      <button
                        type="button"
                        className={`vote-reminder-button ${getReminderType(fight.fighter2_id) === REMINDER_TYPE_BROKEN_HEART ? 'active active-broken-heart' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setVoteReminderType(fight.fighter2_id, fight.fighter2_name, REMINDER_TYPE_BROKEN_HEART);
                        }}
                        aria-label="Set broken heart reminder"
                        title="Broken heart reminder"
                      >
                        💔
                      </button>
                      <button
                        type="button"
                        className={`vote-reminder-button ${getReminderType(fight.fighter2_id) === REMINDER_TYPE_HEART_EYES ? 'active active-heart-eyes' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setVoteReminderType(fight.fighter2_id, fight.fighter2_name, REMINDER_TYPE_HEART_EYES);
                        }}
                        aria-label="Set heart eyes reminder"
                        title="Heart eyes reminder"
                      >
                        😍
                      </button>
                    </div>
                  </div>
                  {hasVoteReminder(fight.fighter2_id) && (
                    <button
                      type="button"
                      className="vote-reminder-clear-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearVoteReminder(fight.fighter2_id);
                      }}
                    >
                      Clear Reminder
                    </button>
                  )}
                </div>
              )}
              {String(submittedFights[fight.id]) === String(fight.fighter2_id) && (
                <div className="vote-badge">Your Pick</div>
              )}
            </div>
          </div>

          {/* Add the single expand button after the fighters container */}
          <button 
            className="expand-stats-button"
            onClick={(e) => toggleFightStats(fight.id, e)}
          >
            {expandedFightStats[fight.id] ? '▲' : '▼'}
          </button>

          {/* Display vote error for this fight if it exists */}
          {voteErrors[fight.id] && (
            <div className="error-message">{voteErrors[fight.id]}</div>
          )}

          {selectedFights[fight.id] && !submittedFights[fight.id] && (
            <div className="selected-fighter-message">
              <button
                className={`submit-vote-button ${
                  String(selectedFights[fight.id]) === String(fight.fighter1_id)
                    ? 'submit-vote-button--red'
                    : 'submit-vote-button--blue'
                }`}
                onClick={() => handleSubmitVote(fight.id)}
              >
                Submit Vote for{' '}
                <span style={{
                  fontFamily: '"Permanent Marker", cursive, sans-serif',
                  color: '#ffffff'
                }}>
                  {String(selectedFights[fight.id]) === String(fight.fighter1_id) 
                    ? fight.fighter1_name 
                    : fight.fighter2_name}
                </span>
              </button>
            </div>
          )}

          <div className="fight-votes-section">
            <div
              className={`vote-distribution${(!submittedFights[fight.id] && !fight.is_completed) ? ' disabled' : ''}`}
              style={{ cursor: (submittedFights[fight.id] || fight.is_completed) ? 'pointer' : 'not-allowed', position: 'relative' }}
              onClick={() => (submittedFights[fight.id] || fight.is_completed) && toggleFightExpansion(fight.id)}
              tabIndex={0}
              onKeyPress={e => {
                if ((e.key === 'Enter' || e.key === ' ') && (submittedFights[fight.id] || fight.is_completed)) {
                  toggleFightExpansion(fight.id);
                }
              }}
              aria-label={expandedFights[fight.id] ? 'Hide Votes' : 'Show Votes'}
            >
              {(() => {
                // Use vote counts if available (user has voted), otherwise show 50/50
                let split = 50;
                
                if (submittedFights[fight.id] || fight.is_completed) {
                  // User has voted or fight is completed - show actual ratio
                  if (voteCounts[fight.id]) {
                    // Use vote counts (lightweight, always available after voting)
                    const fighter1Count = showAIVotes
                      ? voteCounts[fight.id].fighter1.total
                      : voteCounts[fight.id].fighter1.human;
                    const fighter2Count = showAIVotes
                      ? voteCounts[fight.id].fighter2.total
                      : voteCounts[fight.id].fighter2.human;
                    const total = fighter1Count + fighter2Count;
                    if (total > 0) {
                      split = Math.round((fighter1Count / total) * 100);
                    }
                  } else if (fightVotes[fight.id]) {
                    // Fallback to full vote data if available (user clicked "Show Votes")
                    const fighter1FilteredVotes = fightVotes[fight.id]?.fighter1Votes?.filter(vote => showAIVotes || !vote.is_bot) || [];
                    const fighter2FilteredVotes = fightVotes[fight.id]?.fighter2Votes?.filter(vote => showAIVotes || !vote.is_bot) || [];
                    const totalVotes = fighter1FilteredVotes.length + fighter2FilteredVotes.length;
                    if (totalVotes > 0) {
                      split = Math.round((fighter1FilteredVotes.length / totalVotes) * 100);
                    }
                  }
                } else {
                  // User hasn't voted yet - show 50/50 (locked state)
                  split = 50;
                }
                return (
                  <>
                    <div
                      className="vote-bar blended-bar"
                      style={{
                        width: '100%',
                        height: '100%',
                        background: `linear-gradient(90deg, rgba(239, 68, 68, 0.8) ${split}%, rgba(59, 130, 246, 0.8) ${split}%)`,
                        borderRadius: 'inherit',
                        transition: 'background 0.3s',
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        zIndex: 1
                      }}
                    />
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1rem',
                      color: '#fff',
                      textShadow: '0 2px 8px #000a',
                      pointerEvents: 'none',
                      zIndex: 2,
                      opacity: 0.85
                    }}>
                      {expandedFights[fight.id] ? '▲ Hide Votes' : 
                        (!submittedFights[fight.id] && !fight.is_completed) ? '🔒 Vote to See Predictions' : '▼ Show Votes'}
                    </span>
                  </>
                );
              })()}
            </div>
            {expandedFights[fight.id] && fightVotes[fight.id] && (
              <div className="votes-container">
                <div className="votes-list-container">
                  <div className="fighter-votes fighter1-votes">
                    <h4>{fight.fighter1_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter1Votes
                        .filter(vote => showAIVotes || !vote.is_bot)
                        .map((vote, index) => (
                          <VoteCard key={index} vote={vote} username={username} rivalMarker={getVoteRivalryMarker(vote)} />
                        ))}
                    </div>
                  </div>
                  <div className="fighter-votes fighter2-votes">
                    <h4>{fight.fighter2_name}'s Votes</h4>
                    <div className="votes-list">
                      {fightVotes[fight.id].fighter2Votes
                        .filter(vote => showAIVotes || !vote.is_bot)
                        .map((vote, index) => (
                          <VoteCard key={index} vote={vote} username={username} rivalMarker={getVoteRivalryMarker(vote)} />
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Admin Controls - only show for admin users */}
          {canManageAdminActions && (
            <div className="admin-controls">
              <button 
                className="expand-admin-button"
                onClick={(e) => toggleAdminControls(fight.id, e)}
              >
                {expandedAdminControls[fight.id] ? '▼' : '▶'} Admin Controls
              </button>
              
              {expandedAdminControls[fight.id] && (
                <div className="admin-controls-content">
                  {fight.is_canceled ? (
                    <div className="admin-canceled-display">
                      <span className="canceled-text">Fight Canceled</span>
                    </div>
                  ) : fight.winner && editingFight !== fight.id ? (
                    <div className="admin-result-display">
                      <span className="winner-text">
                        Winner: {String(fight.winner) === String(fight.fighter1_id) ? fight.fighter1_name : fight.fighter2_name}
                      </span>
                      <div className="admin-action-buttons">
                        <button 
                          className="admin-edit-button"
                          onClick={() => setEditingFight(fight.id)}
                        >
                          Edit Result
                        </button>
                        <button 
                          className="admin-cancel-fight-button"
                          onClick={() => handleFightCancel(fight.id)}
                        >
                          Cancel Fight
                        </button>
                      </div>
                    </div>
                  ) : (editingFight === fight.id || !fight.winner) && (
                    <div className="admin-result-editor">
                      <div className="admin-buttons">
                        <button
                          className={`admin-winner-button ${String(fight.winner) === String(fight.fighter1_id) ? 'selected' : ''}`}
                          onClick={() => handleResultUpdate(fight.id, fight.fighter1_id)}
                        >
                          {fight.fighter1_name} Won
                        </button>
                        <button
                          className={`admin-winner-button ${String(fight.winner) === String(fight.fighter2_id) ? 'selected' : ''}`}
                          onClick={() => handleResultUpdate(fight.id, fight.fighter2_id)}
                        >
                          {fight.fighter2_name} Won
                        </button>
                      </div>
                      <div className="admin-action-buttons">
                        {fight.winner && (
                          <button
                            className="admin-unselect-button"
                            onClick={() => handleResultUpdate(fight.id, null)}
                          >
                            Unselect Winner
                          </button>
                        )}
                        <button 
                          className="admin-cancel-fight-button"
                          onClick={() => handleFightCancel(fight.id)}
                        >
                          Cancel Fight
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        );
        })}

        {fights.length === 0 && !loading && (
          <div className="no-fights-message">
            No fights available for this event yet. Check back later for updates!
          </div>
        )}
      </div>
    </div>
    </>
  );
}

export default Fights;
