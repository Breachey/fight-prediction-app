import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import './EventSelector.css';
import { API_URL } from './config';
import { cachedFetchJson, invalidateCache } from './utils/apiCache';
import {
  fetchWithAdminSession,
  hasActiveAdminSession,
} from './utils/adminSession';
import ConfirmDialog from './components/ConfirmDialog';

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
  const blockerMessage = Array.isArray(payload.blockers) && payload.blockers.length > 0
    ? payload.blockers
      .filter((value) => typeof value === 'string' && value.trim())
      .join(' ')
    : '';
  const warningMessage = Array.isArray(payload.warnings) && payload.warnings.length > 0
    ? payload.warnings
      .filter((value) => typeof value === 'string' && value.trim())
      .join(' ')
    : '';

  if (primaryMessage && detailMessage && detailMessage !== primaryMessage) {
    return `${primaryMessage}: ${detailMessage}`;
  }

  const baseMessage = primaryMessage || detailMessage || fallbackMessage;
  if (blockerMessage) {
    return `${baseMessage}: ${blockerMessage}`;
  }

  if (warningMessage && !primaryMessage && !detailMessage) {
    return `${baseMessage}: ${warningMessage}`;
  }

  return baseMessage;
};

const getCompletenessTone = (metric) => {
  if (!metric || !Number.isFinite(metric.total) || metric.total <= 0) {
    return 'neutral';
  }

  if (metric.populated <= 0) {
    return 'critical';
  }

  if (metric.populated === metric.total) {
    return 'good';
  }

  if ((metric.populated / metric.total) < 0.5) {
    return 'warn';
  }

  return 'neutral';
};

const formatCompletenessLabel = (label, metric) => {
  if (!metric || !Number.isFinite(metric.total) || metric.total <= 0) {
    return `${label}: n/a`;
  }

  return `${label}: ${metric.populated}/${metric.total}`;
};

const getEditablePreviewFighterName = (row) => (
  [row?.firstName, row?.lastName].filter(Boolean).join(' ') || 'Unknown fighter'
);

const SCRAPE_SOURCE_LABELS = {
  sherdog: 'Sherdog',
  sherdog_ufccom: 'Sherdog + UFC.com',
  sherdog_ufccom_wikipedia: 'Sherdog + UFC.com + Wikipedia',
  sherdog_tapology: 'Sherdog + Tapology fallback',
  sherdog_ufccom_tapology: 'Sherdog + UFC.com + Tapology fallback',
  tapology_single_profile: 'Tapology profile',
  tapology_wikipedia_merged: 'Tapology + Wikipedia',
  tapology_partial_profile: 'Partial Tapology profile',
  wikipedia_record_breakdown: 'Wikipedia fallback',
  none: 'No source',
};

const SCRAPE_FIELD_LABELS = {
  Rank: 'Rank',
  Streak: 'Streak',
  style: 'Style',
  KO_TKO_Wins: 'KO/TKO W',
  KO_TKO_Losses: 'KO/TKO L',
  Submission_Wins: 'Sub W',
  Submission_Losses: 'Sub L',
  Decision_Wins: 'Dec W',
  Decision_Losses: 'Dec L',
};

const formatScrapeFields = (fields) => (fields || [])
  .map((field) => SCRAPE_FIELD_LABELS[field] || field)
  .join(', ');

const MANUAL_METHOD_STAT_FIELDS = [
  ['KO_TKO_Wins', 'KO/TKO W'],
  ['KO_TKO_Losses', 'KO/TKO L'],
  ['Submission_Wins', 'Sub W'],
  ['Submission_Losses', 'Sub L'],
  ['Decision_Wins', 'Dec W'],
  ['Decision_Losses', 'Dec L'],
];
const FIGHT_CARD_EDITOR_FIELDS = [
  ['odds', 'Odds', 'odds'],
  ['TapologyFighterURL', 'Tapology URL', 'url'],
  ['style', 'Style', 'text'],
  ['Streak', 'Streak', 'signed-number'],
  ...MANUAL_METHOD_STAT_FIELDS.map(([field, label]) => [field, label, 'number']),
];
const ADMIN_STAT_EDITOR_FIELDS = FIGHT_CARD_EDITOR_FIELDS;

const normalizeStatEditorValue = (value) => (
  value === null || value === undefined ? '' : String(value)
);

const isValidStatEditorValue = (type, value) => {
  if (!value) return true;
  if (type === 'number') return /^\d+$/.test(value);
  if (type === 'signed-number') return /^-?\d+$/.test(value);
  if (type === 'odds') return /^[+-]?\d+$/.test(value);
  if (type === 'url') return /^https:\/\/www\.tapology\.com\/fightcenter\/fighters\//i.test(value);
  return true;
};

const buildManualPreviewUpdates = (editableRows, edits) => {
  const updates = {};

  (editableRows || []).forEach((row) => {
    const rowEdits = edits?.[row.rowKey];
    if (!rowEdits) return;

    const patch = {};
    FIGHT_CARD_EDITOR_FIELDS.forEach(([field, , type]) => {
      if (!Object.prototype.hasOwnProperty.call(rowEdits, field)) return;

      const originalValue = normalizeStatEditorValue(row[field]).trim();
      const editedValue = normalizeStatEditorValue(rowEdits[field]).trim();
      if (originalValue === editedValue || !isValidStatEditorValue(type, editedValue)) return;
      patch[field] = editedValue === '' ? null : editedValue;
    });

    if (Object.keys(patch).length > 0) {
      updates[row.rowKey] = patch;
    }
  });

  return updates;
};

const countManualPreviewValues = (editableRows, edits) => (
  Object.values(buildManualPreviewUpdates(editableRows, edits))
    .reduce((count, patch) => count + Object.keys(patch).length, 0)
);

const countMissingEditablePreviewValues = (editableRows) => (
  (editableRows || []).reduce((count, row) => count + FIGHT_CARD_EDITOR_FIELDS.reduce(
    (fieldCount, [field]) => fieldCount + (normalizeStatEditorValue(row[field]).trim() ? 0 : 1),
    0
  ), 0)
);

const rowHasMissingEditorValues = (row) => FIGHT_CARD_EDITOR_FIELDS.some(
  ([field]) => !normalizeStatEditorValue(row?.[field]).trim()
);

const getEditorValue = (edits, rowId, row, field) => (
  Object.prototype.hasOwnProperty.call(edits?.[rowId] || {}, field)
    ? edits[rowId][field]
    : normalizeStatEditorValue(row?.[field])
);

const omitEditRows = (edits, rowIds) => {
  const omittedIds = new Set(rowIds.map(String));
  return Object.fromEntries(
    Object.entries(edits || {}).filter(([rowId]) => !omittedIds.has(String(rowId)))
  );
};

const omitEditFields = (edits, rowFields) => {
  const nextEdits = { ...(edits || {}) };

  Object.entries(rowFields || {}).forEach(([rowId, fields]) => {
    const rowEdits = { ...(nextEdits[rowId] || {}) };
    fields.forEach((field) => delete rowEdits[field]);
    if (Object.keys(rowEdits).length > 0) {
      nextEdits[rowId] = rowEdits;
    } else {
      delete nextEdits[rowId];
    }
  });

  return nextEdits;
};

