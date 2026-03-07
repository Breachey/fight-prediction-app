import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_URL } from './config';
import { cachedFetchJson } from './utils/apiCache';
import './HighlightsPage.css';

function CountUp({ value, duration = 900, decimals = 0, suffix = '' }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = Number(value) || 0;
    let frame = null;
    let start = null;

    const tick = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(target * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return <>{display.toFixed(decimals)}{suffix}</>;
}

function AccuracySplitPie({ correct = 0, incorrect = 0, accuracy = 0 }) {
  const safeCorrect = Number(correct) || 0;
  const safeIncorrect = Number(incorrect) || 0;
  const total = Math.max(safeCorrect + safeIncorrect, 0);
  const correctRatio = total > 0 ? safeCorrect / total : 0;
  const degrees = Math.max(0, Math.min(correctRatio * 360, 360));

  return (
    <div className="highlights-accuracy-split">
      <div
        className="highlights-accuracy-pie"
        style={{
          background: `conic-gradient(rgba(97, 168, 240, 0.95) 0deg ${degrees}deg, rgba(228, 93, 107, 0.95) ${degrees}deg 360deg)`
        }}
        role="img"
        aria-label={`Accuracy split: ${safeCorrect} correct and ${safeIncorrect} incorrect picks`}
      >
        <div className="highlights-accuracy-pie-inner">
          <span>{Number(accuracy || 0).toFixed(2)}%</span>
        </div>
      </div>
      <div className="highlights-accuracy-legend">
        <p><span className="is-correct"></span>{safeCorrect} correct</p>
        <p><span className="is-incorrect"></span>{safeIncorrect} incorrect</p>
      </div>
    </div>
  );
}

function PointsTrendChart({ data }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!data || data.length === 0) {
    return <div className="highlights-chart-empty">No event points yet.</div>;
  }

  const width = 760;
  const height = 220;
  const padding = { top: 18, right: 16, bottom: 34, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const allPoints = data.map((item) => Number(item.points) || 0);
  const avgPoints = data
    .map((item) => {
      const numeric = Number(item.avg_points);
      return Number.isFinite(numeric) ? numeric : null;
    })
    .filter((value) => value !== null);
  const combinedValues = [...allPoints, ...avgPoints];
  const minPoint = Math.min(...combinedValues, 0);
  const maxPoint = Math.max(...combinedValues, 1);
  const yMin = minPoint;
  const yMax = maxPoint === yMin ? yMin + 1 : maxPoint;
  const yRange = yMax - yMin;

  const xForIndex = (index) => {
    if (data.length === 1) return padding.left + innerWidth / 2;
    return padding.left + (index / (data.length - 1)) * innerWidth;
  };
  const yForValue = (value) => padding.top + ((yMax - value) / yRange) * innerHeight;

  const pointObjects = data.map((item, index) => ({
    ...item,
    x: xForIndex(index),
    y: yForValue(Number(item.points) || 0),
    avgY: Number.isFinite(Number(item.avg_points))
      ? yForValue(Number(item.avg_points))
      : null
  }));

  const linePath = pointObjects
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  const averagePath = pointObjects
    .filter((point) => point.avgY !== null)
    .map((point) => `${point.x},${point.avgY}`)
    .join(' ');
  const areaPath = `${padding.left},${padding.top + innerHeight} ${linePath} ${pointObjects[pointObjects.length - 1].x},${padding.top + innerHeight}`;
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = yMax - ratio * yRange;
    return {
      y: padding.top + ratio * innerHeight,
      value: Math.round(value)
    };
  });
  let trendline = null;
  if (pointObjects && pointObjects.length >= 2) {
    const n = pointObjects.length;
    const xs = pointObjects.map((_, index) => index);
    const ys = pointObjects.map((point) => Number(point.points) || 0);
    const sumX = xs.reduce((acc, value) => acc + value, 0);
    const sumY = ys.reduce((acc, value) => acc + value, 0);
    const sumXY = xs.reduce((acc, x, index) => acc + x * ys[index], 0);
    const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
    const denominator = n * sumXX - sumX * sumX;
    if (denominator !== 0) {
      const slope = (n * sumXY - sumX * sumY) / denominator;
      const intercept = (sumY - slope * sumX) / n;
      const firstX = 0;
      const lastX = n - 1;
      const firstY = intercept + slope * firstX;
      const lastY = intercept + slope * lastX;
      trendline = {
        x1: pointObjects[0].x,
        y1: yForValue(firstY),
        x2: pointObjects[pointObjects.length - 1].x,
        y2: yForValue(lastY)
      };
    }
  }
  const formatChartDate = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  const clampPercent = (value, min, max) => Math.max(min, Math.min(max, value));
  const showPointTooltip = (point) => {
    const leftPct = clampPercent((point.x / width) * 100, 14, 86);
    const isNearTop = point.y < padding.top + 44;
    const topPct = isNearTop
      ? clampPercent((point.y / height) * 100 + 8, 12, 94)
      : clampPercent((point.y / height) * 100 - 8, 18, 88);
    setHoveredPoint({
      ...point,
      leftPct,
      topPct,
      placement: isNearTop ? 'below' : 'above',
      formattedDate: formatChartDate(point.event_date)
    });
  };

  return (
    <div className="highlights-chart-wrap" onMouseLeave={() => setHoveredPoint(null)}>
      {hoveredPoint ? (
        <div
          className={`highlights-chart-tooltip ${hoveredPoint.placement === 'below' ? 'is-below' : 'is-above'}`}
          style={{ left: `${hoveredPoint.leftPct}%`, top: `${hoveredPoint.topPct}%` }}
          role="status"
          aria-live="polite"
        >
          <p className="highlights-chart-tooltip-title">{hoveredPoint.event_name}</p>
          <p className="highlights-chart-tooltip-meta">
            {hoveredPoint.formattedDate || 'Date unavailable'}
          </p>
          <p className="highlights-chart-tooltip-points">
            {hoveredPoint.points} pts
          </p>
          {Number.isFinite(Number(hoveredPoint.avg_points)) ? (
            <p className="highlights-chart-tooltip-avg">
              Avg user: {Number(hoveredPoint.avg_points).toFixed(2)} pts
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="highlights-chart-legend" aria-hidden="true">
        <span className="highlights-chart-legend-item">
          <span className="highlights-chart-legend-swatch is-user"></span>
          You
        </span>
        <span className="highlights-chart-legend-item">
          <span className="highlights-chart-legend-swatch is-average"></span>
          Avg user
        </span>
        <span className="highlights-chart-legend-item">
          <span className="highlights-chart-legend-swatch is-trend"></span>
          Trend
        </span>
      </div>
      <svg
        className="highlights-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Line chart of points per event by date"
      >
        <defs>
          <linearGradient id="highlightsPointsAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.34)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={padding.left + innerWidth}
              y2={tick.y}
              className="highlights-chart-grid"
            />
            <text
              x={padding.left - 8}
              y={tick.y + 4}
              textAnchor="end"
              className="highlights-chart-axis-label"
            >
              {tick.value}
            </text>
          </g>
        ))}

        <polygon points={areaPath} className="highlights-chart-area" />
        {averagePath ? <polyline points={averagePath} className="highlights-chart-average-line" /> : null}
        {trendline ? (
          <line
            x1={trendline.x1}
            y1={trendline.y1}
            x2={trendline.x2}
            y2={trendline.y2}
            className="highlights-chart-trend-line"
          />
        ) : null}
        <polyline points={linePath} className="highlights-chart-line" />
        {hoveredPoint ? (
          <line
            x1={hoveredPoint.x}
            y1={padding.top}
            x2={hoveredPoint.x}
            y2={padding.top + innerHeight}
            className="highlights-chart-guide-line"
          />
        ) : null}

        {pointObjects.map((point, index) => (
          <g
            key={`${point.event_id}-${index}`}
            className="highlights-chart-point"
            tabIndex={0}
            onMouseEnter={() => showPointTooltip(point)}
            onFocus={() => showPointTooltip(point)}
            onBlur={() => setHoveredPoint((prev) => (prev?.event_id === point.event_id ? null : prev))}
          >
            <circle cx={point.x} cy={point.y} r="10" className="highlights-chart-dot-halo" />
            <circle cx={point.x} cy={point.y} r="4.2" className="highlights-chart-dot" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function HighlightsPage({ user, defaultYear = 2025 }) {
  const params = useParams();
  const navigate = useNavigate();
  const routePeriod = params.period || params.year;
  const selectedPeriod = useMemo(() => {
    const raw = (routePeriod || '').toString().trim().toLowerCase();
    if (raw === 'all-time' || raw === 'alltime' || raw === 'all') {
      return 'all-time';
    }
    const parsed = Number(routePeriod);
    if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100) {
      return String(parsed);
    }
    return String(defaultYear);
  }, [routePeriod, defaultYear]);
  const isAllTime = selectedPeriod === 'all-time';
  const selectedPeriodLabel = isAllTime ? 'All Time' : selectedPeriod;
  const periodOptions = [
    { key: '2026', label: '2026' },
    { key: '2025', label: '2025' },
    { key: 'all-time', label: 'All Time' }
  ];

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [openTooltipId, setOpenTooltipId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.user_id) {
        setError('You need to be logged in to view stats.');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        const endpoint = `${API_URL}/user/${encodeURIComponent(user.user_id)}/highlights/${selectedPeriod}`;
        const payload = await cachedFetchJson(endpoint, {
          ttlMs: 300000,
          cacheKey: `stats:${user.user_id}:${selectedPeriod}:v9`
        });
        if (!cancelled) {
          setData(payload);
        }
      } catch {
        if (!cancelled) {
          setError('Could not load stats right now.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedPeriod, user?.user_id]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (event.target.closest('.highlights-info-wrap')) {
        return;
      }
      setOpenTooltipId(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenTooltipId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const summary = data?.summary;
  const eventRows = data?.events || [];
  const bestEvent = data?.best_event;
  const toughestEvent = data?.toughest_event;
  const fighterInsights = data?.fighter_insights || {};
  const styleInsights = data?.style_insights || {};
  const rivalryInsights = data?.rivalry_insights || {};
  const communityInsights = data?.community_insights || {};
  const momentum = styleInsights?.momentum || {};
  const cornerPerformance = styleInsights?.corner_performance || {};
  const redCorner = cornerPerformance?.red_corner || {};
  const blueCorner = cornerPerformance?.blue_corner || {};
  const favoriteCorner = cornerPerformance?.favorite_corner || null;
  const benchmarkMetrics = data?.benchmarks?.metrics || {};
  const longestStreakLeaderboard = data?.leaderboards?.longest_win_streak || [];

  const navigateToPeriod = (periodKey) => {
    if (!periodKey || periodKey === selectedPeriod) return;
    navigate(`/stats/${periodKey}`);
  };

  const formatSignedPercent = (value) => {
    const numeric = Number(value) || 0;
    const prefix = numeric > 0 ? '+' : '';
    return `${prefix}${numeric.toFixed(2)}%`;
  };

  const formatOdds = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'N/A';
    return numeric > 0 ? `+${numeric}` : `${numeric}`;
  };

  const formatShortDate = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatEventDate = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const normalizeImageUrl = (value) => {
    const rawValue = value;
    if (!rawValue) return '';

    // Some rows may store structured JSON instead of plain URL text.
    if (typeof rawValue === 'object') {
      const candidate = rawValue.url || rawValue.src || rawValue.image_url || '';
      if (!candidate) return '';
      return normalizeImageUrl(candidate);
    }

    const raw = String(rawValue).trim();
    if (!raw) return '';

    if (raw.startsWith('data:') || raw.startsWith('blob:')) {
      return raw;
    }

    if (raw.startsWith('//')) {
      const protocol = typeof window !== 'undefined' ? window.location.protocol || 'https:' : 'https:';
      return `${protocol}${raw}`;
    }

    try {
      // Already absolute (http/https/etc).
      return new URL(raw).toString();
    } catch {
      // Relative path; resolve against API origin.
      try {
        return new URL(raw, API_URL).toString();
      } catch {
        return raw;
      }
    }
  };

  const renderInfoHint = (id, text) => {
    if (!text) return null;
    const isOpen = openTooltipId === id;
    return (
      <div
        className={`highlights-info-wrap ${isOpen ? 'is-open' : ''}`}
        onMouseEnter={() => setOpenTooltipId(id)}
        onMouseLeave={() => setOpenTooltipId((prev) => (prev === id ? null : prev))}
      >
        <button
          type="button"
          className="highlights-info-btn"
          aria-label="Explain this stat"
          aria-expanded={isOpen ? 'true' : 'false'}
          onClick={(event) => {
            event.stopPropagation();
            setOpenTooltipId((prev) => (prev === id ? null : id));
          }}
        >
          ?
        </button>
        <div className="highlights-tooltip" role="tooltip">
          {text}
        </div>
      </div>
    );
  };

  const renderPeriodSwitch = (extraClassName = '') => (
    <div className={`highlights-period-switch ${extraClassName}`.trim()}>
      <span className="highlights-period-switch-label">View</span>
      {periodOptions.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`highlights-period-btn ${selectedPeriod === option.key ? 'is-active' : ''}`}
          onClick={() => navigateToPeriod(option.key)}
          aria-pressed={selectedPeriod === option.key ? 'true' : 'false'}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const renderSectionHeader = (kicker, title, blurb) => (
    <header className="highlights-dashboard-head">
      <p className="highlights-dashboard-kicker">{kicker}</p>
      <h2 className="highlights-dashboard-title">{title}</h2>
      <p className="highlights-dashboard-blurb">{blurb}</p>
    </header>
  );

  const formatTopPercentile = (metric) => {
    if (!metric || !metric.total_users) {
      return null;
    }
    if (Number(metric.total_users) <= 1) {
      return '100';
    }
    const rawTopPercent = Number(metric.top_percent);
    if (!Number.isFinite(rawTopPercent)) {
      return null;
    }
    const percentile = Math.max(0, Math.min(100, 100 - rawTopPercent));
    return percentile.toFixed(1).replace('.0', '');
  };

  const renderBenchmarkMeta = (metricKey, { decimals = 0, suffix = '' } = {}) => {
    const metric = benchmarkMetrics?.[metricKey];
    if (!metric || !metric.total_users) {
      return null;
    }

    const percentile = formatTopPercentile(metric);
    const average = Number(metric.average || 0).toFixed(decimals);
    const diff = Number(metric.difference_from_average || 0);
    const diffPrefix = diff > 0 ? '+' : '';
    const diffThreshold = decimals > 0 ? 0.1 : 1;
    const diffText = Math.abs(diff) < diffThreshold
      ? 'about average'
      : `${diffPrefix}${diff.toFixed(decimals)}${suffix} vs avg`;
    const topLine = `Top ${percentile || '0'} percentile`;
    const avgLine = `${isAllTime ? 'All-time' : 'Season'} avg ${average}${suffix} • ${diffText}`;

    return (
      <>
        <p className="highlights-benchmark-line">{topLine}</p>
        <p className="highlights-benchmark-subline">{avgLine}</p>
      </>
    );
  };

  const renderPointsRankMeta = () => {
    const metric = benchmarkMetrics?.total_points;
    if (!metric || !metric.total_users) {
      return null;
    }
    const percentile = formatTopPercentile(metric);
    const average = Number(metric.average || 0).toFixed(0);
    const diff = Number(metric.difference_from_average || 0);
    const diffPrefix = diff > 0 ? '+' : '';
    const diffText = `${diffPrefix}${diff.toFixed(0)} pts vs avg`;
    return (
      <>
        <p className="highlights-benchmark-line">Top {percentile || '0'} percentile</p>
        <p className="highlights-benchmark-subline">
          {isAllTime ? 'All-time' : 'Season'} avg {average} pts • {diffText}
        </p>
      </>
    );
  };

  const eventsByPoints = useMemo(() => {
    return [...eventRows].sort((a, b) => {
      const pointDelta = (Number(b.total_points) || 0) - (Number(a.total_points) || 0);
      if (pointDelta !== 0) return pointDelta;
      const accuracyDelta = (Number(b.accuracy) || 0) - (Number(a.accuracy) || 0);
      if (accuracyDelta !== 0) return accuracyDelta;
      return (Number(b.correct_predictions) || 0) - (Number(a.correct_predictions) || 0);
    });
  }, [eventRows]);

  const eventTiers = useMemo(() => {
    const tierOrder = ['S', 'A', 'B', 'C', 'D', 'F'];
    const minPoints = eventsByPoints.length > 0
      ? Math.min(...eventsByPoints.map((event) => Number(event.total_points) || 0))
      : 0;
    const maxPoints = eventsByPoints.length > 0
      ? Math.max(...eventsByPoints.map((event) => Number(event.total_points) || 0))
      : 0;
    const range = Math.max(maxPoints - minPoints, 1);
    const buckets = {
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
      F: []
    };

    const tierForPoints = (points) => {
      const normalized = (points - minPoints) / range;
      if (normalized >= 0.88) return 'S';
      if (normalized >= 0.72) return 'A';
      if (normalized >= 0.56) return 'B';
      if (normalized >= 0.4) return 'C';
      if (normalized >= 0.22) return 'D';
      return 'F';
    };

    eventsByPoints.forEach((event, index) => {
      const points = Number(event.total_points) || 0;
      buckets[tierForPoints(points)].push({
        ...event,
        rank: index + 1,
        normalizedPosterUrl: normalizeImageUrl(event.event_image_url)
      });
    });

    return tierOrder.map((tier) => ({
      tier,
      events: buckets[tier]
    }));
  }, [eventsByPoints]);

  const eventRowsByDate = useMemo(() => {
    return [...eventRows].sort((a, b) => {
      const aTime = a.event_date ? Date.parse(a.event_date) : Number.NEGATIVE_INFINITY;
      const bTime = b.event_date ? Date.parse(b.event_date) : Number.NEGATIVE_INFINITY;
      return aTime - bTime;
    });
  }, [eventRows]);

  const pointsTrendData = useMemo(() => {
    return eventRowsByDate.map((event) => ({
      event_id: event.event_id,
      event_name: event.event_name,
      event_date: event.event_date,
      points: Number(event.total_points) || 0,
      avg_points: Number.isFinite(Number(event.average_points_all_users))
        ? Number(event.average_points_all_users)
        : null
    }));
  }, [eventRowsByDate]);

  const heroBars = useMemo(() => {
    const heights = [34, 62, 28, 70, 48, 76, 54, 42, 68, 30, 73, 45, 58, 36, 66, 50, 74, 41, 61, 33, 69, 52, 75, 44];
    const tones = ['is-blue', 'is-red', 'is-blue', 'is-red', 'is-blue', 'is-red', 'is-blue', 'is-red'];
    return heights.map((height, idx) => ({
      id: idx,
      height,
      tone: tones[idx % tones.length]
    }));
  }, []);

  const heroStats = [
    { label: 'Total Guesses', value: summary?.total_predictions, decimals: 0, suffix: '' },
    { label: 'Correct', value: summary?.correct_predictions, decimals: 0, suffix: '' },
    { label: 'Events', value: summary?.events_played, decimals: 0, suffix: '' },
    { label: 'Crowns', value: summary?.event_wins, decimals: 0, suffix: '' },
    { label: 'Points', value: summary?.total_points, decimals: 0, suffix: '' },
    { label: 'Avg/Event', value: summary?.average_points_per_event, decimals: 2, suffix: '' }
  ];

  const pointRank = benchmarkMetrics?.total_points;
  const pointRankSuffix = pointRank?.total_users ? `/${pointRank.total_users}` : '';

  const bestEventImageUrl = normalizeImageUrl(bestEvent?.event_image_url);
  const toughestEventImageUrl = normalizeImageUrl(toughestEvent?.event_image_url);

  const firstTrendDate = pointsTrendData.length > 0
    ? formatShortDate(pointsTrendData[0].event_date)
    : '';
  const lastTrendDate = pointsTrendData.length > 0
    ? formatShortDate(pointsTrendData[pointsTrendData.length - 1].event_date)
    : '';

  if (isLoading) {
    return (
      <div className="highlights-page">
        <div className="highlights-shell highlights-loading">
          <div className="highlights-skeleton-block"></div>
          <div className="highlights-skeleton-grid">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="highlights-skeleton-card"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="highlights-page">
        <div className="highlights-shell">
          <section className="highlights-hero">
            <p className="highlights-kicker">Stats Dashboard</p>
            <h1 className="highlights-title">{selectedPeriodLabel}</h1>
            {renderPeriodSwitch('highlights-period-switch-hero')}
            <div className="highlights-error">{error}</div>
          </section>
        </div>
      </div>
    );
  }

  if (!summary || summary.total_predictions === 0) {
    return (
      <div className="highlights-page">
        <div className="highlights-shell">
          <section className="highlights-hero">
            <p className="highlights-kicker">Stats Dashboard</p>
            <h1 className="highlights-title">{selectedPeriodLabel}</h1>
            {renderPeriodSwitch('highlights-period-switch-hero')}
            <p className="highlights-subtitle">No completed picks found for this time range yet.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="highlights-page">
      <div className="highlights-shell">
        <section className="highlights-hero">
          <div className="highlights-hero-bars" aria-hidden="true">
            {heroBars.map((bar) => (
              <span
                key={bar.id}
                className={`highlights-hero-bar ${bar.tone}`}
                style={{ '--bar-height': `${bar.height}%`, '--bar-delay': `${bar.id * 24}ms` }}
              ></span>
            ))}
          </div>
          <div className="highlights-hero-content">
            <p className="highlights-kicker">Stats Dashboard</p>
            <h1 className="highlights-title highlights-year-title">{selectedPeriodLabel}</h1>
            <p className="highlights-subtitle">
              {user?.username ? `${user.username}'s ${selectedPeriodLabel.toLowerCase()} stats` : `${selectedPeriodLabel} stats`}
            </p>
            {renderPeriodSwitch('highlights-period-switch-hero')}
            <div className="highlights-hero-summary">
              {heroStats.map((item) => (
                <div key={item.label} className="highlights-hero-stat">
                  <p className="highlights-hero-stat-value">
                    <CountUp value={item.value} decimals={item.decimals} suffix={item.suffix} />
                  </p>
                  <p className="highlights-hero-stat-label">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="highlights-dashboard-section highlights-core-section">
          {renderSectionHeader(
            'Performance',
            'Core Stats',
            `${Number(summary.correct_predictions || 0)} correct picks at ${Number(summary.accuracy || 0).toFixed(2)}% accuracy ${isAllTime ? 'all time.' : `in ${selectedPeriod}.`}`
          )}
          <div className="highlights-section">
            <div className="highlights-core-layout">
              <article
                className="highlights-stat-card highlights-core-card highlights-core-card-accuracy highlights-animated-card"
                style={{ '--stagger-index': 0 }}
              >
                {renderInfoHint('core-accuracy', 'Correct picks divided by total guesses for this period.')}
                <p className="highlights-stat-label">Pick Accuracy</p>
                <AccuracySplitPie
                  correct={summary.correct_predictions}
                  incorrect={summary.incorrect_predictions}
                  accuracy={summary.accuracy}
                />
                {renderBenchmarkMeta('accuracy', { decimals: 2, suffix: '%' })}
              </article>

              <div className="highlights-core-stack">
                <article
                  className="highlights-stat-card highlights-core-card highlights-core-card-compact highlights-animated-card"
                  style={{ '--stagger-index': 1 }}
                >
                  {renderInfoHint('core-streak', 'Most consecutive correct picks in your timeline.')}
                  <p className="highlights-stat-label">Longest Win Streak</p>
                  <p className="highlights-stat-value">
                    <CountUp value={summary?.longest_win_streak} decimals={0} />
                  </p>
                </article>

                <article
                  className="highlights-stat-card highlights-core-card highlights-core-card-compact highlights-animated-card"
                  style={{ '--stagger-index': 2 }}
                >
                  {renderInfoHint('core-rank', 'Your rank by total points among active human users in this period.')}
                  <p className="highlights-stat-label">Points Rank</p>
                  <p className="highlights-stat-value">
                    <CountUp value={pointRank?.rank || 0} decimals={0} suffix={pointRankSuffix} />
                  </p>
                  {renderPointsRankMeta()}
                </article>
              </div>
            </div>
            <div className="highlights-streak-board highlights-animated-card" style={{ '--stagger-index': 4 }}>
              <div className="highlights-streak-board-head">
                <h3>Longest Win Streak Leaderboard</h3>
                <p>{selectedPeriodLabel}</p>
              </div>
              <div className="highlights-streak-board-scroll">
                {longestStreakLeaderboard.length > 0 ? (
                  longestStreakLeaderboard.map((entry) => {
                    const isCurrentUser = String(entry.user_id) === String(user?.user_id);
                    return (
                      <div
                        key={`${entry.user_id}-${entry.rank}`}
                        className={`highlights-streak-row ${isCurrentUser ? 'is-current-user' : ''}`}
                      >
                        <span className="highlights-streak-rank">#{entry.rank}</span>
                        <span className="highlights-streak-name">{entry.username}</span>
                        <span className="highlights-streak-count">{entry.longest_win_streak}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="highlights-streak-empty">No streak leaderboard data yet.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="highlights-dashboard-section highlights-events-section">
          {renderSectionHeader(
            'Events',
            'Event Breakdown',
            bestEvent && toughestEvent
              ? `Best event: ${bestEvent.event_name}. Toughest event: ${toughestEvent.event_name}.`
              : 'Event-by-event scoring and trendline over time.'
          )}
          <div className="highlights-spotlights">
            <article className="highlights-panel highlights-event-spotlight highlights-animated-card" style={{ '--stagger-index': 0 }}>
              {renderInfoHint('events-best', 'Your single highest-point event this period, with tiebreakers by accuracy and correct picks.')}
              <div className="highlights-event-spotlight-media">
                {bestEventImageUrl ? (
                  <img
                    src={bestEventImageUrl}
                    alt={bestEvent.event_name || 'Best event'}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                      const fallbackNode = event.currentTarget.nextElementSibling;
                      if (fallbackNode) {
                        fallbackNode.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div className={`highlights-event-spotlight-fallback ${bestEventImageUrl ? 'is-hidden' : ''}`}>
                  {bestEvent?.event_name || 'Best Event'}
                </div>
              </div>
              <div className="highlights-event-spotlight-copy">
                <p className="highlights-panel-kicker">Best Event</p>
                <h3>{bestEvent?.event_name || 'N/A'}</h3>
                <p className="highlights-panel-meta">
                  {bestEvent ? `${bestEvent.total_points} pts • ${bestEvent.accuracy}% accuracy` : 'No data'}
                </p>
                {bestEvent?.event_date ? (
                  <p className="highlights-panel-date">{formatEventDate(bestEvent.event_date)}</p>
                ) : null}
              </div>
            </article>
            <article className="highlights-panel highlights-event-spotlight highlights-animated-card" style={{ '--stagger-index': 1 }}>
              {renderInfoHint('events-toughest', 'Your lowest-accuracy event this period, with low points as a secondary tiebreaker.')}
              <div className="highlights-event-spotlight-media">
                {toughestEventImageUrl ? (
                  <img
                    src={toughestEventImageUrl}
                    alt={toughestEvent.event_name || 'Toughest event'}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                      const fallbackNode = event.currentTarget.nextElementSibling;
                      if (fallbackNode) {
                        fallbackNode.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div className={`highlights-event-spotlight-fallback ${toughestEventImageUrl ? 'is-hidden' : ''}`}>
                  {toughestEvent?.event_name || 'Toughest Event'}
                </div>
              </div>
              <div className="highlights-event-spotlight-copy">
                <p className="highlights-panel-kicker">Toughest Event</p>
                <h3>{toughestEvent?.event_name || 'N/A'}</h3>
                <p className="highlights-panel-meta">
                  {toughestEvent ? `${toughestEvent.total_points} pts • ${toughestEvent.accuracy}% accuracy` : 'No data'}
                </p>
                {toughestEvent?.event_date ? (
                  <p className="highlights-panel-date">{formatEventDate(toughestEvent.event_date)}</p>
                ) : null}
              </div>
            </article>
          </div>

          <div className="highlights-top-events">
            <h2>Points Per Event</h2>
            <PointsTrendChart data={pointsTrendData} />
            <p className="highlights-chart-meta">
              {firstTrendDate && lastTrendDate
                ? `${firstTrendDate} to ${lastTrendDate}`
                : 'Ordered by event date'}
            </p>
            <h3 className="highlights-subsection-title">Event Tier List By Points</h3>
            <div className="highlights-tier-list">
              {eventTiers.map((tierRow, rowIndex) => (
                <div key={tierRow.tier} className={`highlights-tier-row is-${tierRow.tier.toLowerCase()}`}>
                  <div className="highlights-tier-label" aria-hidden="true">
                    {tierRow.tier}
                  </div>
                  <div className="highlights-tier-content">
                    {tierRow.events.length > 0 ? (
                      tierRow.events.map((event, idx) => (
                        <article
                          key={`${tierRow.tier}-${event.event_id}-${idx}`}
                          className="highlights-event-poster highlights-tier-poster highlights-animated-card"
                          style={{ '--stagger-index': rowIndex + idx + 2 }}
                          title={`${event.event_name} • ${event.total_points} pts`}
                        >
                          <div className="highlights-event-poster-media">
                            {event.normalizedPosterUrl ? (
                              <img
                                src={event.normalizedPosterUrl}
                                alt={event.event_name}
                                loading="lazy"
                                decoding="async"
                                onError={(event) => {
                                  event.currentTarget.style.display = 'none';
                                  const fallbackNode = event.currentTarget.nextElementSibling;
                                  if (fallbackNode) {
                                    fallbackNode.style.display = 'flex';
                                  }
                                }}
                              />
                            ) : null}
                            <div className={`highlights-event-poster-fallback ${event.normalizedPosterUrl ? 'is-hidden' : ''}`}>
                              {event.event_name}
                            </div>
                            <div className="highlights-event-poster-overlay">
                              <span className="highlights-event-rank">#{event.rank}</span>
                              <span className="highlights-event-score">{event.total_points} pts</span>
                            </div>
                          </div>
                          <div className="highlights-event-copy">
                            <p className="highlights-event-name">{event.event_name}</p>
                            <p className="highlights-event-date">{formatEventDate(event.event_date) || 'Date unavailable'}</p>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="highlights-tier-empty">No events landed in this tier.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="highlights-dashboard-section highlights-fighter-section">
          {renderSectionHeader(
            'Fighters',
            'Fighter Breakdown',
            fighterInsights?.most_trusted_fighter?.fighter_name
              ? `Most trusted: ${fighterInsights.most_trusted_fighter.fighter_name}. Biggest points earner: ${fighterInsights?.most_profitable_fighter?.fighter_name || 'N/A'}.`
              : 'Who you trusted most and who returned the most points.'
          )}
          <div className="highlights-section">
            <div className="highlights-insight-grid">
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 0 }}>
                {renderInfoHint('fighter-trusted', 'The fighter you picked most often this period.')}
                <p className="highlights-panel-kicker">Most Trusted Fighter</p>
                <h3>{fighterInsights?.most_trusted_fighter?.fighter_name || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {fighterInsights?.most_trusted_fighter
                    ? `${fighterInsights.most_trusted_fighter.picks} picks • ${fighterInsights.most_trusted_fighter.correct_picks} correct`
                    : 'Make picks to unlock this stat.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 1 }}>
                {renderInfoHint('fighter-profitable', 'The fighter whose correct picks earned you the most total points.')}
                <p className="highlights-panel-kicker">Most Profitable Fighter</p>
                <h3>{fighterInsights?.most_profitable_fighter?.fighter_name || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {fighterInsights?.most_profitable_fighter
                    ? `${fighterInsights.most_profitable_fighter.points_from_wins} pts from wins`
                    : 'No profitable picks found yet.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 2 }}>
                {renderInfoHint('fighter-underdog', 'Your highest positive betting-odds winner among correct picks.')}
                <p className="highlights-panel-kicker">Biggest Underdog Hit</p>
                <h3>{fighterInsights?.biggest_underdog_hit?.fighter_name || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {fighterInsights?.biggest_underdog_hit
                    ? `${formatOdds(fighterInsights.biggest_underdog_hit.odds)} odds • ${fighterInsights.biggest_underdog_hit.points} pts`
                    : 'No underdog wins logged this period.'}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="highlights-dashboard-section highlights-style-section">
          {renderSectionHeader(
            'Style',
            'Style Breakdown',
            `Momentum shift this ${isAllTime ? 'all-time' : selectedPeriod} view: ${formatSignedPercent(momentum?.delta)}.`
          )}
          <div className="highlights-section">
            <div className="highlights-insight-grid">
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 0 }}>
                {renderInfoHint('style-tier', 'Your highest accuracy split by card segment (Main Card, Prelims, Early Prelims).')}
                <p className="highlights-panel-kicker">Best Card Tier</p>
                <h3>{styleInsights?.best_card_tier?.card_tier || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {styleInsights?.best_card_tier
                    ? `${styleInsights.best_card_tier.accuracy}% accuracy`
                    : 'Insufficient fight data.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 1 }}>
                {renderInfoHint('style-weight', 'Your highest accuracy split by weight class for period fights.')}
                <p className="highlights-panel-kicker">Best Weight Class</p>
                <h3>{styleInsights?.best_weightclass?.weightclass || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {styleInsights?.best_weightclass
                    ? `${styleInsights.best_weightclass.accuracy}% accuracy`
                    : 'Insufficient fight data.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 2 }}>
                {renderInfoHint('style-momentum', 'Second-half accuracy minus first-half accuracy. Positive means you improved over time.')}
                <p className="highlights-panel-kicker">Momentum Shift</p>
                <h3>{formatSignedPercent(momentum?.delta)}</h3>
                <p className="highlights-panel-meta">
                  {`${Number(momentum?.first_half_accuracy || 0).toFixed(2)}% → ${Number(momentum?.second_half_accuracy || 0).toFixed(2)}%`}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="highlights-dashboard-section highlights-corner-breakdown-section">
          {renderSectionHeader(
            'Corners',
            'Corner Breakdown',
            favoriteCorner?.corner
              ? `You leaned ${favoriteCorner.corner} corner most in this view.`
              : 'How your accuracy changes by corner picked.'
          )}
          <div className="highlights-section highlights-corner-section">
            <div className="highlights-insight-grid">
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 0 }}>
                {renderInfoHint('style-red-corner', 'Accuracy on fights where your pick came from the red corner.')}
                <p className="highlights-panel-kicker">Red Corner Accuracy</p>
                <h3>{`${Number(redCorner?.accuracy || 0).toFixed(2)}%`}</h3>
                <p className="highlights-panel-meta">
                  {`${Number(redCorner?.correct_picks || 0)}/${Number(redCorner?.total_picks || 0)} correct`}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 1 }}>
                {renderInfoHint('style-blue-corner', 'Accuracy on fights where your pick came from the blue corner.')}
                <p className="highlights-panel-kicker">Blue Corner Accuracy</p>
                <h3>{`${Number(blueCorner?.accuracy || 0).toFixed(2)}%`}</h3>
                <p className="highlights-panel-meta">
                  {`${Number(blueCorner?.correct_picks || 0)}/${Number(blueCorner?.total_picks || 0)} correct`}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 2 }}>
                {renderInfoHint('style-favorite-corner', 'The corner you picked most often, with pick share among known-corner picks.')}
                <p className="highlights-panel-kicker">Favorite Corner</p>
                <h3>{favoriteCorner?.corner || 'No lean yet'}</h3>
                <p className="highlights-panel-meta">
                  {favoriteCorner
                    ? `${favoriteCorner.total_picks} picks • ${Number(favoriteCorner.pick_share || 0).toFixed(2)}% share • ${Number(favoriteCorner.accuracy || 0).toFixed(2)}% accuracy`
                    : 'Need more mapped picks.'}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="highlights-dashboard-section highlights-rivalries-section">
          {renderSectionHeader(
            'Rivalries',
            'User Matchups',
            rivalryInsights?.biggest_nemesis?.username
              ? `${rivalryInsights.biggest_nemesis.username} was your biggest nemesis in shared picks.`
              : 'Overlap with other users and where they got the edge.'
          )}
          <div className="highlights-section">
            <div className="highlights-insight-grid">
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 0 }}>
                {renderInfoHint('rival-nemesis', 'User with the most shared fights where they were correct and you were wrong.')}
                <p className="highlights-panel-kicker">Biggest Nemesis</p>
                <h3>{rivalryInsights?.biggest_nemesis?.username || 'No nemesis yet'}</h3>
                <p className="highlights-panel-meta">
                  {rivalryInsights?.biggest_nemesis
                    ? `${rivalryInsights.biggest_nemesis.times_they_were_right_you_wrong} swing fights`
                    : 'Need more shared fights for rivalry stats.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 1 }}>
                {renderInfoHint('rival-h2h', 'Net edge = (you right / them wrong) minus (them right / you wrong) on shared fights.')}
                <p className="highlights-panel-kicker">Head-to-Head Edge</p>
                <h3>{rivalryInsights?.head_to_head?.username || 'No matchup yet'}</h3>
                <p className="highlights-panel-meta">
                  {rivalryInsights?.head_to_head
                    ? `${rivalryInsights.head_to_head.net_edge > 0 ? '+' : ''}${rivalryInsights.head_to_head.net_edge} net edge`
                    : 'Not enough overlap yet.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 2 }}>
                {renderInfoHint('rival-twin', 'User whose picks matched yours the highest percent across shared fights (minimum 3 shared picks).')}
                <p className="highlights-panel-kicker">Pick Twin</p>
                <h3>{rivalryInsights?.pick_twin?.username || 'No twin yet'}</h3>
                <p className="highlights-panel-meta">
                  {rivalryInsights?.pick_twin
                    ? `${rivalryInsights.pick_twin.overlap_pct}% overlap`
                    : 'Need at least 3 shared picks to detect twin.'}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="highlights-dashboard-section highlights-community-section">
          {renderSectionHeader(
            'Community',
            'Community Highlights',
            communityInsights?.most_voted_fighter?.fighter_name
              ? `${communityInsights.most_voted_fighter.fighter_name} was the most-voted community fighter.`
              : 'How the whole community voted, won, and missed.'
          )}
          <div className="highlights-section">
            <div className="highlights-insight-grid">
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 0 }}>
                {renderInfoHint('community-most-voted', 'Fighter selected the most by active human users in this period.')}
                <p className="highlights-panel-kicker">Most Voted Fighter</p>
                <h3>{communityInsights?.most_voted_fighter?.fighter_name || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {communityInsights?.most_voted_fighter
                    ? `${communityInsights.most_voted_fighter.total_votes} picks • ${Number(communityInsights.most_voted_fighter.pick_share || 0).toFixed(2)}% share`
                    : 'No community picks available yet.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 1 }}>
                {renderInfoHint('community-cash-cow', 'Fighter whose successful picks produced the most total points for all active human users combined.')}
                <p className="highlights-panel-kicker">Community Cash Cow</p>
                <h3>{communityInsights?.community_cash_cow_fighter?.fighter_name || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {communityInsights?.community_cash_cow_fighter
                    ? `${communityInsights.community_cash_cow_fighter.points_won} pts won • ${communityInsights.community_cash_cow_fighter.correct_picks}/${communityInsights.community_cash_cow_fighter.total_votes} correct`
                    : 'No community points data available yet.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 2 }}>
                {renderInfoHint('community-faded', 'Fighter the community missed on the most (minimum-sample weighting applied).')}
                <p className="highlights-panel-kicker">Most Faded Fighter</p>
                <h3>{communityInsights?.most_faded_fighter?.fighter_name || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {communityInsights?.most_faded_fighter
                    ? `${communityInsights.most_faded_fighter.incorrect_picks} misses • ${Number(communityInsights.most_faded_fighter.fade_rate || 0).toFixed(2)}% wrong`
                    : 'No fade trend available yet.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 3 }}>
                {renderInfoHint('community-corner', 'Which corner the community picked most, plus how often that corner’s picks were right.')}
                <p className="highlights-panel-kicker">Crowd Favorite Corner</p>
                <h3>{communityInsights?.crowd_favorite_corner?.corner || 'No lean yet'}</h3>
                <p className="highlights-panel-meta">
                  {communityInsights?.crowd_favorite_corner
                    ? `${communityInsights.crowd_favorite_corner.total_votes} picks • ${Number(communityInsights.crowd_favorite_corner.pick_share || 0).toFixed(2)}% share • ${Number(communityInsights.crowd_favorite_corner.accuracy || 0).toFixed(2)}% accuracy`
                    : 'No corner split available yet.'}
                </p>
              </article>
              <article className="highlights-insight-card highlights-animated-card" style={{ '--stagger-index': 4 }}>
                {renderInfoHint('community-whiff', 'Single fight where the largest number of users were wrong in this period.')}
                <p className="highlights-panel-kicker">Biggest Community Whiff</p>
                <h3>{communityInsights?.biggest_whiff_fight?.fight_label || 'No data yet'}</h3>
                <p className="highlights-panel-meta">
                  {communityInsights?.biggest_whiff_fight
                    ? `${communityInsights.biggest_whiff_fight.wrong_picks}/${communityInsights.biggest_whiff_fight.total_predictions} wrong • ${Number(communityInsights.biggest_whiff_fight.wrong_rate || 0).toFixed(2)}% • ${communityInsights.biggest_whiff_fight.event_name || 'Unknown event'}`
                    : 'No whiff trend available yet.'}
                </p>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default HighlightsPage;
