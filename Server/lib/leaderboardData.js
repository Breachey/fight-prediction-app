// Shared, short-lived snapshot of the data every leaderboard is built from.
//
// Before this existed, each leaderboard request re-read the whole
// prediction_results table (season did it three times). Now one snapshot is
// loaded per instance, reused by every leaderboard until it expires or a
// write calls invalidate(), and concurrent requests share a single load.

const DEFAULT_SNAPSHOT_TTL_MS = 20 * 1000;
const DEFAULT_MEMO_MAX_ENTRIES = 200;

function createLeaderboardDataStore({
  loadSnapshot,
  ttlMs = DEFAULT_SNAPSHOT_TTL_MS,
  memoMaxEntries = DEFAULT_MEMO_MAX_ENTRIES,
  now = Date.now,
} = {}) {
  if (typeof loadSnapshot !== 'function') {
    throw new Error('loadSnapshot is required.');
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('A positive ttlMs is required.');
  }

  // Bumped on every invalidate() so a load that started before a write can
  // never be stored as the current snapshot.
  let generation = 0;
  let cached = null; // { value, loadedAt, generation }
  let inFlight = null; // { promise, generation }
  const memo = new Map(); // key -> { deps, promise }

  function getSnapshot() {
    if (cached && cached.generation === generation && now() - cached.loadedAt < ttlMs) {
      return Promise.resolve(cached.value);
    }

    if (inFlight && inFlight.generation === generation) {
      return inFlight.promise;
    }

    const loadGeneration = generation;
    const promise = Promise.resolve()
      .then(loadSnapshot)
      .then((value) => {
        if (loadGeneration === generation) {
          cached = { value, loadedAt: now(), generation: loadGeneration };
          // Results memoized against the previous snapshot are now unreachable.
          memo.clear();
        }
        return value;
      })
      .finally(() => {
        if (inFlight && inFlight.promise === promise) {
          inFlight = null;
        }
      });

    inFlight = { promise, generation: loadGeneration };
    return promise;
  }

  function invalidate() {
    generation += 1;
    cached = null;
    memo.clear();
  }

  // Caches a computed leaderboard until any of its deps (compared by
  // identity, e.g. the snapshot and user cache objects) change.
  function memoize(key, deps, compute) {
    const existing = memo.get(key);
    if (
      existing
      && existing.deps.length === deps.length
      && existing.deps.every((dep, index) => dep === deps[index])
    ) {
      return existing.promise;
    }

    if (memo.size >= memoMaxEntries) {
      memo.clear();
    }

    const promise = Promise.resolve().then(compute);
    const entry = { deps: [...deps], promise };
    memo.set(key, entry);
    promise.catch(() => {
      if (memo.get(key) === entry) {
        memo.delete(key);
      }
    });
    return promise;
  }

  return { getSnapshot, invalidate, memoize };
}

function groupRows(rows, keyFn) {
  const grouped = new Map();
  (rows || []).forEach((row) => {
    const key = keyFn(row);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  });
  return grouped;
}

function buildLeaderboardSnapshot({ results = [], events = [], eventWinners = [] } = {}) {
  const safeResults = Array.isArray(results) ? results : [];
  const safeEvents = Array.isArray(events) ? events : [];
  const safeWinners = Array.isArray(eventWinners) ? eventWinners : [];

  return {
    results: safeResults,
    resultsByEvent: groupRows(safeResults, (row) => String(row?.event_id)),
    events: safeEvents,
    eventWinners: safeWinners,
    scopedResultsCache: new WeakMap(),
  };
}

// Matches Postgres `date >= 'YYYY-01-01' AND date < 'YYYY+1-01-01'` for the
// ISO date / UTC timestamp strings Supabase returns.
function isDateInYear(dateValue, year) {
  if (dateValue === null || dateValue === undefined || year === undefined || year === null) {
    return false;
  }
  const datePart = String(dateValue).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return false;
  }
  const numericYear = Number(year);
  return datePart >= `${numericYear}-01-01` && datePart < `${numericYear + 1}-01-01`;
}

function getEventsInYear(snapshot, year) {
  return (snapshot?.events || []).filter((event) => isDateInYear(event?.date, year));
}

// Equivalent of `.in('user_id', userIds)` on prediction_results.
function getResultsForUsers(snapshot, userIds) {
  const idSet = new Set((userIds || []).map((id) => String(id)));
  return (snapshot?.results || []).filter((row) => idSet.has(String(row?.user_id)));
}

// Results limited to users in the given user cache, computed once per
// snapshot + user cache pair.
function getScopedResults(snapshot, userCache) {
  if (!snapshot || !userCache) {
    return [];
  }
  const cache = snapshot.scopedResultsCache;
  if (cache && cache.has(userCache)) {
    return cache.get(userCache);
  }
  const ids = (userCache.users || []).map((user) => user?.user_id).filter((id) => id !== null && id !== undefined);
  const scoped = getResultsForUsers(snapshot, ids);
  if (cache) {
    cache.set(userCache, scoped);
  }
  return scoped;
}