const buildFightCardStatUpdates = (rows, edits) => (
  (rows || []).reduce((updates, row) => {
    const rowEdits = edits?.[row.id];
    if (!rowEdits) return updates;

    const values = {};
    ADMIN_STAT_EDITOR_FIELDS.forEach(([field, , type]) => {
      if (!Object.prototype.hasOwnProperty.call(rowEdits, field)) return;

      const originalValue = normalizeStatEditorValue(row[field]).trim();
      const editedValue = normalizeStatEditorValue(rowEdits[field]).trim();
      if (originalValue === editedValue) return;

      if (!isValidStatEditorValue(type, editedValue)) return;
      values[field] = editedValue === '' ? null : editedValue;
    });

    if (Object.keys(values).length > 0) {
      updates.push({ id: row.id, values });
    }

    return updates;
  }, [])
);

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
  const [fightCardScrapeProgress, setFightCardScrapeProgress] = useState(null);
  const [importingEventId, setImportingEventId] = useState(null);
  const [refreshingOddsEventId, setRefreshingOddsEventId] = useState(null);
  const [discoveringUfcEvents, setDiscoveringUfcEvents] = useState(false);
  const [editingFightStatsEventId, setEditingFightStatsEventId] = useState(null);
  const [loadingFightStatsEventId, setLoadingFightStatsEventId] = useState(null);
  const [openingImportedEditorEventId, setOpeningImportedEditorEventId] = useState(null);
  const [savingFightStatsEventId, setSavingFightStatsEventId] = useState(null);
  const [savingFightStatsRowId, setSavingFightStatsRowId] = useState(null);
  const [savingPreviewProgressRowKey, setSavingPreviewProgressRowKey] = useState(null);
  const [scrapingTapologyRowId, setScrapingTapologyRowId] = useState(null);
  const [scrapingPreviewTapologyRowKeys, setScrapingPreviewTapologyRowKeys] = useState([]);
  const [previewTapologyScrapeProgress, setPreviewTapologyScrapeProgress] = useState(null);
  const [fightCardScrapeLog, setFightCardScrapeLog] = useState([]);
  const [loadingFightCardScrapeLog, setLoadingFightCardScrapeLog] = useState(false);
  const [fightStatsRows, setFightStatsRows] = useState([]);
  const [fightStatsEdits, setFightStatsEdits] = useState({});
  const [fightCardFeedback, setFightCardFeedback] = useState(null);
  const [fightCardPreview, setFightCardPreview] = useState(null);
  const [fightCardPreviewEdits, setFightCardPreviewEdits] = useState({});
  const [previewEditorFilter, setPreviewEditorFilter] = useState('missing');
  const [fightStatsEditorFilter, setFightStatsEditorFilter] = useState('all');
  const [adminAccessFeedback, setAdminAccessFeedback] = useState(null);
  const [adminToolsOpen, setAdminToolsOpen] = useState(false);
  const [adminConfirmation, setAdminConfirmation] = useState(null);
  const [selectedEventCardStartTimes, setSelectedEventCardStartTimes] = useState({
    early_prelims: null,
    prelims: null,
    main_card: null,
  });
  const canManageAdminActions = userType === 'admin' && hasActiveAdminSession();

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

  // Center the selected poster once when its identity changes. Native scroll snap
  // handles the rest without repeated layout reads and delayed retries.
  useLayoutEffect(() => {
    if (!events.length) return;
    const currentEvent = events[currentIndex];
    const requestedEventId = selectedEventIdRef.current;

    // Event data initially renders at index zero before the URL selection is
    // reconciled. Waiting for that reconciliation keeps the one initial
    // centering action from turning into a long, interrupted smooth scroll.
    if (
      requestedEventId !== null
      && requestedEventId !== undefined
      && !areEventIdsEqual(currentEvent?.id, requestedEventId)
    ) {
      return;
    }

    const behavior = hasCenteredOnInit.current ? 'smooth' : 'auto';
    const frame = window.requestAnimationFrame(() => {
      centerCardAtIndex(currentIndex, behavior);
      hasCenteredOnInit.current = true;
      updateScrollBoundaries();
    });
    return () => window.cancelAnimationFrame(frame);
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
    && !fightCardPreview?.isImported
    && (fightCardPreview?.blockers?.length || 0) === 0;
  const hasFightCardPreview = Boolean(fightCardPreview);
  const isEditingSelectedFightStats = Boolean(selectedEvent?.id)
    && editingFightStatsEventId === selectedEvent.id;
  const fightStatsUpdates = useMemo(
    () => buildFightCardStatUpdates(fightStatsRows, fightStatsEdits),
    [fightStatsRows, fightStatsEdits]
  );
  const fightStatsUpdateCount = fightStatsUpdates.length;
  const fightStatsUpdateRowIds = useMemo(
    () => new Set(fightStatsUpdates.map((update) => String(update.id))),
    [fightStatsUpdates]
  );
  const visibleFightStatsRows = useMemo(() => (
    fightStatsRows.filter((row) => {
      if (fightStatsEditorFilter === 'missing') return rowHasMissingEditorValues(row);
      if (fightStatsEditorFilter === 'changed') return fightStatsUpdateRowIds.has(String(row.id));
      return true;
    })
  ), [fightStatsRows, fightStatsEditorFilter, fightStatsUpdateRowIds]);
  const isFightCardActionBusy = selectedEvent
    ? previewingEventId === selectedEvent.id
      || importingEventId === selectedEvent.id
      || refreshingOddsEventId === selectedEvent.id
      || loadingFightStatsEventId === selectedEvent.id
      || openingImportedEditorEventId === selectedEvent.id
      || savingFightStatsEventId === selectedEvent.id
      || savingPreviewProgressRowKey !== null
      || scrapingTapologyRowId !== null
      || scrapingPreviewTapologyRowKeys.length > 0
      || previewTapologyScrapeProgress !== null
    : false;
  const previewStatusMessage = fightCardPreview
    ? fightCardPreview.isImported
      ? 'This editor is linked to the imported fight card. Each save updates the stored fight-card rows.'
      : fightCardPreview.existingFightCardRowCount > 0
      ? `Import will replace ${fightCardPreview.existingFightCardRowCount} existing fighter row${fightCardPreview.existingFightCardRowCount === 1 ? '' : 's'} for this event.`
      : 'This will be the first fight-card import for this event.'
    : null;
  const previewCompletenessItems = useMemo(() => {
    const summary = fightCardPreview?.fieldCompletenessSummary;
    if (!summary) {
      return [];
    }

    return [
      {
        key: 'odds',
        label: formatCompletenessLabel('Odds', summary.odds),
        tone: getCompletenessTone(summary.odds),
      },
      {
        key: 'fighter-profiles',
        label: formatCompletenessLabel('Profile Stats', summary.fighterProfiles || summary.finishBreakdown),
        tone: getCompletenessTone(summary.fighterProfiles || summary.finishBreakdown),
      },
      {
        key: 'streak',
        label: formatCompletenessLabel('Streak', summary.streak),
        tone: getCompletenessTone(summary.streak),
      },
      {
        key: 'finish',
        label: formatCompletenessLabel('Finish Data', summary.finishBreakdown),
        tone: getCompletenessTone(summary.finishBreakdown),
      },
      {
        key: 'style',
        label: formatCompletenessLabel('Style', summary.style),
        tone: getCompletenessTone(summary.style),
      },
    ];
  }, [fightCardPreview]);
  const editablePreviewRows = useMemo(
    () => fightCardPreview?.editableRows || [],
    [fightCardPreview]
  );
  const manualPreviewUpdates = useMemo(
    () => buildManualPreviewUpdates(editablePreviewRows, fightCardPreviewEdits),
    [editablePreviewRows, fightCardPreviewEdits]
  );
  const manualPreviewUpdateCount = useMemo(
    () => countManualPreviewValues(editablePreviewRows, fightCardPreviewEdits),
    [editablePreviewRows, fightCardPreviewEdits]
  );
  const missingEditablePreviewValueCount = useMemo(
    () => countMissingEditablePreviewValues(editablePreviewRows),
    [editablePreviewRows]
  );
  const hasManualPreviewUpdates = Object.keys(manualPreviewUpdates).length > 0;
  const manualPreviewUpdateRowKeys = useMemo(
    () => new Set(Object.keys(manualPreviewUpdates)),
    [manualPreviewUpdates]
  );
  const scrapablePreviewRows = useMemo(() => (
    editablePreviewRows.filter((row) => {
      const tapologyUrl = normalizeStatEditorValue(
        getEditorValue(fightCardPreviewEdits, row.rowKey, row, 'TapologyFighterURL')
      ).trim();
      return !tapologyUrl || isValidStatEditorValue('url', tapologyUrl);
    })
  ), [editablePreviewRows, fightCardPreviewEdits]);
  const visiblePreviewRows = useMemo(() => (
    editablePreviewRows.filter((row) => {
      if (previewEditorFilter === 'missing') return rowHasMissingEditorValues(row);
      if (previewEditorFilter === 'changed') return manualPreviewUpdateRowKeys.has(row.rowKey);
      return true;
    })
  ), [editablePreviewRows, previewEditorFilter, manualPreviewUpdateRowKeys]);
  useEffect(() => {
    if (typeof onSelectedEventChange !== 'function') return;
    onSelectedEventChange(selectedEvent || null);
  }, [selectedEvent, onSelectedEventChange]);

  useEffect(() => {
    if (!selectedEvent?.id || editingFightStatsEventId === selectedEvent.id) return;
    setEditingFightStatsEventId(null);
    setFightStatsRows([]);
    setFightStatsEdits({});
  }, [selectedEvent?.id, editingFightStatsEventId]);

  useEffect(() => {
    const cardStartTimes = selectedEvent?.card_start_times || {};
    setSelectedEventCardStartTimes({
      early_prelims: cardStartTimes.early_prelims || null,
      prelims: cardStartTimes.prelims || null,
      main_card: cardStartTimes.main_card || selectedEvent?.start_time || null,
    });
  }, [selectedEvent?.id, selectedEvent?.card_start_times, selectedEvent?.start_time]);

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
    invalidateCache(`${API_URL}/events:v2`);
    if (!eventId) return;
    invalidateCache(`${API_URL}/events/${eventId}/fights`);
    invalidateCache(`${API_URL}/events/${eventId}/vote-counts`);
  }, []);

  const executeFinalizeEvent = async (event) => {
    if (!event || !event.id) return;

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

  const loadFightCardScrapeLog = async (event, { silent = false } = {}) => {
    if (!event?.id) return;
    if (!silent) setLoadingFightCardScrapeLog(true);

    try {
      const response = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/fight-card/scrape-log`,
        { method: 'GET' }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to load scrape log'));
      }
      setFightCardScrapeLog(payload.entries || []);
    } catch (err) {
      if (!silent) {
        setFightCardFeedback({
          type: 'error',
          message: err.message || 'Failed to load scrape log'
        });
      }
    } finally {
      if (!silent) setLoadingFightCardScrapeLog(false);
    }
  };

  const handlePreviewFightCard = async (event) => {
    if (!event?.id) return;

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setFightCardPreview(null);
    setFightCardPreviewEdits({});
    setPreviewEditorFilter('missing');
    setPreviewingEventId(event.id);
    setFightCardScrapeProgress({
      eventId: event.id,
      status: 'running',
      phase: 'starting',
      label: 'Starting fight-card refresh',
      detail: 'Preparing the preview workspace…',
      percent: 1,
      current: null,
      total: null,
    });

    const progressToken = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `preview_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let keepPolling = true;
    let pollTimer = null;

    const pollProgress = async () => {
      if (!keepPolling) return;
      try {
        const progressResponse = await fetchWithAdminSession(
          `${API_URL}/admin/events/${event.id}/fight-card/preview-progress/${progressToken}`,
          { method: 'GET' }
        );
        if (progressResponse.ok) {
          const progressPayload = await progressResponse.json().catch(() => ({}));
          setFightCardScrapeProgress(progressPayload);
        }
      } catch (error) {
        // The primary preview request remains authoritative if a progress poll is missed.
      }
      if (keepPolling) {
        pollTimer = window.setTimeout(pollProgress, 600);
      }
    };

    void pollProgress();

    try {
      const response = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/fight-card/preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ progressToken })
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to preview fight card'));
      }

      setFightCardPreview(payload);
      setFightCardScrapeProgress({
        eventId: event.id,
        status: 'complete',
        phase: 'complete',
        label: payload.blockers?.length ? 'Preview needs attention' : 'Fight-card preview ready',
        detail: `${payload.fightCount} fights and ${payload.rowCount} fighter rows processed`,
        percent: 100,
        current: payload.rowCount,
        total: payload.rowCount,
      });
      await loadFightCardScrapeLog(event, { silent: true });
      setFightCardFeedback({
        type: payload.blockers?.length ? 'error' : 'success',
        message: payload.blockers?.length
          ? 'Preview found blockers that must be resolved before import.'
          : `Preview ready: ${payload.fightCount} fights and ${payload.rowCount} fighter rows.`
      });
    } catch (err) {
      setFightCardScrapeProgress((current) => ({
        ...(current || {}),
        status: 'failed',
        phase: 'failed',
        label: 'Fight-card refresh failed',
        detail: err.message || 'Failed to preview fight card',
      }));
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to preview fight card'
      });
    } finally {
      keepPolling = false;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      setPreviewingEventId(null);
    }
  };

  const executeImportFightCard = async (event) => {
    if (!event?.id || !fightCardPreview?.previewToken) return;

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
            previewToken: fightCardPreview.previewToken,
            manualRowUpdates: hasManualPreviewUpdates ? manualPreviewUpdates : undefined,
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
      setFightCardPreview(payload.fightCardPreview || fightCardPreview);
      setFightCardPreviewEdits({});
      setPreviewEditorFilter('all');
      setFightCardFeedback({
        type: 'success',
        message: `Imported ${payload.rowCount} fighter rows across ${payload.fightCount} fights. The editor remains open for saved changes and fighter-source refreshes.`
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

  const requestFinalizeEvent = (event) => {
    if (!event?.id) return;
    const recalculating = Boolean(event.is_completed);
    setAdminConfirmation({
      action: 'finalize',
      event,
      title: recalculating ? 'Recalculate event winners?' : 'Finalize this event?',
      summary: recalculating
        ? `This will score ${event.name} again and replace its current winner calculation.`
        : `${event.name} will be marked Final and its winners will be crowned.`,
      details: recalculating
        ? ['Existing picks and fight results will be rescored.', 'Current winner records may change.']
        : ['The event status will change to Final.', 'All recorded picks will be scored and eligible winners created.'],
      confirmLabel: recalculating ? 'Recalculate winners' : 'Finalize event',
      tone: recalculating ? 'caution' : 'danger',
    });
  };

  const requestImportFightCard = (event) => {
    if (!event?.id || !fightCardPreview?.previewToken) return;
    const existingRows = Number(fightCardPreview.existingFightCardRowCount) || 0;
    const fightCount = Number(fightCardPreview.fightCount) || 0;
    setAdminConfirmation({
      action: 'import',
      event,
      title: existingRows > 0 ? 'Replace this fight card?' : 'Import this fight card?',
      summary: existingRows > 0
        ? `${event.name} currently has ${existingRows} fighter row${existingRows === 1 ? '' : 's'} that will be replaced.`
        : `${fightCount} fight${fightCount === 1 ? '' : 's'} will be imported for ${event.name}.`,
      details: [
        `${fightCount} previewed fight${fightCount === 1 ? '' : 's'} will be saved.`,
        ...(manualPreviewUpdateCount > 0
          ? [`${manualPreviewUpdateCount} manual preview value${manualPreviewUpdateCount === 1 ? '' : 's'} will be included.`]
          : []),
        ...(existingRows > 0 ? ['The existing event fight-card rows will be replaced.'] : []),
      ],
      confirmLabel: existingRows > 0 ? 'Replace fight card' : 'Import fight card',
      tone: existingRows > 0 ? 'danger' : 'caution',
    });
  };

  const handleAdminConfirmation = () => {
    const confirmation = adminConfirmation;
    if (!confirmation) return;
    setAdminConfirmation(null);
    if (confirmation.action === 'finalize') {
      void executeFinalizeEvent(confirmation.event);
    } else if (confirmation.action === 'import') {
      void executeImportFightCard(confirmation.event);
    }
  };

  const handleRefreshOdds = async (event) => {
    if (!event?.id) return;

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setRefreshingOddsEventId(event.id);

    try {
      const response = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/refresh-odds`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to refresh odds'));
      }

      invalidateEventCaches(event.id);
      onFightCardImportComplete?.(event.id);
      const baseMessage = payload.updatedCount > 0
        ? `Updated odds on ${payload.updatedCount} fighter row${payload.updatedCount === 1 ? '' : 's'}.`
        : `No odds changed. ${payload.unchangedCount || 0} fighter row${payload.unchangedCount === 1 ? '' : 's'} already matched.`;
      const warningSuffix = payload.missingOddsCount > 0
        ? ` ${payload.missingOddsCount} row${payload.missingOddsCount === 1 ? '' : 's'} came back without odds and were left unchanged.`
        : '';
      setFightCardFeedback({
        type: 'success',
        message: `${baseMessage}${warningSuffix}`
      });
    } catch (err) {
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to refresh odds'
      });
    } finally {
      setRefreshingOddsEventId(null);
    }
  };

  const handleDiscoverUfcEvents = async () => {
    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setDiscoveringUfcEvents(true);

    try {
      const response = await fetchWithAdminSession(`${API_URL}/admin/events/discover-ufc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to discover UFC events'));
      }

      invalidateEventCaches(null);
      await fetchEvents();

      const changedCount = (payload.insertedCount || 0) + (payload.updatedCount || 0);
      const eventWord = changedCount === 1 ? 'event' : 'events';
      const posterSuffix = payload.posterCount > 0
        ? ` Found ${payload.posterCount} Tapology poster${payload.posterCount === 1 ? '' : 's'}.`
        : '';

      setFightCardFeedback({
        type: 'success',
        message: changedCount > 0
          ? `Synced ${changedCount} UFC ${eventWord}: ${payload.insertedCount || 0} added, ${payload.updatedCount || 0} updated.${posterSuffix}`
          : `No new numbered UFC or UFC Fight Night events found. Scanned ${payload.scanned || 0} ID${payload.scanned === 1 ? '' : 's'}.`
      });
    } catch (err) {
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to discover UFC events'
      });
    } finally {
      setDiscoveringUfcEvents(false);
    }
  };

  const handleToggleFightStatsEditor = async (event) => {
    if (!event?.id) return;

    if (editingFightStatsEventId === event.id) {
      setEditingFightStatsEventId(null);
      setFightStatsRows([]);
      setFightStatsEdits({});
      return;
    }

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setLoadingFightStatsEventId(event.id);

    try {
      const response = await fetchWithAdminSession(`${API_URL}/admin/events/${event.id}/fight-card/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to load fighter stats'));
      }

      setEditingFightStatsEventId(event.id);
      setFightStatsRows(payload.rows || []);
      setFightStatsEdits({});
      setFightStatsEditorFilter('all');
    } catch (err) {
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to load fighter stats'
      });
    } finally {
      setLoadingFightStatsEventId(null);
    }
  };

  const handleToggleImportedFightCardEditor = async (event) => {
    if (!event?.id) return;

    if (fightCardPreview?.isImported && Number(fightCardPreview.eventId) === Number(event.id)) {
      setFightCardPreview(null);
      setFightCardPreviewEdits({});
      setFightCardFeedback(null);
      return;
    }

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setOpeningImportedEditorEventId(event.id);

    try {
      const response = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/fight-card/editor`,
        { method: 'POST' }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to open imported fight-card editor'));
      }

      setFightCardPreview(payload);
      setFightCardPreviewEdits({});
      setPreviewEditorFilter('all');
      setEditingFightStatsEventId(null);
      setFightStatsRows([]);
      setFightStatsEdits({});
      await loadFightCardScrapeLog(event, { silent: true });
      setFightCardFeedback({
        type: 'success',
        message: `Loaded ${payload.rowCount} imported fighter row${payload.rowCount === 1 ? '' : 's'} for editing.`
      });
    } catch (err) {
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to open imported fight-card editor'
      });
    } finally {
      setOpeningImportedEditorEventId(null);
    }
  };

  const handleFightStatsEditChange = (rowId, field, value) => {
    setFightStatsEdits((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveFightStats = async (event, rowId = null) => {
    const updatesToSave = rowId === null
      ? fightStatsUpdates
      : fightStatsUpdates.filter((update) => String(update.id) === String(rowId));
    if (!event?.id || updatesToSave.length === 0) return;

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setSavingFightStatsEventId(event.id);
    setSavingFightStatsRowId(rowId);

    try {
      const response = await fetchWithAdminSession(`${API_URL}/admin/events/${event.id}/fight-card/stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates: updatesToSave })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to save fighter stats'));
      }

      const reloadResponse = await fetchWithAdminSession(`${API_URL}/admin/events/${event.id}/fight-card/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const reloadPayload = await reloadResponse.json().catch(() => ({}));
      if (!reloadResponse.ok) {
        throw new Error(buildApiErrorMessage(reloadPayload, 'Saved stats, but failed to reload rows'));
      }

      setFightStatsRows(reloadPayload.rows || []);
      setFightStatsEdits((current) => omitEditRows(
        current,
        updatesToSave.map((update) => update.id)
      ));
      invalidateEventCaches(event.id);
      onFightCardImportComplete?.(event.id);
      setFightCardFeedback({
        type: 'success',
        message: `Saved stats for ${payload.updatedFightCardRows || 0} fighter row${payload.updatedFightCardRows === 1 ? '' : 's'} and updated ${payload.updatedFighters || 0} fighter profile${payload.updatedFighters === 1 ? '' : 's'}.`
      });
    } catch (err) {
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to save fighter stats'
      });
    } finally {
      setSavingFightStatsEventId(null);
      setSavingFightStatsRowId(null);
    }
  };

  const handleScrapeTapologyFighterStats = async (event, row) => {
    if (!event?.id || !row?.id) return;

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setScrapingTapologyRowId(row.id);

    try {
      const response = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/fight-card/stats/${row.id}/scrape-profile`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tapologyFighterUrl: Object.prototype.hasOwnProperty.call(fightStatsEdits[row.id] || {}, 'TapologyFighterURL')
              ? fightStatsEdits[row.id].TapologyFighterURL
              : row.TapologyFighterURL,
          })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to scrape fighter stats'));
      }

      const reloadResponse = await fetchWithAdminSession(`${API_URL}/admin/events/${event.id}/fight-card/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const reloadPayload = await reloadResponse.json().catch(() => ({}));
      if (!reloadResponse.ok) {
        throw new Error(buildApiErrorMessage(reloadPayload, 'Scraped stats, but failed to reload rows'));
      }

      setFightStatsRows(reloadPayload.rows || []);
      setFightStatsEdits((current) => omitEditRows(current, [row.id]));
      invalidateEventCaches(event.id);
      onFightCardImportComplete?.(event.id);
      await loadFightCardScrapeLog(event, { silent: true });
      const sourceLabel = SCRAPE_SOURCE_LABELS[payload.statsSource] || 'validated fighter sources';
      setFightCardFeedback({
        type: 'success',
        message: payload.updatedFields?.length
          ? `Updated ${[row.FirstName, row.LastName].filter(Boolean).join(' ') || 'fighter'} from ${sourceLabel} and changed ${payload.updatedFields.length} field${payload.updatedFields.length === 1 ? '' : 's'}.`
          : `${sourceLabel} lookup completed for ${[row.FirstName, row.LastName].filter(Boolean).join(' ') || 'fighter'}, but no stat fields changed.`
      });
    } catch (err) {
      await loadFightCardScrapeLog(event, { silent: true });
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to scrape fighter stats'
      });
    } finally {
      setScrapingTapologyRowId(null);
    }
  };

  const handleDiscardFightCardPreview = () => {
    setFightCardPreview(null);
    setFightCardPreviewEdits({});
    setFightCardFeedback(null);
  };

  const requestPreviewTapologyScrape = async (event, row) => {
    const tapologyFighterUrl = normalizeStatEditorValue(
      getEditorValue(fightCardPreviewEdits, row.rowKey, row, 'TapologyFighterURL')
    ).trim();
    const response = await fetchWithAdminSession(
      `${API_URL}/admin/events/${event.id}/fight-card/preview/${fightCardPreview.previewToken}/scrape-profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rowKey: row.rowKey,
          tapologyFighterUrl,
        })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(buildApiErrorMessage(payload, 'Failed to scrape fighter stats'));
    }
    return payload;
  };

  const handleScrapePreviewTapologyFighter = async (event, row) => {
    if (!event?.id || !row?.rowKey || !fightCardPreview?.previewToken) return;

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setScrapingPreviewTapologyRowKeys([row.rowKey]);

    try {
      const payload = await requestPreviewTapologyScrape(event, row);
      setFightCardPreview(payload);
      setFightCardPreviewEdits((current) => omitEditFields(current, {
        [row.rowKey]: ['TapologyFighterURL', ...(payload.updatedFields || [])],
      }));
      const sourceLabel = SCRAPE_SOURCE_LABELS[payload.statsSource] || 'validated fighter sources';
      await loadFightCardScrapeLog(event, { silent: true });
      setFightCardFeedback({
        type: 'success',
        message: payload.updatedFields?.length
          ? `Updated ${getEditablePreviewFighterName(row)} from ${sourceLabel} and changed ${payload.updatedFields.length} field${payload.updatedFields.length === 1 ? '' : 's'}.${payload.isImported ? ' Changes were saved to the fight card.' : ''}`
          : `${sourceLabel} lookup completed for ${getEditablePreviewFighterName(row)}, but no stat fields changed.`
      });
    } catch (err) {
      await loadFightCardScrapeLog(event, { silent: true });
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to scrape fighter stats'
      });
    } finally {
      setScrapingPreviewTapologyRowKeys([]);
    }
  };

  const handleScrapeAllPreviewTapologyFighters = async (event) => {
    if (!event?.id || !fightCardPreview?.previewToken || scrapablePreviewRows.length === 0) return;

    const rowsToScrape = [...scrapablePreviewRows];
    const successfulFieldsByRow = {};
    const failures = [];
    let nextRowIndex = 0;
    let successCount = 0;

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setPreviewTapologyScrapeProgress({ completed: 0, total: rowsToScrape.length });

    const worker = async () => {
      while (nextRowIndex < rowsToScrape.length) {
        const row = rowsToScrape[nextRowIndex];
        nextRowIndex += 1;
        setScrapingPreviewTapologyRowKeys((current) => [...current, row.rowKey]);

        try {
          const payload = await requestPreviewTapologyScrape(event, row);
          successfulFieldsByRow[row.rowKey] = [
            'TapologyFighterURL',
            ...(payload.updatedFields || []),
          ];
          successCount += 1;
        } catch (err) {
          failures.push({
            fighterName: getEditablePreviewFighterName(row),
            message: err.message || 'Scrape failed',
          });
        } finally {
          setScrapingPreviewTapologyRowKeys((current) => (
            current.filter((rowKey) => rowKey !== row.rowKey)
          ));
          setPreviewTapologyScrapeProgress((current) => (
            current ? { ...current, completed: current.completed + 1 } : current
          ));
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(2, rowsToScrape.length) }, () => worker())
      );

      const refreshResponse = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/fight-card/preview/${fightCardPreview.previewToken}/progress`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ manualRowUpdates: {} })
        }
      );
      const refreshedPreview = await refreshResponse.json().catch(() => ({}));
      if (!refreshResponse.ok) {
        throw new Error(buildApiErrorMessage(refreshedPreview, 'Scrapes completed, but the preview could not be refreshed'));
      }

      setFightCardPreview(refreshedPreview);
      setFightCardPreviewEdits((current) => omitEditFields(current, successfulFieldsByRow));
      await loadFightCardScrapeLog(event, { silent: true });
      const failureSuffix = failures.length > 0
        ? ` ${failures.length} failed: ${failures.map((failure) => failure.fighterName).join(', ')}.`
        : '';
      const savedSuffix = refreshedPreview.isImported && successCount > 0
        ? ' Successful results were saved to the fight card.'
        : '';
      setFightCardFeedback({
        type: successCount > 0 ? 'success' : 'error',
        message: `Fighter-source lookup completed for ${successCount}/${rowsToScrape.length} fighter${rowsToScrape.length === 1 ? '' : 's'}.${failureSuffix}${savedSuffix}`
      });
    } catch (err) {
      await loadFightCardScrapeLog(event, { silent: true });
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to scrape preview fighters'
      });
    } finally {
      setScrapingPreviewTapologyRowKeys([]);
      setPreviewTapologyScrapeProgress(null);
    }
  };

  const handleSaveFightCardPreviewProgress = async (event, rowKey = null) => {
    if (!event?.id || !fightCardPreview?.previewToken) return;
    const updatesToSave = rowKey === null
      ? manualPreviewUpdates
      : Object.fromEntries(
        Object.entries(manualPreviewUpdates).filter(([key]) => key === rowKey)
      );
    if (Object.keys(updatesToSave).length === 0) return;

    setAdminAccessFeedback(null);
    setFightCardFeedback(null);
    setSavingPreviewProgressRowKey(rowKey || 'all');

    try {
      const response = await fetchWithAdminSession(
        `${API_URL}/admin/events/${event.id}/fight-card/preview/${fightCardPreview.previewToken}/progress`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ manualRowUpdates: updatesToSave })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(payload, 'Failed to save preview progress'));
      }

      setFightCardPreview(payload);
      setFightCardPreviewEdits((current) => omitEditRows(current, Object.keys(updatesToSave)));
      setFightCardFeedback({
        type: 'success',
        message: payload.isImported
          ? `Saved ${payload.appliedManualUpdateCount || 0} value${payload.appliedManualUpdateCount === 1 ? '' : 's'} and updated ${payload.updatedFightCardRows || 0} fight-card row${payload.updatedFightCardRows === 1 ? '' : 's'}.`
          : `Saved ${payload.appliedManualUpdateCount || 0} preview value${payload.appliedManualUpdateCount === 1 ? '' : 's'}.`
      });
    } catch (err) {
      setFightCardFeedback({
        type: 'error',
        message: err.message || 'Failed to save preview progress'
      });
    } finally {
      setSavingPreviewProgressRowKey(null);
    }
  };

  const handleFightCardPreviewEditChange = (rowKey, field, value) => {
    setFightCardPreviewEdits((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || {}),
        [field]: value,
      },
    }));
  };

  useEffect(() => {
    setFinalizeFeedback(null);
    setFightCardFeedback(null);
    setFightCardPreview(null);
    setFightCardPreviewEdits({});
    setFightCardScrapeLog([]);
    setAdminAccessFeedback(null);
    setAdminToolsOpen(false);
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
        <h2 className="app-section-heading event-selector-heading">Choose an Event</h2>
        <div className="loading-message">Loading events...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="event-selector-carousel-container">
        <h2 className="app-section-heading event-selector-heading">Choose an Event</h2>
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <>
      <h2 className="app-section-heading event-selector-heading">Events</h2>
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
              const isSelected = idx === currentIndex;
              return (
                <button
                  type="button"
                  key={event.id}
                  className={`event-card${event.image_url ? ' has-image' : ''}${isSelected ? ' selected' : ''}${event.status === 'Complete' ? ' completed' : ''}`}
                  onClick={() => handleSelect(idx)}
                  aria-pressed={isSelected}
                  ref={el => cardRefs.current[idx] = el}
                >
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
                    </div>
                  )}
                </button>
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
                      ? 'Admin access active for this login session.'
                      : 'Admin access unavailable. Log out and back in to restore admin controls.'}
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
              <button
                type="button"
                className="event-admin-tools-toggle"
                aria-expanded={adminToolsOpen}
                onClick={() => setAdminToolsOpen((open) => !open)}
              >
                {adminToolsOpen ? 'Hide admin tools' : 'Open admin tools'}
              </button>
            )}
            {canManageAdminActions && adminToolsOpen && (
              <div className="event-admin-panel__actions">
                {finalizeFeedback && (
                  <div className={`event-admin-feedback ${finalizeFeedback.type}`}>
                    {finalizeFeedback.message}
                  </div>
                )}
                <button
                  className="event-admin-finalize-button"
                  onClick={() => requestFinalizeEvent(selectedEvent)}
                  disabled={finalizingEventId === selectedEvent.id}
                >
                  {finalizingEventId === selectedEvent.id
                    ? 'Finalizing...'
                    : selectedEvent.is_completed
                    ? '👑 Recalculate Winners'
                    : '👑 Mark Final & Crown Winners'}
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
                      onClick={() => requestImportFightCard(selectedEvent)}
                      disabled={isFightCardActionBusy}
                    >
                      {importingEventId === selectedEvent.id ? 'Importing...' : 'Import Fight Card'}
                    </button>
                  )}
                </div>
                {fightCardScrapeProgress && (
                  previewingEventId === selectedEvent.id
                  || (
                    fightCardScrapeProgress.status === 'failed'
                    && Number(fightCardScrapeProgress.eventId) === Number(selectedEvent.id)
                  )
                ) && (
                  <div
                    className={`event-admin-scrape-progress event-admin-scrape-progress--${fightCardScrapeProgress.status || 'running'}`}
                    role="status"
                    aria-live="polite"
                  >
                    <div className="event-admin-scrape-progress__heading">
                      <span>{fightCardScrapeProgress.label || 'Refreshing fight card'}</span>
                      <strong>{Math.max(0, Math.min(100, Number(fightCardScrapeProgress.percent) || 0))}%</strong>
                    </div>
                    <div
                      className="event-admin-scrape-progress__track"
                      role="progressbar"
                      aria-label="Fight-card refresh progress"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={Math.max(0, Math.min(100, Number(fightCardScrapeProgress.percent) || 0))}
                    >
                      <span style={{ width: `${Math.max(0, Math.min(100, Number(fightCardScrapeProgress.percent) || 0))}%` }} />
                    </div>
                    <div className="event-admin-scrape-progress__detail">
                      <span>{fightCardScrapeProgress.detail || 'Working…'}</span>
                      {Number.isFinite(Number(fightCardScrapeProgress.current))
                        && Number.isFinite(Number(fightCardScrapeProgress.total))
                        && Number(fightCardScrapeProgress.total) > 0 && (
                          <small>
                            {fightCardScrapeProgress.current}/{fightCardScrapeProgress.total}
                          </small>
                        )}
                    </div>
                  </div>
                )}
                <div className="event-admin-secondary-actions">
                  <button
                    className="event-admin-secondary-button"
                    onClick={() => handleRefreshOdds(selectedEvent)}
                    disabled={isFightCardActionBusy || discoveringUfcEvents || selectedEvent.has_fight_data === false}
                  >
                    {refreshingOddsEventId === selectedEvent.id ? 'Refreshing Odds...' : 'Refresh Odds'}
                  </button>
                  <button
                    className="event-admin-secondary-button"
                    onClick={handleDiscoverUfcEvents}
                    disabled={isFightCardActionBusy || discoveringUfcEvents}
                  >
                    {discoveringUfcEvents ? 'Discovering Events...' : 'Discover UFC Events'}
                  </button>
                  <button
                    className="event-admin-secondary-button"
                    onClick={() => handleToggleFightStatsEditor(selectedEvent)}
                    disabled={isFightCardActionBusy || discoveringUfcEvents || selectedEvent.has_fight_data === false}
                  >
                    {loadingFightStatsEventId === selectedEvent.id
                      ? 'Loading Stats...'
                      : isEditingSelectedFightStats
                      ? 'Close Stats Editor'
                      : 'Edit Fighter Stats'}
                  </button>
                  {!hasFightCardPreview && (
                    <button
                      className="event-admin-secondary-button"
                      onClick={() => handleToggleImportedFightCardEditor(selectedEvent)}
                      disabled={isFightCardActionBusy || discoveringUfcEvents || selectedEvent.has_fight_data === false}
                    >
                      {openingImportedEditorEventId === selectedEvent.id
                        ? 'Opening Editor...'
                        : 'Edit Imported Fight Card'}
                    </button>
                  )}
                  {hasFightCardPreview && (
                    <button
                      className="event-admin-secondary-button"
                      onClick={handleDiscardFightCardPreview}
                      disabled={isFightCardActionBusy || discoveringUfcEvents}
                    >
                      {fightCardPreview.isImported ? 'Close Editor' : 'Discard Preview'}
                    </button>
                  )}
                </div>
                {isEditingSelectedFightStats && (
                  <div className="event-admin-import-preview event-admin-stats-editor">
                    <div className="event-admin-import-preview__section">
                      <div className="event-admin-stats-editor__header">
                        <div>
                          <div className="event-admin-import-preview__title">Fight Card Editor</div>
                          <div className="event-admin-import-preview__meta">
                            {fightStatsRows.length} fighters · {fightStatsUpdateCount} unsaved row{fightStatsUpdateCount === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div className="event-admin-stats-editor__header-actions">
                          <div className="event-admin-stats-editor__filters" aria-label="Filter fighter rows">
                            {['all', 'missing', 'changed'].map((filter) => (
                              <button
                                key={filter}
                                type="button"
                                className={fightStatsEditorFilter === filter ? 'active' : ''}
                                onClick={() => setFightStatsEditorFilter(filter)}
                              >
                                {filter === 'all' ? 'All' : filter === 'missing' ? 'Missing' : 'Changed'}
                              </button>
                            ))}
                          </div>
                          <button
                            className="event-admin-import-button event-admin-stats-editor__save"
                            onClick={() => handleSaveFightStats(selectedEvent)}
                            disabled={isFightCardActionBusy || fightStatsUpdateCount === 0}
                          >
                            <Save size={16} aria-hidden="true" />
                            {savingFightStatsEventId === selectedEvent.id && savingFightStatsRowId === null
                              ? 'Saving...'
                              : `Save All${fightStatsUpdateCount ? ` (${fightStatsUpdateCount})` : ''}`}
                          </button>
                        </div>
                      </div>
                      <div className="event-admin-import-preview__edit-list">
                        {visibleFightStatsRows.map((row) => {
                          const rowUpdate = fightStatsUpdates.find((update) => String(update.id) === String(row.id));
                          const rowMissingCount = FIGHT_CARD_EDITOR_FIELDS.reduce(
                            (count, [field]) => count + (normalizeStatEditorValue(row[field]).trim() ? 0 : 1),
                            0
                          );
                          return (
                            <div key={row.id} className={`event-admin-import-preview__edit-row event-admin-stats-editor__row event-admin-stats-editor__row--${String(row.Corner || '').toLowerCase()}`}>
                              <div className="event-admin-import-preview__fighter">
                                <span>{[row.FirstName, row.LastName].filter(Boolean).join(' ') || 'Unknown fighter'}</span>
                                <small>
                                  {row.Corner || 'Corner TBD'} corner · Fight {row.FightId || 'TBD'}
                                  {row.Record_Wins !== null && row.Record_Losses !== null
                                    ? ` · ${row.Record_Wins}-${row.Record_Losses}`
                                    : ''}
                                </small>
                                <div className="event-admin-stats-editor__row-status">
                                  {rowMissingCount > 0 && <span>{rowMissingCount} missing</span>}
                                  {rowUpdate && <span>{Object.keys(rowUpdate.values).length} changed</span>}
                                </div>
                                <div className="event-admin-stats-editor__row-actions">
                                  <button
                                    type="button"
                                    className="event-admin-stats-editor__scrape-button"
                                    onClick={() => handleScrapeTapologyFighterStats(selectedEvent, row)}
                                    disabled={isFightCardActionBusy}
                                    title="Refresh this fighter from Sherdog, UFC.com, Wikipedia, then Tapology fallback"
                                  >
                                    <RefreshCw size={14} aria-hidden="true" />
                                    {scrapingTapologyRowId === row.id ? 'Scraping...' : 'Scrape'}
                                  </button>
                                  <button
                                    type="button"
                                    className="event-admin-stats-editor__row-save"
                                    onClick={() => handleSaveFightStats(selectedEvent, row.id)}
                                    disabled={isFightCardActionBusy || !rowUpdate}
                                    title="Save this fighter"
                                  >
                                    <Save size={14} aria-hidden="true" />
                                    {savingFightStatsRowId === row.id ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                              <div className="event-admin-import-preview__edit-fields event-admin-stats-editor__fields">
                                {ADMIN_STAT_EDITOR_FIELDS.map(([field, label, type]) => {
                                  const value = getEditorValue(fightStatsEdits, row.id, row, field);
                                  const isMissing = normalizeStatEditorValue(row[field]).trim() === '';
                                  const isDirty = Object.prototype.hasOwnProperty.call(fightStatsEdits[row.id] || {}, field)
                                    && normalizeStatEditorValue(row[field]).trim() !== normalizeStatEditorValue(value).trim();
                                  const isValid = isValidStatEditorValue(type, normalizeStatEditorValue(value).trim());
                                  return (
                                    <label
                                      key={field}
                                      className={`event-admin-import-preview__field ${['number', 'signed-number', 'odds'].includes(type) ? 'event-admin-import-preview__field--stat' : ''} ${type === 'url' ? 'event-admin-import-preview__field--url' : ''} ${isMissing ? 'event-admin-stats-editor__field--missing' : ''} ${isDirty ? 'event-admin-stats-editor__field--dirty' : ''}`}
                                    >
                                      <span>{label}</span>
                                      <input
                                        type={['number', 'signed-number'].includes(type) ? 'number' : type === 'url' ? 'url' : 'text'}
                                        inputMode={['number', 'signed-number'].includes(type) ? 'numeric' : type === 'odds' ? 'text' : type === 'url' ? 'url' : 'text'}
                                        min={type === 'number' ? '0' : undefined}
                                        step={['number', 'signed-number'].includes(type) ? '1' : undefined}
                                        placeholder={type === 'number' ? '0' : type === 'signed-number' ? '-1' : type === 'odds' ? '+120' : type === 'url' ? 'https://www.tapology.com/fightcenter/fighters/...' : 'Wrestler'}
                                        value={value}
                                        onChange={(inputEvent) => handleFightStatsEditChange(row.id, field, inputEvent.target.value)}
                                        disabled={isFightCardActionBusy}
                                        aria-invalid={!isValid}
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                        {visibleFightStatsRows.length === 0 && (
                          <div className="event-admin-stats-editor__empty">No fighters match this view.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {fightCardPreview && (
                  <div className="event-admin-import-preview">
                    <div className="event-admin-import-preview__stats">
                      <span>{fightCardPreview.fightCount} fights</span>
                      <span>{fightCardPreview.rowCount} rows</span>
                      <span>{fightCardPreview.existingFightCardRowCount} existing rows</span>
                      <span>{fightCardPreview.existingFightResultCount} existing results</span>
                    </div>
                    {previewCompletenessItems.length > 0 && (
                      <div className="event-admin-import-preview__section">
                        <div className="event-admin-import-preview__title">Scrape Coverage</div>
                        <div className="event-admin-import-preview__coverage">
                          {previewCompletenessItems.map((item) => (
                            <span
                              key={item.key}
                              className={`event-admin-import-preview__coverage-pill event-admin-import-preview__coverage-pill--${item.tone}`}
                            >
                              {item.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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
                    {editablePreviewRows.length > 0 && (
                      <div className="event-admin-import-preview__section event-admin-stats-editor">
                        <div className="event-admin-stats-editor__header">
                          <div>
                            <div className="event-admin-import-preview__title">
                              {fightCardPreview.isImported ? 'Imported Fight Card Editor' : 'Preview Editor'}
                            </div>
                            <div className="event-admin-import-preview__meta">
                              {missingEditablePreviewValueCount} missing · {manualPreviewUpdateCount} unsaved value{manualPreviewUpdateCount === 1 ? '' : 's'}
                            </div>
                          </div>
                          <div className="event-admin-stats-editor__header-actions">
                            <div className="event-admin-stats-editor__filters" aria-label="Filter preview fighters">
                              {['missing', 'all', 'changed'].map((filter) => (
                                <button
                                  key={filter}
                                  type="button"
                                  className={previewEditorFilter === filter ? 'active' : ''}
                                  onClick={() => setPreviewEditorFilter(filter)}
                                >
                                  {filter === 'all' ? 'All' : filter === 'missing' ? 'Missing' : 'Changed'}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="event-admin-stats-editor__bulk-scrape"
                              onClick={() => handleScrapeAllPreviewTapologyFighters(selectedEvent)}
                              disabled={isFightCardActionBusy || scrapablePreviewRows.length === 0}
                              title="Scrape every preview fighter from the validated source chain"
                            >
                              <RefreshCw size={16} aria-hidden="true" />
                              {previewTapologyScrapeProgress
                                ? `Scraping ${previewTapologyScrapeProgress.completed}/${previewTapologyScrapeProgress.total}`
                                : `Scrape All (${scrapablePreviewRows.length})`}
                            </button>
                            <button
                              type="button"
                              className="event-admin-import-button event-admin-stats-editor__save"
                              onClick={() => handleSaveFightCardPreviewProgress(selectedEvent)}
                              disabled={isFightCardActionBusy || !hasManualPreviewUpdates}
                            >
                              <Save size={16} aria-hidden="true" />
                              {savingPreviewProgressRowKey === 'all'
                                ? 'Saving...'
                                : fightCardPreview.isImported
                                ? 'Save to Fight Card'
                                : 'Save Progress'}
                            </button>
                          </div>
                        </div>
                        <div className="event-admin-import-preview__edit-list">
                          {visiblePreviewRows.map((row) => {
                            const rowPatch = manualPreviewUpdates[row.rowKey];
                            const rowTapologyUrl = normalizeStatEditorValue(
                              getEditorValue(fightCardPreviewEdits, row.rowKey, row, 'TapologyFighterURL')
                            ).trim();
                            const canScrapeTapologyRow = !rowTapologyUrl
                              || isValidStatEditorValue('url', rowTapologyUrl);
                            const isScrapingTapologyRow = scrapingPreviewTapologyRowKeys.includes(row.rowKey);
                            const rowMissingCount = FIGHT_CARD_EDITOR_FIELDS.reduce(
                              (count, [field]) => count + (normalizeStatEditorValue(row[field]).trim() ? 0 : 1),
                              0
                            );
                            return (
                              <div key={row.rowKey} className={`event-admin-import-preview__edit-row event-admin-stats-editor__row event-admin-stats-editor__row--${String(row.corner || '').toLowerCase()}`}>
                                <div className="event-admin-import-preview__fighter">
                                  <span>{getEditablePreviewFighterName(row)}</span>
                                  <small>{row.corner || 'Corner TBD'} corner · Fight {row.fightId || 'TBD'}</small>
                                  <div className="event-admin-stats-editor__row-status">
                                    {rowMissingCount > 0 && <span>{rowMissingCount} missing</span>}
                                    {rowPatch && <span>{Object.keys(rowPatch).length} changed</span>}
                                  </div>
                                  <div className="event-admin-stats-editor__row-actions">
                                    <button
                                      type="button"
                                      className="event-admin-stats-editor__scrape-button"
                                      onClick={() => handleScrapePreviewTapologyFighter(selectedEvent, row)}
                                      disabled={isFightCardActionBusy || !canScrapeTapologyRow}
                                      title={canScrapeTapologyRow
                                        ? 'Scrape Sherdog, UFC.com, Wikipedia, then optional Tapology fallback'
                                        : 'Fix or clear the optional Tapology fallback URL first'}
                                    >
                                      <RefreshCw size={14} aria-hidden="true" />
                                      {isScrapingTapologyRow ? 'Scraping...' : 'Scrape'}
                                    </button>
                                    <button
                                      type="button"
                                      className="event-admin-stats-editor__row-save"
                                      onClick={() => handleSaveFightCardPreviewProgress(selectedEvent, row.rowKey)}
                                      disabled={isFightCardActionBusy || !rowPatch}
                                      title={fightCardPreview.isImported
                                        ? 'Save this fighter to the fight card'
                                        : "Save this fighter's preview progress"}
                                    >
                                      <Save size={14} aria-hidden="true" />
                                      {savingPreviewProgressRowKey === row.rowKey ? 'Saving...' : 'Save'}
                                    </button>
                                  </div>
                                </div>
                                <div className="event-admin-import-preview__edit-fields event-admin-stats-editor__fields">
                                  {FIGHT_CARD_EDITOR_FIELDS.map(([field, label, type]) => {
                                    const value = getEditorValue(fightCardPreviewEdits, row.rowKey, row, field);
                                    const isMissing = normalizeStatEditorValue(row[field]).trim() === '';
                                    const isDirty = Object.prototype.hasOwnProperty.call(fightCardPreviewEdits[row.rowKey] || {}, field)
                                      && normalizeStatEditorValue(row[field]).trim() !== normalizeStatEditorValue(value).trim();
                                    const isValid = isValidStatEditorValue(type, normalizeStatEditorValue(value).trim());
                                    return (
                                      <label
                                        key={field}
                                        className={`event-admin-import-preview__field ${['number', 'signed-number', 'odds'].includes(type) ? 'event-admin-import-preview__field--stat' : ''} ${type === 'url' ? 'event-admin-import-preview__field--url' : ''} ${isMissing ? 'event-admin-stats-editor__field--missing' : ''} ${isDirty ? 'event-admin-stats-editor__field--dirty' : ''}`}
                                      >
                                        <span>{label}</span>
                                        <input
                                          type={['number', 'signed-number'].includes(type) ? 'number' : type === 'url' ? 'url' : 'text'}
                                          inputMode={['number', 'signed-number'].includes(type) ? 'numeric' : type === 'url' ? 'url' : 'text'}
                                          min={type === 'number' ? '0' : undefined}
                                          step={['number', 'signed-number'].includes(type) ? '1' : undefined}
                                          placeholder={type === 'number' ? '0' : type === 'signed-number' ? '-1' : type === 'odds' ? '+120' : type === 'url' ? 'https://www.tapology.com/fightcenter/fighters/...' : 'Wrestler'}
                                          value={value}
                                          onChange={(inputEvent) => handleFightCardPreviewEditChange(row.rowKey, field, inputEvent.target.value)}
                                          disabled={isFightCardActionBusy}
                                          aria-invalid={!isValid}
                                        />
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                          {visiblePreviewRows.length === 0 && (
                            <div className="event-admin-stats-editor__empty">No fighters match this view.</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="event-admin-import-preview__section event-admin-scrape-log">
                      <div className="event-admin-scrape-log__header">
                        <div>
                          <div className="event-admin-import-preview__title">Fighter Source Scrape Log</div>
                          <div className="event-admin-import-preview__meta">Newest attempts first</div>
                        </div>
                        <button
                          type="button"
                          className="event-admin-scrape-log__refresh"
                          onClick={() => loadFightCardScrapeLog(selectedEvent)}
                          disabled={loadingFightCardScrapeLog}
                          aria-label="Refresh fighter source scrape log"
                          title="Refresh fighter source scrape log"
                        >
                          <RefreshCw size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="event-admin-scrape-log__entries">
                        {fightCardScrapeLog.map((entry) => {
                          const status = entry.status || 'failed';
                          const fighterLabel = entry.fighterName
                            || (entry.fighterId ? `Fighter ${entry.fighterId}` : 'Unknown fighter');
                          return (
                            <div key={entry.id} className={`event-admin-scrape-log__entry event-admin-scrape-log__entry--${status}`}>
                              <div className="event-admin-scrape-log__summary">
                                <strong>{fighterLabel}</strong>
                                <span className="event-admin-scrape-log__status">{status}</span>
                                <time dateTime={entry.createdAt}>
                                  {new Date(entry.createdAt).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                  })}
                                </time>
                              </div>
                              <div className="event-admin-scrape-log__detail">
                                Source: {SCRAPE_SOURCE_LABELS[entry.source] || entry.source || 'Unknown'}
                                {entry.updatedFields?.length > 0
                                  ? ` · Updated: ${formatScrapeFields(entry.updatedFields)}`
                                  : ' · No fight-card fields changed'}
                              </div>
                              {entry.fieldsMissing?.length > 0 && (
                                <div className="event-admin-scrape-log__missing">
                                  Missing: {formatScrapeFields(entry.fieldsMissing)}
                                </div>
                              )}
                              {entry.streakDetail && (
                                <div className="event-admin-scrape-log__streak">Streak: {entry.streakDetail}</div>
                              )}
                              {entry.tapologyError && (
                                <div className="event-admin-scrape-log__error">Source error: {entry.tapologyError}</div>
                              )}
                              {entry.fallbackError && (
                                <div className="event-admin-scrape-log__error">Fallback: {entry.fallbackError}</div>
                              )}
                              {entry.warnings?.map((warning) => (
                                <div key={warning} className="event-admin-scrape-log__warning">{warning}</div>
                              ))}
                            </div>
                          );
                        })}
                        {fightCardScrapeLog.length === 0 && (
                          <div className="event-admin-stats-editor__empty">
                            {loadingFightCardScrapeLog ? 'Loading scrape attempts...' : 'No fighter source scrape attempts recorded for this event.'}
                          </div>
                        )}
                      </div>
                    </div>
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
                        {fightCardPreview.isImported ? 'Editor session' : 'Preview token'} ready until {new Date(fightCardPreview.expiresAt).toLocaleTimeString([], {
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
      <ConfirmDialog
        open={Boolean(adminConfirmation)}
        title={adminConfirmation?.title || ''}
        summary={adminConfirmation?.summary || ''}
        details={adminConfirmation?.details || []}
        confirmLabel={adminConfirmation?.confirmLabel || 'Confirm'}
        tone={adminConfirmation?.tone || 'caution'}
        onCancel={() => setAdminConfirmation(null)}
        onConfirm={handleAdminConfirmation}
      />
    </>
  );
}

export default EventSelector;
