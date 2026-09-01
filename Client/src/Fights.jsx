import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { API_URL } from './config';
import { cachedFetchJson, invalidateCache } from './utils/apiCache';
import { fetchWithAdminSession, hasActiveAdminSession } from './utils/adminSession';
import { fetchWithUserSession } from './utils/userSession';
import { getInitialFightTargetId, getNextUnvotedFightId } from './utils/fightNavigation';
import {
  formatAverageFightTime,
  formatLastFightRecency,
  getMatchupComparison,
  getMetricScaleRatio,
  parseFighterMetric,
  parseRecentForm,
} from './utils/fighterStats';
import {
  haveFightCardsChanged,
  haveFightResultsChanged,
  getEventLiveStateChanges,
  shouldPollFightCard,
} from './utils/pollingPolicy';
import ReactCountryFlag from 'react-country-flag';
import { getCountryCode, convertInchesToHeightString, formatStreak } from './utils/countryUtils';
import './Fights.css';
import PlayerCard from './components/PlayerCard';
import VoteCard from './components/VoteCard';
import ConfirmDialog from './components/ConfirmDialog';

const REMINDER_TYPE_BROKEN_HEART = 'broken_heart';
const REMINDER_TYPE_HEART_EYES = 'heart_eyes';
const EVENT_STATE_REFRESH_INTERVAL_MS = 15000;
const PICK_UNDO_WINDOW_MS = 6500;
const RESULT_TYPE_LABELS = {
  draw: 'Draw',
  no_contest: 'No Contest',
};
const REMINDER_EMOJI_MAP = {
  [REMINDER_TYPE_BROKEN_HEART]: '💔',
  [REMINDER_TYPE_HEART_EYES]: '😍'
};

function FighterReminderOverlay({ fighterName, reminderType, animation }) {
  if (!reminderType) return null;

  const isLiked = reminderType === REMINDER_TYPE_HEART_EYES;
  const emoji = REMINDER_EMOJI_MAP[reminderType] || REMINDER_EMOJI_MAP[REMINDER_TYPE_BROKEN_HEART];
  const stateLabel = isLiked ? `Liked fighter: ${fighterName}` : `Disliked fighter: ${fighterName}`;

  return (
    <>
      <div
        className={`fighter-reminder-badge ${isLiked ? 'is-liked' : 'is-disliked'}`}
        role="img"
        aria-label={stateLabel}
        title={stateLabel}
      >
        <span aria-hidden="true">{emoji}</span>
      </div>
      {animation && (
        <div
          key={animation.nonce}
          className={`fighter-reaction-animation ${isLiked ? 'is-liked' : 'is-disliked'}`}
          aria-hidden="true"
        >
          <span>{emoji}</span>
        </div>
      )}
    </>
  );
}