function getEventResultsForUsers(snapshot, eventId, userIds) {
  const eventRows = snapshot?.resultsByEvent?.get(String(eventId)) || [];
  const idSet = new Set((userIds || []).map((id) => String(id)));
  return eventRows.filter((row) => idSet.has(String(row?.user_id)));
}

// In-memory version of the old fetchEventWinCounts query.
function countEventWins(snapshot, userIds, year) {
  let winners = snapshot?.eventWinners || [];

  if (Array.isArray(userIds)) {
    if (userIds.length === 0) {
      return {};
    }
    const idSet = new Set(userIds.map((id) => String(id)));
    winners = winners.filter((row) => idSet.has(String(row?.user_id)));
  }

  if (year !== undefined && winners.length > 0) {
    const eventIdsForYear = new Set(
      getEventsInYear(snapshot, year).map((event) => Number(event.id))
    );
    winners = winners.filter((row) => eventIdsForYear.has(Number(row?.event_id)));
  }

  const counts = {};
  winners.forEach((row) => {
    const key = String(row.user_id);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

// In-memory version of the old fetchHumanEventWinCounts query: the top
// scorer(s) among humans in each completed event earn a crown.
function countHumanEventWins(snapshot, userIds, year, userIdToIsBot) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return {};
  }

  const uniqueIds = Array.from(new Set(userIds.map((id) => String(id))));
  const humanUserIds = new Set(
    uniqueIds.filter((userId) => !(userIdToIsBot && userIdToIsBot.get(String(userId))))
  );
  if (humanUserIds.size === 0) {
    return {};
  }

  const completedEventIds = new Set(
    (snapshot?.events || [])
      .filter((event) => event?.is_completed === true)
      .filter((event) => year === undefined || isDateInYear(event?.date, year))
      .map((event) => String(event.id))
  );
  if (completedEventIds.size === 0) {
    return {};
  }

  const eventUserPoints = new Map();
  (snapshot?.results || []).forEach((result) => {
    const eventIdStr = String(result?.event_id);
    const userIdStr = String(result?.user_id);
    if (!completedEventIds.has(eventIdStr) || !humanUserIds.has(userIdStr)) {
      return;
    }
    if (!eventUserPoints.has(eventIdStr)) {
      eventUserPoints.set(eventIdStr, new Map());
    }
    const userPoints = eventUserPoints.get(eventIdStr);
    userPoints.set(userIdStr, (userPoints.get(userIdStr) || 0) + (Number(result.points) || 0));
  });

  const counts = {};
  for (const userPoints of eventUserPoints.values()) {
    let topPoints = null;
    for (const points of userPoints.values()) {
      if (topPoints === null || points > topPoints) {
        topPoints = points;
      }
    }
    if (topPoints === null) {
      continue;
    }
    for (const [userIdStr, points] of userPoints.entries()) {
      if (points === topPoints) {
        counts[userIdStr] = (counts[userIdStr] || 0) + 1;
      }
    }
  }
  return counts;
}

// Reads every row of a large table using parallel page requests instead of
// one page after another. buildQuery(selectOptions) must return a fresh
// Supabase select each call; pages are joined in range order.
async function fetchAllRowsInParallel(buildQuery, { pageSize = 1000, concurrency = 6 } = {}) {
  const { count, error: countError } = await buildQuery({ count: 'exact', head: true });
  if (countError) {
    throw countError;
  }

  const total = Number(count);
  if (!Number.isFinite(total) || total <= 0) {
    return [];
  }

  const pageCount = Math.ceil(total / pageSize);
  const pages = new Array(pageCount);
  let nextPage = 0;

  async function fetchPage(pageIndex) {
    const from = pageIndex * pageSize;
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) {
      throw error;
    }
    return data || [];
  }

  async function worker() {
    while (nextPage < pageCount) {
      const pageIndex = nextPage;
      nextPage += 1;
      pages[pageIndex] = await fetchPage(pageIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pageCount) }, () => worker())
  );

  // Rows added between the count and the reads land on later pages.
  let lastPage = pages[pageCount - 1] || [];
  let extraPageIndex = pageCount;
  while (lastPage.length === pageSize) {
    lastPage = await fetchPage(extraPageIndex);
    pages.push(lastPage);
    extraPageIndex += 1;
  }

  return pages.flat();
}

module.exports = {
  DEFAULT_SNAPSHOT_TTL_MS,
  buildLeaderboardSnapshot,
  countEventWins,
  countHumanEventWins,
  createLeaderboardDataStore,
  fetchAllRowsInParallel,
  getEventResultsForUsers,
  getEventsInYear,
  getResultsForUsers,
  getScopedResults,
  isDateInYear,
};
