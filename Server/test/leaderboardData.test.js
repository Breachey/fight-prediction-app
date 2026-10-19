const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildLeaderboardSnapshot,
  countEventWins,
  countHumanEventWins,
  createLeaderboardDataStore,
  fetchAllRowsInParallel,
  getEventResultsForUsers,
  getEventsInYear,
  getScopedResults,
  isDateInYear,
} = require('../lib/leaderboardData');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('snapshot is shared by concurrent callers and reused until the TTL expires', async () => {
  let clock = 0;
  let loads = 0;
  const store = createLeaderboardDataStore({
    ttlMs: 1000,
    now: () => clock,
    loadSnapshot: async () => ({ load: ++loads }),
  });

  const [first, second] = await Promise.all([store.getSnapshot(), store.getSnapshot()]);
  assert.equal(loads, 1);
  assert.equal(first, second);

  clock = 999;
  assert.equal(await store.getSnapshot(), first);
  clock = 1000;
  assert.deepEqual(await store.getSnapshot(), { load: 2 });
});

test('invalidate forces a reload and discards a load that started before the write', async () => {
  const pending = [];
  const store = createLeaderboardDataStore({
    ttlMs: 60000,
    loadSnapshot: () => {
      const next = deferred();
      pending.push(next);
      return next.promise;
    },
  });

  const beforeWrite = store.getSnapshot();
  store.invalidate();
  const afterWrite = store.getSnapshot();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 2);

  pending[0].resolve('stale');
  pending[1].resolve('fresh');
  assert.equal(await beforeWrite, 'stale');
  assert.equal(await afterWrite, 'fresh');
  assert.equal(await store.getSnapshot(), 'fresh');
  assert.equal(pending.length, 2);
});

test('failed loads are not cached', async () => {
  let attempts = 0;
  const store = createLeaderboardDataStore({
    loadSnapshot: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('db down');
      return 'ok';
    },
  });

  await assert.rejects(store.getSnapshot(), /db down/);
  assert.equal(await store.getSnapshot(), 'ok');
});

test('memoize reuses results until deps change or the cache is invalidated', async () => {
  const store = createLeaderboardDataStore({ loadSnapshot: async () => ({}) });
  const depA = {};
  const depB = {};
  let computes = 0;
  const compute = () => ++computes;

  assert.equal(await store.memoize('k', [depA], compute), 1);
  assert.equal(await store.memoize('k', [depA], compute), 1);
  assert.equal(await store.memoize('k', [depB], compute), 2);
  store.invalidate();
  assert.equal(await store.memoize('k', [depB], compute), 3);

  await assert.rejects(store.memoize('err', [depA], () => { throw new Error('boom'); }), /boom/);
  assert.equal(await store.memoize('err', [depA], () => 'recovered'), 'recovered');
});

test('isDateInYear matches the year boundaries the database queries used', () => {
  assert.equal(isDateInYear('2025-01-01', 2025), true);
  assert.equal(isDateInYear('2025-12-31T23:59:59+00:00', 2025), true);
  assert.equal(isDateInYear('2026-01-01', 2025), false);
  assert.equal(isDateInYear('2024-12-31', 2025), false);
  assert.equal(isDateInYear(null, 2025), false);
  assert.equal(isDateInYear('not a date', 2025), false);
});

const snapshot = buildLeaderboardSnapshot({
  results: [
    { user_id: 1, event_id: 10, points: 5 },
    { user_id: 2, event_id: 10, points: 7 },
    { user_id: 3, event_id: 10, points: 9 }, // bot
    { user_id: 1, event_id: 20, points: 4 },
    { user_id: 2, event_id: 20, points: 4 },
    { user_id: 1, event_id: 30, points: 8 }, // event not completed
    { user_id: null, event_id: 10, points: 99 },
  ],
  events: [
    { id: 10, date: '2025-03-01', is_completed: true },
    { id: 20, date: '2026-02-01', is_completed: true },
    { id: 30, date: '2026-05-01', is_completed: false },
  ],
  eventWinners: [
    { user_id: 3, event_id: 10 },
    { user_id: 1, event_id: 20 },
    { user_id: 2, event_id: 20 },
  ],
});
const isBot = new Map([['1', false], ['2', false], ['3', true]]);

test('countEventWins counts stored winners, optionally by event year', () => {
  assert.deepEqual(countEventWins(snapshot, undefined), { 3: 1, 1: 1, 2: 1 });
  assert.deepEqual(countEventWins(snapshot, [1, 3], 2026), { 1: 1 });
  assert.deepEqual(countEventWins(snapshot, [], 2026), {});
});

test('countHumanEventWins crowns top human scorers in completed events, ties included', () => {
  assert.deepEqual(countHumanEventWins(snapshot, [1, 2, 3], undefined, isBot), { 2: 2, 1: 1 });
  assert.deepEqual(countHumanEventWins(snapshot, [1, 2, 3], 2026, isBot), { 1: 1, 2: 1 });
  assert.deepEqual(countHumanEventWins(snapshot, [3], undefined, isBot), {});
});

test('scoped and per-event results only include known users', () => {
  const userCache = { users: [{ user_id: 1 }, { user_id: 2 }] };
  const scoped = getScopedResults(snapshot, userCache);
  assert.equal(scoped.length, 5);
  assert.equal(getScopedResults(snapshot, userCache), scoped);
  assert.deepEqual(getEventResultsForUsers(snapshot, 10, ['1']).map(r => r.points), [5]);
  assert.deepEqual(getEventsInYear(snapshot, 2026).map(e => e.id), [20, 30]);
});

function fakeTable(rows, { growAfterCount = [] } = {}) {
  const table = [...rows];
  const calls = [];
  const buildQuery = (options) => {
    if (options?.head) {
      calls.push('count');
      const result = { count: table.length, error: null };
      table.push(...growAfterCount);
      return Promise.resolve(result);
    }
    return {
      range(from, to) {
        calls.push(`${from}-${to}`);
        return Promise.resolve({ data: table.slice(from, to + 1), error: null });
      },
    };
  };
  return { buildQuery, calls };
}

test('fetchAllRowsInParallel returns every row in table order', async () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ i }));
  const { buildQuery, calls } = fakeTable(rows);
  const fetched = await fetchAllRowsInParallel(buildQuery, { pageSize: 5, concurrency: 3 });
  assert.deepEqual(fetched, rows);
  assert.equal(calls.filter(c => c !== 'count').length, 5);
});

test('fetchAllRowsInParallel picks up rows added after the count', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ i }));
  const extra = Array.from({ length: 3 }, (_, i) => ({ i: 10 + i }));
  const { buildQuery } = fakeTable(rows, { growAfterCount: extra });
  const fetched = await fetchAllRowsInParallel(buildQuery, { pageSize: 5 });
  assert.deepEqual(fetched, [...rows, ...extra]);
});

test('fetchAllRowsInParallel handles an empty table', async () => {
  const { buildQuery } = fakeTable([]);
  assert.deepEqual(await fetchAllRowsInParallel(buildQuery), []);
});