function FighterFlagBackground({ bornCountry, fightingOutOfCountry }) {
  const born = typeof bornCountry === 'string' ? bornCountry.trim() : '';
  const fightingOutOf = typeof fightingOutOfCountry === 'string'
    ? fightingOutOfCountry.trim()
    : '';
  const hasBornCountry = born && born !== 'N/A';
  const hasFightingOutOfCountry = fightingOutOf && fightingOutOf !== 'N/A';
  const bornCountryCode = getCountryCode(born);
  const fightingOutOfCountryCode = getCountryCode(fightingOutOf);
  const hasSplitFlags = hasBornCountry
    && hasFightingOutOfCountry
    && bornCountryCode !== fightingOutOfCountryCode;

  const renderFlag = (country, className) => (
    <ReactCountryFlag
      countryCode={getCountryCode(country)}
      svg
      className={`fighter-card-flag ${className}`}
      aria-label={`${country} flag`}
    />
  );

  return (
    <div className={`fighter-card-flag-background${hasSplitFlags ? ' is-split' : ''}`}>
      {hasSplitFlags ? (
        <>
          {renderFlag(born, 'fighter-card-flag--born')}
          {renderFlag(fightingOutOf, 'fighter-card-flag--fighting-out-of')}
        </>
      ) : renderFlag(fightingOutOf || born || 'USA', 'fighter-card-flag--single')}
    </div>
  );
}

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
    lossesKey: 'ko_tko_losses'
  },
  {
    label: 'Submission',
    winsKey: 'submission_wins',
    lossesKey: 'submission_losses'
  },
  {
    label: 'Decision',
    winsKey: 'decision_wins',
    lossesKey: 'decision_losses'
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

function getMethodWidth(count, maximum) {
  if (!maximum || count <= 0) {
    return 0;
  }

  return Math.min((count / maximum) * 100, 100);
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

function formatFighterLocation(...parts) {
  const seen = new Set();
  const locationParts = parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => {
      if (!part || part === 'N/A') return false;
      const normalized = part.toLocaleLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

  return locationParts.join(', ') || 'N/A';
}

function FighterDetailSections({ fight, fighterKey }) {
  const value = (suffix) => fight?.[`${fighterKey}_${suffix}`];
  const recentForm = parseRecentForm(value('recent_form'));
  const recency = formatLastFightRecency(value('last_fight_date'));
  const bornLocation = formatFighterLocation(
    value('born_city'),
    value('born_state'),
    value('born_country')
  );
  const fightingOutOfLocation = formatFighterLocation(
    value('fighting_out_of_city'),
    value('fighting_out_of_state'),
    value('fighting_out_of_country') || value('country')
  );

  return (
    <>
      <section className="expanded-stat-group">
        <h4 className="expanded-stat-group-title">Physical</h4>
        <div className="expanded-stat-grid">
          <div className="stat-row">
            <span className="stat-label">Age</span>
            <span>{value('age') || 'N/A'}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Height</span>
            <span>{convertInchesToHeightString(value('height'))}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Reach</span>
            <span>{value('reach') ? `${value('reach')}"` : 'N/A'}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Weight</span>
            <span>{value('weight') ? `${value('weight')} lb` : 'N/A'}</span>
          </div>
        </div>
      </section>

      <section className="expanded-stat-group">
        <h4 className="expanded-stat-group-title">Fight Profile</h4>
        <div className="expanded-stat-grid">
          <div className="stat-row">
            <span className="stat-label">Stance</span>
            <span>{value('stance') || 'N/A'}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Style</span>
            <span>{value('style') || 'N/A'}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Streak</span>
            <span>{value('streak') !== null ? formatStreak(value('streak')) : 'N/A'}</span>
          </div>
        </div>
      </section>

      <section className="expanded-stat-group">
        <h4 className="expanded-stat-group-title">Recent form</h4>
        <div className="fighter-recent-form">
          <div
            className="fighter-recent-form-results"
            aria-label={`${value('name') || fight?.[`${fighterKey}_name`] || 'Fighter'} recent form: ${recentForm.join(', ') || 'unavailable'}`}
          >
            {recentForm.length > 0 ? recentForm.map((result, index) => (
              <span key={`${result}-${index}`} className={`performance-result performance-result--${result.toLowerCase()}`}>
                {result}
              </span>
            )) : <span className="fighter-recent-form-empty">Form unavailable</span>}
          </div>
          <span className="performance-recency">{recency}</span>
        </div>
      </section>

      <section className="expanded-stat-group expanded-stat-group--background">
        <h4 className="expanded-stat-group-title">Background</h4>
        <div className="stat-row stat-row--location">
          <span className="stat-label">Born</span>
          <span className="stat-value stat-value--location">{bornLocation}</span>
        </div>
        <div className="stat-row stat-row--location">
          <span className="stat-label">Fights out of</span>
          <span className="stat-value stat-value--location">{fightingOutOfLocation}</span>
        </div>
      </section>
    </>
  );
}

const PERFORMANCE_GROUPS = [
  {
    label: 'Striking',
    metrics: [
      { label: 'Landed / min', suffix: 'sig_str_landed_per_min', maximum: 8, format: 'rate', direction: 'higher' },
      { label: 'Absorbed / min', suffix: 'sig_str_absorbed_per_min', maximum: 8, format: 'rate', direction: 'lower', note: 'lower is better' },
      { label: 'Accuracy', suffix: 'sig_strike_accuracy_pct', maximum: 100, format: 'percent', direction: 'higher' },
      { label: 'Defense', suffix: 'sig_strike_defense_pct', maximum: 100, format: 'percent', direction: 'higher' },
    ],
  },
  {
    label: 'Grappling',
    metrics: [
      { label: 'Takedowns / 15', suffix: 'takedown_avg_per_15', maximum: 6, format: 'rate', direction: 'higher' },
      { label: 'TD accuracy', suffix: 'takedown_accuracy_pct', maximum: 100, format: 'percent', direction: 'higher' },
      { label: 'TD defense', suffix: 'takedown_defense_pct', maximum: 100, format: 'percent', direction: 'higher' },
      { label: 'Sub attempts / 15', suffix: 'submission_avg_per_15', maximum: 3, format: 'rate', direction: 'higher' },
    ],
  },
  {
    label: 'Power & pace',
    metrics: [
      { label: 'Knockdowns / 15', suffix: 'knockdown_avg_per_15', maximum: 3, format: 'rate', direction: 'higher' },
      { label: 'Avg fight time', suffix: 'average_fight_time_seconds', maximum: 1500, format: 'time', direction: 'neutral', note: 'duration, not advantage' },
    ],
  },
];

const RADAR_METRICS = [
  { label: 'Output', suffix: 'sig_str_landed_per_min', maximum: 8 },
  { label: 'Accuracy', suffix: 'sig_strike_accuracy_pct', maximum: 100 },
  { label: 'Str. defense', suffix: 'sig_strike_defense_pct', maximum: 100 },
  { label: 'TD defense', suffix: 'takedown_defense_pct', maximum: 100 },
  { label: 'Takedowns', suffix: 'takedown_avg_per_15', maximum: 6 },
  { label: 'Sub threat', suffix: 'submission_avg_per_15', maximum: 3 },
];

function formatPerformanceMetric(value, format) {
  const metric = parseFighterMetric(value);
  if (metric === null) return '—';
  if (format === 'percent') return `${Math.round(metric)}%`;
  if (format === 'time') return formatAverageFightTime(metric);
  return metric.toFixed(2);
}

function formatPerformanceDelta(delta, format) {
  if (delta === null) return '';
  if (format === 'percent') return `${Math.round(delta)} pts`;
  if (format === 'time') return formatAverageFightTime(delta);
  return delta.toFixed(2);
}

function PerformanceMetricRow({ fight, metric }) {
  const redValue = fight?.[`fighter1_${metric.suffix}`];
  const blueValue = fight?.[`fighter2_${metric.suffix}`];
  const redMetric = parseFighterMetric(redValue);
  const blueMetric = parseFighterMetric(blueValue);
  if (redMetric === null && blueMetric === null) return null;

  const comparison = getMatchupComparison(redValue, blueValue, metric.direction);
  const redFormatted = formatPerformanceMetric(redValue, metric.format);
  const blueFormatted = formatPerformanceMetric(blueValue, metric.format);
  const deltaFormatted = formatPerformanceDelta(comparison.delta, metric.format);
  const leaderName = comparison.leader === 'red'
    ? fight.fighter1_name
    : fight.fighter2_name;
  const edgeCopy = !comparison.comparable
    ? 'No comparison'
    : comparison.leader === 'tie'
      ? 'Even'
      : metric.direction === 'lower'
        ? `${deltaFormatted} fewer`
        : metric.direction === 'neutral'
          ? `${deltaFormatted} longer`
          : `+${deltaFormatted} edge`;
  const accessibleComparison = !comparison.comparable
    ? 'A direct comparison is unavailable.'
    : comparison.leader === 'tie'
      ? 'The fighters are even.'
      : metric.direction === 'lower'
        ? `${leaderName} has the advantage with ${deltaFormatted} fewer.`
        : metric.direction === 'neutral'
          ? `${leaderName} has a ${deltaFormatted} longer average; longer is not necessarily better.`
          : `${leaderName} has a ${deltaFormatted} advantage.`;

  return (
    <div className={`matchup-metric${comparison.comparable ? '' : ' matchup-metric--unavailable'}`}>
      <div className="matchup-metric-heading">
        <strong className="matchup-value matchup-value--red">{redFormatted}</strong>
        <span>
          {metric.label}
          {metric.note && <small>{metric.note}</small>}
        </span>
        <strong className="matchup-value matchup-value--blue">{blueFormatted}</strong>
      </div>
      <div
        className="matchup-edge"
        role="img"
        aria-label={`${metric.label}: ${fight.fighter1_name} ${redFormatted}, ${fight.fighter2_name} ${blueFormatted}. ${accessibleComparison}`}
      >
        <span className="matchup-edge-side">Red</span>
        <span className="matchup-edge-axis">
          {comparison.comparable && (
            <span
              className={`matchup-edge-dot matchup-edge-dot--${comparison.leader}`}
              style={{ left: `${comparison.edgePosition}%` }}
            />
          )}
        </span>
        <span className="matchup-edge-side">Blue</span>
      </div>
      <div className={`matchup-edge-result matchup-edge-result--${comparison.leader || 'none'}`} aria-hidden="true">
        <span>{edgeCopy}</span>
      </div>
    </div>
  );
}

function MatchupRadar({ fight }) {
  const center = 150;
  const centerY = 128;
  const radius = 78;
  const axisCount = RADAR_METRICS.length;
  const fighterValues = ['fighter1', 'fighter2'].map((fighterKey) => (
    RADAR_METRICS.map(({ suffix, maximum }) => (
      getMetricScaleRatio(fight?.[`${fighterKey}_${suffix}`], maximum)
    ))
  ));
  const hasCompleteRadar = fighterValues.every((values) => values.every((value) => value !== null));
  if (!hasCompleteRadar) return null;

  const pointFor = (index, ratio = 1, extraRadius = 0) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / axisCount);
    const distance = (radius * ratio) + extraRadius;
    return {
      x: center + (Math.cos(angle) * distance),
      y: centerY + (Math.sin(angle) * distance),
      angle,
    };
  };
  const polygon = (values) => values
    .map((ratio, index) => {
      const point = pointFor(index, ratio);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(' ');
  const grids = [0.25, 0.5, 0.75, 1].map((level) => (
    RADAR_METRICS.map((_, index) => {
      const point = pointFor(index, level);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(' ')
  ));

  return (
    <figure className="matchup-radar">
      <figcaption>
        <strong>Style profile</strong>
        <span>Normalized career dimensions</span>
      </figcaption>
      <svg viewBox="0 0 300 270" role="img" aria-labelledby={`radar-title-${fight.id} radar-desc-${fight.id}`}>
        <title id={`radar-title-${fight.id}`}>{fight.fighter1_name} and {fight.fighter2_name} style profile</title>
        <desc id={`radar-desc-${fight.id}`}>Radar comparison of striking output, accuracy, striking defense, takedown defense, takedown volume, and submission threat.</desc>
        {grids.map((points, index) => (
          <polygon key={points} className="matchup-radar-grid" points={points} data-outer={index === grids.length - 1 || undefined} />
        ))}
        {RADAR_METRICS.map((metric, index) => {
          const axisPoint = pointFor(index);
          const labelPoint = pointFor(index, 1, 20);
          const cosine = Math.cos(labelPoint.angle);
          const textAnchor = cosine > 0.35 ? 'start' : cosine < -0.35 ? 'end' : 'middle';
          return (
            <g key={metric.suffix}>
              <line className="matchup-radar-axis" x1={center} y1={centerY} x2={axisPoint.x} y2={axisPoint.y} />
              <text className="matchup-radar-label" x={labelPoint.x} y={labelPoint.y} textAnchor={textAnchor} dominantBaseline="middle">
                {metric.label}
              </text>
            </g>
          );
        })}
        <polygon className="matchup-radar-area matchup-radar-area--red" points={polygon(fighterValues[0])} />
        <polygon className="matchup-radar-area matchup-radar-area--blue" points={polygon(fighterValues[1])} />
        {fighterValues.map((values, fighterIndex) => values.map((ratio, metricIndex) => {
          const point = pointFor(metricIndex, ratio);
          return (
            <circle
              key={`${fighterIndex}-${metricIndex}`}
              className={`matchup-radar-point matchup-radar-point--${fighterIndex === 0 ? 'red' : 'blue'}`}
              cx={point.x}
              cy={point.y}
              r="3"
            />
          );
        }))}
      </svg>
      <p>Shape only—each axis keeps its own UFC stat scale.</p>
    </figure>
  );
}

function FightPerformanceComparison({ fight }) {
  const metricSuffixes = PERFORMANCE_GROUPS.flatMap(({ metrics }) => metrics.map(({ suffix }) => suffix));
  const hasPerformanceData = ['fighter1', 'fighter2'].some((fighterKey) => (
    metricSuffixes.some((suffix) => parseFighterMetric(fight?.[`${fighterKey}_${suffix}`]) !== null)
  ));
  if (!hasPerformanceData) return null;

  const hasRadar = RADAR_METRICS.every(({ suffix }) => (
    parseFighterMetric(fight?.[`fighter1_${suffix}`]) !== null
    && parseFighterMetric(fight?.[`fighter2_${suffix}`]) !== null
  ));

  return (
    <section className="fight-performance-comparison" aria-labelledby={`performance-title-${fight.id}`}>
      <div className="matchup-performance-header">
        <div>
          <h4 id={`performance-title-${fight.id}`}>Performance comparison</h4>
          <span>UFC career stats</span>
        </div>
      </div>

      <div className="matchup-sticky-identities" aria-label={`${fight.fighter1_name} in the red corner versus ${fight.fighter2_name} in the blue corner`}>
        <div className="matchup-identity matchup-identity--red">
          <span><i className="matchup-legend-dot matchup-legend-dot--red" aria-hidden="true" />Red corner</span>
          <strong>{fight.fighter1_name}</strong>
        </div>
        <span className="matchup-identity-vs" aria-hidden="true">VS</span>
        <div className="matchup-identity matchup-identity--blue">
          <span>Blue corner<i className="matchup-legend-dot matchup-legend-dot--blue" aria-hidden="true" /></span>
          <strong>{fight.fighter2_name}</strong>
        </div>
      </div>

      <div className={`matchup-performance-body${hasRadar ? '' : ' matchup-performance-body--without-radar'}`}>
        {hasRadar && <MatchupRadar fight={fight} />}
        <div className="matchup-metric-groups">
          {PERFORMANCE_GROUPS.map((group) => {
            const visibleMetrics = group.metrics.filter(({ suffix }) => (
              parseFighterMetric(fight?.[`fighter1_${suffix}`]) !== null
              || parseFighterMetric(fight?.[`fighter2_${suffix}`]) !== null
            ));
            if (visibleMetrics.length === 0) return null;
            return (
              <section className="matchup-metric-group" key={group.label}>
                <h5>{group.label}</h5>
                <div className="matchup-metric-grid">
                  {visibleMetrics.map((metric) => (
                    <PerformanceMetricRow key={metric.suffix} fight={fight} metric={metric} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinishMethodBreakdown({ fight, fighterKey }) {
  const recordTotals = parseRecordTotals(fight?.[`${fighterKey}_record`]);
  const hasAnyMethodData = FINISH_METHOD_BREAKDOWN.some(({ winsKey, lossesKey }) => (
    hasMethodValue(fight?.[`${fighterKey}_${winsKey}`]) ||
    hasMethodValue(fight?.[`${fighterKey}_${lossesKey}`])
  ));

  if (!hasAnyMethodData) {
    return (
      <div className={`finish-method-breakdown finish-method-breakdown--${fighterKey} finish-method-breakdown--empty`}>
        <div className="finish-method-breakdown-header">
          <span className="finish-method-breakdown-title">Method Breakdown</span>
          <span className="finish-method-breakdown-empty-copy">Unavailable</span>
        </div>
      </div>
    );
  }

  const rows = FINISH_METHOD_BREAKDOWN.map(({ label, winsKey, lossesKey }) => ({
    label,
    wins: parseMethodCount(fight?.[`${fighterKey}_${winsKey}`]),
    losses: parseMethodCount(fight?.[`${fighterKey}_${lossesKey}`])
  }));

  const fallbackWins = rows.reduce((total, row) => total + row.wins, 0);
  const fallbackLosses = rows.reduce((total, row) => total + row.losses, 0);
  const totalWins = recordTotals.wins || fallbackWins;
  const totalLosses = recordTotals.losses || fallbackLosses;
  const maximumMethodCount = Math.max(1, ...rows.flatMap((row) => [row.wins, row.losses]));

  return (
    <div className={`finish-method-breakdown finish-method-breakdown--${fighterKey}`}>
      <div className="finish-method-breakdown-header">
        <span className="finish-method-breakdown-title">Fight outcomes by method</span>
        <span className="finish-method-breakdown-summary">
          {totalWins} wins · {totalLosses} losses
        </span>
      </div>
      <div
        className="finish-method-chart"
        role="img"
        aria-label={rows.map((row) => `${row.label}: ${row.wins} wins and ${row.losses} losses`).join('. ')}
      >
        <div className="finish-method-chart-head" aria-hidden="true">
          <span>Wins</span>
          <span>Method</span>
          <span>Losses</span>
        </div>
        {rows.map((row) => {
          const winWidth = getMethodWidth(row.wins, maximumMethodCount);
          const lossWidth = getMethodWidth(row.losses, maximumMethodCount);

          return (
            <div
              key={row.label}
              className="finish-method-row"
              aria-label={`${row.label}: ${row.wins} wins and ${row.losses} losses by this method`}
            >
              <div className="finish-method-side finish-method-side--wins" aria-hidden="true">
                <strong>{row.wins}</strong>
                <div className="finish-method-track">
                  <span className="finish-method-fill finish-method-fill--win" style={{ width: `${winWidth}%` }} />
                </div>
              </div>
              <span className="finish-method-name" aria-hidden="true">{row.label}</span>
              <div className="finish-method-side finish-method-side--losses" aria-hidden="true">
                <div className="finish-method-track">
                  <span className="finish-method-fill finish-method-fill--loss" style={{ width: `${lossWidth}%` }} />
                </div>
                <strong>{row.losses}</strong>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Fights({
  eventId,
  username,
  user_id,
  user_type,
  onLeaderboardRefresh,
  refreshToken = 0,
  isEventComplete = false,
  showAIUsers = false,
}) {
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
  const [isRefreshingFightCard, setIsRefreshingFightCard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedEventId, setLoadedEventId] = useState(null);
  const [error, setError] = useState('');
  const [submittedFights, setSubmittedFights] = useState(() => {
    // Initialize from localStorage if available, will be updated with API data
    const saved = localStorage.getItem(`submittedFights_${eventId}_${username}`);
    return saved ? JSON.parse(saved) : {};
  });
  const [voteErrors, setVoteErrors] = useState({});
  const [pendingVotes, setPendingVotes] = useState({});
  const [expandedFights, setExpandedFights] = useState({});
  const [fightVotes, setFightVotes] = useState({});
  const [voteCounts, setVoteCounts] = useState({}); // Store vote counts (total + human) for button ratio
  const [recentPick, setRecentPick] = useState(null);
  const [changeableFightId, setChangeableFightId] = useState(null);
  const [pickConfirmation, setPickConfirmation] = useState(null);
  const showAIVotes = showAIUsers;
  const [expandedFightStats, setExpandedFightStats] = useState({});
  const [expandedAdminControls, setExpandedAdminControls] = useState({});
  const [editingFight, setEditingFight] = useState(null);
  const [predictionHistory, setPredictionHistory] = useState([]);
  const [rivalryMarkers, setRivalryMarkers] = useState({ pickTwinUserId: null, nemesisUserId: null });
  const [showFloatingVoteProgress, setShowFloatingVoteProgress] = useState(false);
  const [voteReminders, setVoteReminders] = useState(() => {
    const saved = localStorage.getItem(reminderStorageKey);
    return saved ? JSON.parse(saved) : {};
  });
  const [reminderAnimations, setReminderAnimations] = useState({});
  const reminderAnimationTimeoutsRef = useRef(new Map());
  const recentPickTimeoutRef = useRef(null);
  const firstFightRef = useRef(null);
  const fightCardRefs = useRef(new Map());
  const scheduledFightScrollRef = useRef(null);
  const initialFightScrollKeyRef = useRef(null);
  const fightsRef = useRef([]);
  const activeEventIdRef = useRef(eventId);
  const fightCardRefreshInFlightRef = useRef(false);
  const eventLiveStateRef = useRef(null);
  const eventStateRefreshInFlightRef = useRef(false);

  const scheduleFightScroll = useCallback((fightId, behavior = 'smooth') => {
    if (fightId === null || fightId === undefined || typeof window === 'undefined') return;

    if (scheduledFightScrollRef.current !== null) {
      window.cancelAnimationFrame(scheduledFightScrollRef.current);
    }

    scheduledFightScrollRef.current = window.requestAnimationFrame(() => {
      scheduledFightScrollRef.current = null;
      const fightElement = fightCardRefs.current.get(String(fightId));
      if (!fightElement) return;

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      fightElement.scrollIntoView({
        block: 'start',
        behavior: reduceMotion ? 'auto' : behavior,
      });
    });
  }, []);

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
    fightsRef.current = fights;
  }, [fights]);

  useEffect(() => {
    activeEventIdRef.current = eventId;
    eventLiveStateRef.current = null;
  }, [eventId]);

  const allFightsResolved = fights.length > 0
    && fights.every((fight) => fight.is_completed || fight.is_canceled);

  const refreshFightCard = useCallback(async ({ showIndicator = false } = {}) => {
    if (!eventId || fightCardRefreshInFlightRef.current) return;

    const requestedEventId = eventId;
    fightCardRefreshInFlightRef.current = true;
    if (showIndicator) {
      setError('');
      setIsRefreshingFightCard(true);
    }

    try {
      const incoming = await cachedFetchJson(`${API_URL}/events/${requestedEventId}/fights`, {
        cacheKey: `fight-card-live:${requestedEventId}`,
        force: true,
        allowStaleOnError: false,
        fetchOptions: { cache: 'no-store' },
      });
      const incomingFights = (Array.isArray(incoming) ? incoming : []).map((fight) => ({
        ...fight,
        fighter1_id: String(fight.fighter1_id),
        fighter2_id: String(fight.fighter2_id),
      }));
      if (String(activeEventIdRef.current) !== String(requestedEventId)) return;

      const currentFights = fightsRef.current;

      if (!haveFightCardsChanged(currentFights, incomingFights)) return;

      const resultsChanged = haveFightResultsChanged(currentFights, incomingFights);
      fightsRef.current = incomingFights;
      setFights(incomingFights);
      invalidateCache(`picks-context:${user_id}:${requestedEventId}`);

      if (resultsChanged) {
        invalidateLeaderboardCaches(requestedEventId);
        onLeaderboardRefresh?.();
      }
    } catch (refreshError) {
      console.warn('Fight card refresh failed:', refreshError);
      if (showIndicator) {
        setError('Could not refresh fights. The current card is still shown.');
      }
    } finally {
      fightCardRefreshInFlightRef.current = false;
      if (showIndicator) setIsRefreshingFightCard(false);
    }
  }, [eventId, invalidateLeaderboardCaches, onLeaderboardRefresh, user_id]);

  const refreshEventLiveState = useCallback(async () => {
    if (!eventId || eventStateRefreshInFlightRef.current) return;

    const requestedEventId = eventId;
    eventStateRefreshInFlightRef.current = true;
    try {
      const incomingState = await cachedFetchJson(`${API_URL}/events/${requestedEventId}/live-state`, {
        cacheKey: `event-live-state:${requestedEventId}`,
        force: true,
        allowStaleOnError: false,
        privateCache: true,
        fetcher: fetchWithUserSession,
        fetchOptions: { cache: 'no-store' },
      });
      if (String(activeEventIdRef.current) !== String(requestedEventId)) return;

      const previousState = eventLiveStateRef.current;
      eventLiveStateRef.current = incomingState;
      const changes = getEventLiveStateChanges(previousState, incomingState);

      if (changes.cardChanged || changes.resultsChanged) {
        await refreshFightCard();
      }
    } catch (refreshError) {
      console.warn('Event state refresh failed:', refreshError);
    } finally {
      eventStateRefreshInFlightRef.current = false;
    }
  }, [eventId, refreshFightCard]);

  useEffect(() => {
    if (!shouldPollFightCard({
      isEventComplete,
      allFightsResolved,
      visibilityState: document.visibilityState,
    })) {
      return undefined;
    }

    const refreshInterval = window.setInterval(() => {
      if (shouldPollFightCard({
        isEventComplete,
        allFightsResolved,
        visibilityState: document.visibilityState,
      })) {
        refreshEventLiveState();
      }
    }, EVENT_STATE_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(refreshInterval);
  }, [allFightsResolved, isEventComplete, refreshEventLiveState]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!shouldPollFightCard({
        isEventComplete,
        allFightsResolved,
        visibilityState: document.visibilityState,
      })) {
        return;
      }
      refreshEventLiveState();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [allFightsResolved, isEventComplete, refreshEventLiveState]);

  useEffect(() => () => {
    reminderAnimationTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    reminderAnimationTimeoutsRef.current.clear();
    if (scheduledFightScrollRef.current !== null) {
      window.cancelAnimationFrame(scheduledFightScrollRef.current);
    }
    if (recentPickTimeoutRef.current) {
      window.clearTimeout(recentPickTimeoutRef.current);
    }
  }, []);

  const renderFighterRank = (rank) => {
    if (rank === 0) {
      return <span className="champion-rank">C</span>;
    }

    if (!rank) {
      return 'NR';
    }

    const numericRank = Number(rank);
    const isUnofficialRank = Number.isFinite(numericRank) && numericRank > 15;

    return (
      <span className="fighter-rank-value">
        <span>{rank}</span>
        {isUnofficialRank && (
          <span className="rank-tooltip-wrap" title="Unofficial rank by Tapology">
            <span
              className="rank-tooltip-trigger"
              aria-label="Unofficial rank by Tapology"
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

  const renderFighterChoiceCard = (fight, fighterKey) => {
    const fighterId = fight[`${fighterKey}_id`];
    const fighterName = fight[`${fighterKey}_name`];
    const isSelected = String(submittedFights[fight.id] || '') === String(fighterId);
    const canChange = String(changeableFightId || '') === String(fight.id);
    const isUnavailable = fight.is_completed || fight.is_canceled;
    const isDisabled = isUnavailable || Boolean(pendingVotes[fight.id]) || (Boolean(submittedFights[fight.id]) && !canChange);
    const resultClassName = fight.is_completed
      ? fight.winner
        ? String(fight.winner) === String(fighterId) ? 'winner' : 'loser'
        : 'neutral-result'
      : isSelected
        ? 'selected'
        : (submittedFights[fight.id] && !canChange) ? 'unselected' : '';
    const pickLabel = isUnavailable
      ? `${fighterName}${fight.is_completed ? ', fight complete' : ', fight canceled'}`
      : isSelected && canChange
        ? `Keep ${fighterName} as your pick`
        : canChange
          ? `Change your pick to ${fighterName}`
          : `Pick ${fighterName}`;

    return (
      <div className={`fighter-card ${resultClassName}`}>
        <button
          type="button"
          className="fighter-choice-button"
          onClick={() => handleFighterChoice(fight.id, fighterId, fighterName)}
          disabled={isDisabled}
          aria-label={pickLabel}
          aria-pressed={isSelected}
          aria-busy={Boolean(pendingVotes[fight.id])}
        >
          <FighterFlagBackground
            bornCountry={fight[`${fighterKey}_born_country`]}
            fightingOutOfCountry={fight[`${fighterKey}_country`]}
          />
          <div className="fighter-image-container">
            <img
              src={fight[`${fighterKey}_image`]}
              alt={fighterName}
              className="fighter-image"
              loading="lazy"
              decoding="async"
            />
            <FighterReminderOverlay
              fighterName={fighterName}
              reminderType={getReminderType(fighterId)}
              animation={reminderAnimations[String(fighterId)] || null}
            />
          </div>
          <h3 className="fighter-name">
            <span className="fighter-name-text">{fight[`${fighterKey}_firstName`]}</span>
            {fight[`${fighterKey}_nickname`] && (
              <span className="fighter-nickname">{fight[`${fighterKey}_nickname`]}</span>
            )}
            <span className="fighter-name-text">{fight[`${fighterKey}_lastName`]}</span>
          </h3>
          <div className="stat-container">
            <div className="stat-row">
              <span className="stat-label">Rank</span>
              <span>{renderFighterRank(fight[`${fighterKey}_rank`])}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Record</span>
              <span>{fight[`${fighterKey}_record`] ? fight[`${fighterKey}_record`].split('-').join(' - ') : 'N/A'}</span>
            </div>
            <div className="stat-row odds-row">
              <span className="stat-label">Odds</span>
              <span className={parseInt(fight[`${fighterKey}_odds`], 10) < 0 ? 'favorite-odds' : 'underdog-odds'}>
                {fight[`${fighterKey}_odds`] || 'N/A'}
              </span>
            </div>
          </div>
          {isSelected && <div className="vote-badge">Your Pick</div>}
        </button>

        {expandedFightStats[fight.id] && (
          <div className="expanded-stats">
            <FighterDetailSections fight={fight} fighterKey={fighterKey} />
            <FinishMethodBreakdown fight={fight} fighterKey={fighterKey} />
            {(() => {
              const lastVoteOutcome = getLastVoteOutcomeForFighter(fight, fighterId);
              return lastVoteOutcome ? (
                <div className="last-vote-outcome">
                  Last time you voted for this fighter, they {lastVoteOutcome}.
                </div>
              ) : null;
            })()}
            {hasVoteReminder(fighterId) && (
              <div className="vote-reminder-status">
                {getReminderStatusMessage(fighterId)}
              </div>
            )}
            <div className="vote-reminder-controls">
              <span className="vote-reminder-prompt">Your take</span>
              <div className="vote-reminder-options">
                <button
                  type="button"
                  className={`vote-reminder-button ${getReminderType(fighterId) === REMINDER_TYPE_BROKEN_HEART ? 'active active-broken-heart' : ''}`}
                  onClick={() => toggleVoteReminderType(fighterId, fighterName, REMINDER_TYPE_BROKEN_HEART)}
                  aria-label={`Dislike ${fighterName}`}
                  aria-pressed={getReminderType(fighterId) === REMINDER_TYPE_BROKEN_HEART}
                  title="Dislike fighter"
                >
                  <span aria-hidden="true">💔</span>
                  <span>Dislike</span>
                </button>
                <button
                  type="button"
                  className={`vote-reminder-button ${getReminderType(fighterId) === REMINDER_TYPE_HEART_EYES ? 'active active-heart-eyes' : ''}`}
                  onClick={() => toggleVoteReminderType(fighterId, fighterName, REMINDER_TYPE_HEART_EYES)}
                  aria-label={`Like ${fighterName}`}
                  aria-pressed={getReminderType(fighterId) === REMINDER_TYPE_HEART_EYES}
                  title="Like fighter"
                >
                  <span aria-hidden="true">😍</span>
                  <span>Like</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Admin function to handle fight result updates
  const handleResultUpdate = async (fightId, winner, resultType = winner ? 'winner' : null) => {
    try {
      const response = await fetchWithAdminSession(`${API_URL}/ufc_full_fight_card/${fightId}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ winner, result_type: resultType }),
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
      // Null is meaningful for draws, no contests, and cleared results.
      mergedFight.winner = updatedFight.winner ?? null;
      mergedFight.result_type = updatedFight.result_type ?? null;
      mergedFight.is_completed = Boolean(updatedFight.is_completed);

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

  // Load one event-scoped payload instead of issuing overlapping picks requests.
  useEffect(() => {
    let cancelled = false;
    if (!eventId || !user_id) return () => { cancelled = true; };

    setLoading(true);
    setLoadedEventId(null);
    setError('');
    cachedFetchJson(`${API_URL}/events/${eventId}/picks-context`, {
      ttlMs: 30000,
      cacheKey: `picks-context:${user_id}:${eventId}`,
      privateCache: true,
      staleWhileRevalidate: refreshToken === 0,
      force: refreshToken > 0,
      fetcher: fetchWithUserSession,
      fetchOptions: { cache: 'no-store' },
    })
      .then((context) => {
        if (cancelled) return;
        const fightsData = Array.isArray(context?.fights) ? context.fights : [];
        setFights(fightsData.map((fight) => ({
          ...fight,
          fighter1_id: String(fight.fighter1_id),
          fighter2_id: String(fight.fighter2_id),
        })));
        setSubmittedFights(context?.submitted_picks || {});
        setPredictionHistory(context?.prior_pick_outcomes || []);
        const mappedCounts = {};
        fightsData.forEach((fight) => {
          const fighterMap = context?.vote_counts?.[String(fight.id)] || {};
          mappedCounts[String(fight.id)] = {
            fighter1: fighterMap[String(fight.fighter1_id)] || { total: 0, human: 0 },
            fighter2: fighterMap[String(fight.fighter2_id)] || { total: 0, human: 0 },
          };
        });
        setVoteCounts(mappedCounts);
        const normalizedReminders = normalizeReminderMap(context?.reminders || []);
        setVoteReminders(normalizedReminders);
        localStorage.setItem(reminderStorageKey, JSON.stringify(normalizedReminders));
        eventLiveStateRef.current = context?.live_state || null;
        setLoadedEventId(String(eventId));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error fetching picks context:', err);
        setError('Failed to load picks for this event');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [eventId, user_id, refreshToken, normalizeReminderMap, reminderStorageKey]);

  useEffect(() => {
    const scrollKey = `${eventId}:${user_id}`;
    if (
      loading ||
      loadedEventId !== String(eventId) ||
      initialFightScrollKeyRef.current === scrollKey
    ) {
      return;
    }

    initialFightScrollKeyRef.current = scrollKey;
    const targetFightId = getInitialFightTargetId(fights, submittedFights);
    if (targetFightId !== null) {
      scheduleFightScroll(targetFightId, 'auto');
    }
  }, [eventId, fights, loadedEventId, loading, scheduleFightScroll, submittedFights, user_id]);

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

  // Save submittedFights to localStorage whenever it changes
  useEffect(() => {
    if (eventId && username) {
      localStorage.setItem(`submittedFights_${eventId}_${username}`, JSON.stringify(submittedFights));
    }
  }, [submittedFights, eventId, username]);

  useEffect(() => {
    localStorage.setItem(reminderStorageKey, JSON.stringify(voteReminders));
  }, [voteReminders, reminderStorageKey]);

  useEffect(() => {
    const firstFightElement = firstFightRef.current;
    const floatingProgressOffset = 88;

    if (!firstFightElement || typeof window === 'undefined') {
      setShowFloatingVoteProgress(false);
      return undefined;
    }

    const updateFloatingVoteProgressVisibility = () => {
      const firstFightTop = firstFightElement.getBoundingClientRect().top;
      setShowFloatingVoteProgress(firstFightTop <= floatingProgressOffset);
    };

    updateFloatingVoteProgressVisibility();
    window.addEventListener('scroll', updateFloatingVoteProgressVisibility, { passive: true });
    window.addEventListener('resize', updateFloatingVoteProgressVisibility);

    return () => {
      window.removeEventListener('scroll', updateFloatingVoteProgressVisibility);
      window.removeEventListener('resize', updateFloatingVoteProgressVisibility);
    };
  }, [fights, eventId]);

  // Clear transient pick controls when the active event changes.
  useEffect(() => {
    setPendingVotes({});
    setRecentPick(null);
    setChangeableFightId(null);
    setPickConfirmation(null);
    if (recentPickTimeoutRef.current) {
      window.clearTimeout(recentPickTimeoutRef.current);
      recentPickTimeoutRef.current = null;
    }
  }, [username, eventId]);

  const loadFightVotes = useCallback(async (fightId) => {
    const response = await fetchWithUserSession(
      `${API_URL}/fights/${encodeURIComponent(fightId)}/votes`
    );
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Failed to load votes');
    }

    const { fighter1Votes = [], fighter2Votes = [] } = await response.json();
    setFightVotes((previous) => ({
      ...previous,
      [fightId]: { fighter1Votes, fighter2Votes },
    }));

    const fighter1Human = fighter1Votes.filter((vote) => !vote.is_bot).length;
    const fighter2Human = fighter2Votes.filter((vote) => !vote.is_bot).length;
    setVoteCounts((previous) => ({
      ...previous,
      [fightId]: {
        fighter1: { total: fighter1Votes.length, human: fighter1Human },
        fighter2: { total: fighter2Votes.length, human: fighter2Human },
      },
    }));
  }, []);

  const clearRecentPick = useCallback(() => {
    if (recentPickTimeoutRef.current) {
      window.clearTimeout(recentPickTimeoutRef.current);
      recentPickTimeoutRef.current = null;
    }
    setRecentPick(null);
  }, []);

  const showRecentPick = useCallback((pick) => {
    if (recentPickTimeoutRef.current) {
      window.clearTimeout(recentPickTimeoutRef.current);
    }
    setRecentPick(pick);
    recentPickTimeoutRef.current = window.setTimeout(() => {
      setRecentPick(null);
      recentPickTimeoutRef.current = null;
    }, PICK_UNDO_WINDOW_MS);
  }, []);

  const adjustVoteCountsForPick = useCallback((fight, previousFighterId, nextFighterId) => {
    if (!fight || String(previousFighterId || '') === String(nextFighterId || '')) return;
    const getCornerKey = (fighterId) => {
      if (String(fighterId) === String(fight.fighter1_id)) return 'fighter1';
      if (String(fighterId) === String(fight.fighter2_id)) return 'fighter2';
      return null;
    };
    const previousKey = getCornerKey(previousFighterId);
    const nextKey = getCornerKey(nextFighterId);

    setVoteCounts((currentCounts) => {
      const current = currentCounts[fight.id] || {
        fighter1: { total: 0, human: 0 },
        fighter2: { total: 0, human: 0 },
      };
      const next = {
        fighter1: { ...current.fighter1 },
        fighter2: { ...current.fighter2 },
      };
      if (previousKey) {
        next[previousKey].total = Math.max(0, next[previousKey].total - 1);
        next[previousKey].human = Math.max(0, next[previousKey].human - 1);
      }
      if (nextKey) {
        next[nextKey].total += 1;
        next[nextKey].human += 1;
      }
      return { ...currentCounts, [fight.id]: next };
    });
  }, []);

  const handleSubmitVote = async (fightId, fighterId, fighterName) => {
    if (!user_id) {
      setVoteErrors(prev => ({ ...prev, [fightId]: 'Please log in to vote' }));
      return;
    }
    if (!fighterId) {
      setVoteErrors(prev => ({ ...prev, [fightId]: 'No fighter selected' }));
      return;
    }

    const fightKey = String(fightId);
    const previousSubmitted = submittedFights[fightId];
    if (String(previousSubmitted || '') === String(fighterId)) {
      setChangeableFightId(null);
      return;
    }

    setPendingVotes((current) => ({ ...current, [fightId]: true }));
    setSubmittedFights((current) => ({ ...current, [fightId]: fighterId }));
    setChangeableFightId(null);
    try {
      const response = await fetchWithUserSession(`${API_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fightId,
          fighter_id: fighterId,
          selected_fighter: fighterId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        console.error('Server error on vote submission:', errorData);
        setVoteErrors(prev => ({ ...prev, [fightId]: `Server error: ${errorData.error || 'Failed to submit vote'}` }));
        throw new Error(errorData.error || 'Failed to submit vote');
      }

      setSubmittedFights(prev => ({ ...prev, [fightId]: fighterId }));
      setVoteErrors(prev => ({ ...prev, [fightId]: '' }));

      const nextFightId = getNextUnvotedFightId(fights, {
        ...submittedFights,
        [fightId]: fighterId,
      });
      if (nextFightId !== null) {
        scheduleFightScroll(nextFightId);
      }

      const fight = fights.find(f => String(f.id) === fightKey);
      adjustVoteCountsForPick(fight, previousSubmitted, fighterId);
      showRecentPick({
        fightId,
        fighterId,
        fighterName: fighterName || (String(fighterId) === String(fight?.fighter1_id)
          ? fight?.fighter1_name
          : fight?.fighter2_name),
        previousFighterId: previousSubmitted || null,
      });

      invalidateCache(`picks-context:${user_id}:${eventId}`);

      if (expandedFights[fightId]) {
        loadFightVotes(fightId).catch((loadError) => {
          console.error('Error refreshing fight votes:', loadError);
        });
      }
    } catch (err) {
      console.error('Error submitting prediction:', err);
      setSubmittedFights((current) => {
        const next = { ...current };
        if (previousSubmitted) next[fightId] = previousSubmitted;
        else delete next[fightId];
        return next;
      });
      setVoteErrors(prev => ({ ...prev, [fightId]: `Failed to submit prediction: ${err.message}` }));
      if (previousSubmitted) setChangeableFightId(fightId);
    } finally {
      setPendingVotes((current) => ({ ...current, [fightId]: false }));
    }
  };

  const handleFighterChoice = (fightId, fighterId, fighterName) => {
    const fight = fights.find((candidate) => String(candidate.id) === String(fightId));
    const canChange = String(changeableFightId || '') === String(fightId);
    if (!fight || fight.is_completed || fight.is_canceled || pendingVotes[fightId]) return;
    if (submittedFights[fightId] && !canChange) return;
    if (String(submittedFights[fightId] || '') === String(fighterId)) {
      setChangeableFightId(null);
      return;
    }

    const reminder = voteReminders[String(fighterId)];
    const reminderType = reminder?.reminderType || REMINDER_TYPE_BROKEN_HEART;
    if (reminder && reminderType === REMINDER_TYPE_BROKEN_HEART) {
      setPickConfirmation({ fightId, fighterId, fighterName });
      return;
    }

    void handleSubmitVote(fightId, fighterId, fighterName);
  };

  const handleUndoRecentPick = async () => {
    const pick = recentPick;
    if (!pick || pendingVotes[pick.fightId]) return;
    clearRecentPick();
    setPendingVotes((current) => ({ ...current, [pick.fightId]: true }));
    try {
      const response = pick.previousFighterId
        ? await fetchWithUserSession(`${API_URL}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fightId: pick.fightId,
            fighter_id: pick.previousFighterId,
            selected_fighter: pick.previousFighterId,
          }),
        })
        : await fetchWithUserSession(`${API_URL}/predictions/${encodeURIComponent(pick.fightId)}`, {
          method: 'DELETE',
        });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to undo pick');
      }

      setSubmittedFights((current) => {
        const next = { ...current };
        if (pick.previousFighterId) next[pick.fightId] = pick.previousFighterId;
        else delete next[pick.fightId];
        return next;
      });
      const fight = fights.find((candidate) => String(candidate.id) === String(pick.fightId));
      adjustVoteCountsForPick(fight, pick.fighterId, pick.previousFighterId);
      setVoteErrors((current) => ({ ...current, [pick.fightId]: '' }));
      invalidateCache(`picks-context:${user_id}:${eventId}`);
      if (expandedFights[pick.fightId]) {
        loadFightVotes(pick.fightId).catch((loadError) => {
          console.error('Error refreshing fight votes after undo:', loadError);
        });
      }
    } catch (undoError) {
      setVoteErrors((current) => ({
        ...current,
        [pick.fightId]: `Could not undo pick: ${undoError.message}`,
      }));
    } finally {
      setPendingVotes((current) => ({ ...current, [pick.fightId]: false }));
    }
  };

  const handleChangeRecentPick = () => {
    if (!recentPick) return;
    const fightId = recentPick.fightId;
    clearRecentPick();
    setChangeableFightId(fightId);
    scheduleFightScroll(fightId);
  };

  const handleConfirmedPick = () => {
    if (!pickConfirmation) return;
    const { fightId, fighterId, fighterName } = pickConfirmation;
    setPickConfirmation(null);
    void handleSubmitVote(fightId, fighterId, fighterName);
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
        await loadFightVotes(fightId);
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
    const isCollapsing = Boolean(expandedFightStats[fightId]);
    setExpandedFightStats(prev => ({
      ...prev,
      [fightId]: !prev[fightId]
    }));

    if (isCollapsing) {
      scheduleFightScroll(fightId);
    }
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

  const triggerReminderAnimation = useCallback((fighterId, reminderType) => {
    const fighterKey = String(fighterId);
    const nonce = Date.now();
    const currentTimeout = reminderAnimationTimeoutsRef.current.get(fighterKey);
    if (currentTimeout) clearTimeout(currentTimeout);

    setReminderAnimations(prev => ({
      ...prev,
      [fighterKey]: { reminderType, nonce }
    }));

    const timeoutId = setTimeout(() => {
      setReminderAnimations(prev => {
        if (prev[fighterKey]?.nonce !== nonce) return prev;
        const next = { ...prev };
        delete next[fighterKey];
        return next;
      });
      reminderAnimationTimeoutsRef.current.delete(fighterKey);
    }, 650);
    reminderAnimationTimeoutsRef.current.set(fighterKey, timeoutId);
  }, []);

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
    triggerReminderAnimation(fighterId, reminderType);

    if (!user_id) {
      return;
    }

    try {
      const response = await fetchWithUserSession(
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
  }, [triggerReminderAnimation, user_id, voteReminders]);

  const clearVoteReminder = useCallback(async (fighterId) => {
    const fighterKey = String(fighterId);
    const previousReminders = voteReminders;
    const nextReminders = { ...previousReminders };
    delete nextReminders[fighterKey];
    setVoteReminders(nextReminders);
    const activeAnimationTimeout = reminderAnimationTimeoutsRef.current.get(fighterKey);
    if (activeAnimationTimeout) clearTimeout(activeAnimationTimeout);
    reminderAnimationTimeoutsRef.current.delete(fighterKey);
    setReminderAnimations(prev => {
      if (!prev[fighterKey]) return prev;
      const next = { ...prev };
      delete next[fighterKey];
      return next;
    });

    if (!user_id) {
      return;
    }

    try {
      const response = await fetchWithUserSession(
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

  const toggleVoteReminderType = useCallback((fighterId, fighterName, reminderType) => {
    if (getReminderType(fighterId) === reminderType) {
      return clearVoteReminder(fighterId);
    }
    return setVoteReminderType(fighterId, fighterName, reminderType);
  }, [clearVoteReminder, getReminderType, setVoteReminderType]);

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
    <div className="fights-container">
      {recentPick && (
        <div className="pick-save-toast">
          <div className="pick-save-toast__copy" role="status" aria-live="polite" aria-atomic="true">
            <strong>Pick saved</strong>
            <span>{recentPick.fighterName}</span>
          </div>
          <div className="pick-save-toast__actions">
            <button type="button" onClick={handleUndoRecentPick}>Undo</button>
            <button type="button" onClick={handleChangeRecentPick}>Change</button>
          </div>
        </div>
      )}
      <div className="fights-header">
        <h2 className="app-section-heading fights-title">Upcoming Fights</h2>
        <div className="fight-card-refresh-controls">
          {!isEventComplete && !allFightsResolved && (
            <span className="fight-card-refresh-status">Auto-refresh on</span>
          )}
          <button
            type="button"
            className={`fight-card-refresh-button${isRefreshingFightCard ? ' is-refreshing' : ''}`}
            onClick={() => refreshFightCard({ showIndicator: true })}
            disabled={isRefreshingFightCard}
            aria-label="Refresh fight card"
            title="Refresh fight card"
          >
            <span aria-hidden="true">↻</span>
          </button>
        </div>
      </div>

      <div className="fights-content">
        {error && (
          // Global error (e.g. from fetching fights) is still displayed at the top
          <div className="error-message">{error}</div>
        )}

        {eventVoteProgress && showFloatingVoteProgress && (
          <div className="floating-vote-progress" aria-live="polite" aria-atomic="true">
            <span className="floating-vote-progress-primary">{eventVoteProgress.label}</span>
            <span className="floating-vote-progress-secondary">{eventVoteProgress.progress}</span>
          </div>
        )}

        {fights.map((fight) => {
          const fightFormatDetails = getFightFormatDetails(fight);
          const hasFightMeta = fight.card_tier || fight.weightclass || fight.is_canceled || fightFormatDetails || fight.referee;
          const fightCardClassName = `fight-card ${fight.is_completed ? 'completed' : ''} ${fight.is_canceled ? 'canceled' : ''} ${fight.is_title_fight ? 'title-fight' : ''}`.trim();
          const neutralResultLabel = RESULT_TYPE_LABELS[fight.result_type] || null;

          return (
        <div
          key={fight.id}
          className={fightCardClassName}
          data-result-label={neutralResultLabel || (fight.is_completed ? 'Fight Completed' : undefined)}
          data-fight-id={fight.id}
          ref={(node) => {
            const fightKey = String(fight.id);
            if (node) fightCardRefs.current.set(fightKey, node);
            else fightCardRefs.current.delete(fightKey);
            if (fight === fights[0]) firstFightRef.current = node;
          }}
        >
          {hasFightMeta && (
            <div className="fight-meta">
              {fight.is_title_fight && (
                <div className="title-fight-badge">Title Fight</div>
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
                  {fight.referee && (
                    <p className="fight-referee">Referee {fight.referee}</p>
                  )}
                </div>
              )}
              {!fight.weightclass && fightFormatDetails && (
                <p className="fight-format-details">{fightFormatDetails}</p>
              )}
              {!fight.weightclass && fight.referee && (
                <p className="fight-referee">Referee {fight.referee}</p>
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
            {renderFighterChoiceCard(fight, 'fighter1')}

            <div className="vs-text">VS</div>

            {/* Fighter 2 Card */}
            {renderFighterChoiceCard(fight, 'fighter2')}
          </div>

          {expandedFightStats[fight.id] && (
            <FightPerformanceComparison fight={fight} />
          )}

          {/* Add the single expand button after the fighters container */}
          <button 
            className="expand-stats-button"
            onClick={(e) => toggleFightStats(fight.id, e)}
            aria-expanded={Boolean(expandedFightStats[fight.id])}
            aria-label={`${expandedFightStats[fight.id] ? 'Collapse' : 'Expand'} stats for ${fight.fighter1_name} versus ${fight.fighter2_name}`}
          >
            {expandedFightStats[fight.id] ? '▲' : '▼'}
          </button>

          {/* Display vote error for this fight if it exists */}
          {voteErrors[fight.id] && (
            <div className="error-message">{voteErrors[fight.id]}</div>
          )}

          {String(changeableFightId || '') === String(fight.id) && (
            <div className="pick-change-hint" role="status">
              <span>Choose another fighter. Your current pick stays saved until the change succeeds.</span>
              <button type="button" onClick={() => setChangeableFightId(null)}>Cancel</button>
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
                        background: `linear-gradient(90deg, rgba(233, 23, 13, 0.8) ${split}%, rgba(43, 49, 178, 0.8) ${split}%)`,
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
                  ) : fight.is_completed && editingFight !== fight.id ? (
                    <div className="admin-result-display">
                      <span className="winner-text">
                        {fight.winner
                          ? `Winner: ${String(fight.winner) === String(fight.fighter1_id) ? fight.fighter1_name : fight.fighter2_name}`
                          : RESULT_TYPE_LABELS[fight.result_type] || 'Completed'}
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
                  ) : (editingFight === fight.id || !fight.is_completed) && (
                    <div className="admin-result-editor">
                      <div className="admin-buttons">
                        <button
                          className={`admin-winner-button ${String(fight.winner) === String(fight.fighter1_id) ? 'selected' : ''}`}
                          onClick={() => handleResultUpdate(fight.id, fight.fighter1_id, 'winner')}
                        >
                          {fight.fighter1_name} Won
                        </button>
                        <button
                          className={`admin-winner-button ${String(fight.winner) === String(fight.fighter2_id) ? 'selected' : ''}`}
                          onClick={() => handleResultUpdate(fight.id, fight.fighter2_id, 'winner')}
                        >
                          {fight.fighter2_name} Won
                        </button>
                      </div>
                      <div className="admin-buttons admin-neutral-result-buttons">
                        <button
                          className={`admin-winner-button ${fight.result_type === 'draw' ? 'selected' : ''}`}
                          onClick={() => handleResultUpdate(fight.id, null, 'draw')}
                        >
                          Draw
                        </button>
                        <button
                          className={`admin-winner-button ${fight.result_type === 'no_contest' ? 'selected' : ''}`}
                          onClick={() => handleResultUpdate(fight.id, null, 'no_contest')}
                        >
                          No Contest
                        </button>
                      </div>
                      <div className="admin-action-buttons">
                        {fight.is_completed && (
                          <button
                            className="admin-unselect-button"
                            onClick={() => handleResultUpdate(fight.id, null, null)}
                          >
                            Clear Result
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
      <ConfirmDialog
        open={Boolean(pickConfirmation)}
        title="Pick this fighter anyway?"
        summary={pickConfirmation
          ? `You marked ${pickConfirmation.fighterName} as a fighter you do not trust.`
          : ''}
        details={["We'll save the pick immediately if you continue."]}
        confirmLabel={pickConfirmation ? `Pick ${pickConfirmation.fighterName}` : 'Save pick'}
        onCancel={() => setPickConfirmation(null)}
        onConfirm={handleConfirmedPick}
      />
    </div>
  );
}

export default Fights;
