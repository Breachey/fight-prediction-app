import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedFetchJson, clearPrivateCache, invalidateCache } from '../src/utils/apiCache.js';

const response = (data) => ({ ok: true, status: 200, json: async () => data });

test('deduplicates in-flight requests with the same cache identity', async () => {
  invalidateCache('dedupe');
  let calls = 0;
  let resolveRequest;
  const fetcher = () => {
    calls += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  };
  const first = cachedFetchJson('/dedupe', { cacheKey: 'dedupe', fetcher });
  const second = cachedFetchJson('/dedupe', { cacheKey: 'dedupe', fetcher });
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveRequest(response({ value: 1 }));
  assert.deepEqual(await first, { value: 1 });
  assert.deepEqual(await second, { value: 1 });
});

test('private responses remain memory-only and clear on logout', async () => {
  invalidateCache('private');
  let calls = 0;
  const fetcher = async () => response({ call: ++calls });
  const first = await cachedFetchJson('/private', { cacheKey: 'private', privateCache: true, fetcher });
  const cached = await cachedFetchJson('/private', { cacheKey: 'private', privateCache: true, fetcher });
  assert.deepEqual(first, cached);
  assert.equal(calls, 1);
  clearPrivateCache();
  await cachedFetchJson('/private', { cacheKey: 'private', privateCache: true, fetcher });
  assert.equal(calls, 2);
});

test('stale data is returned when a refresh fails', async () => {
  invalidateCache('stale');
  await cachedFetchJson('/stale', {
    cacheKey: 'stale',
    ttlMs: 0,
    fetcher: async () => response({ saved: true }),
  });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const stale = await cachedFetchJson('/stale', {
    cacheKey: 'stale',
    ttlMs: 0,
    fetcher: async () => { throw new Error('offline'); },
  });
  assert.deepEqual(stale, { saved: true });
});

test('forced refresh can fall back to the last usable response', async () => {
  invalidateCache('forced-stale');
  await cachedFetchJson('/forced-stale', {
    cacheKey: 'forced-stale',
    fetcher: async () => response({ saved: true }),
  });

  const stale = await cachedFetchJson('/forced-stale', {
    cacheKey: 'forced-stale',
    force: true,
    allowStaleOnError: true,
    fetcher: async () => { throw new Error('offline'); },
  });

  assert.deepEqual(stale, { saved: true });
});

test('stale-while-revalidate returns cached data before the refresh finishes', async () => {
  invalidateCache('swr');
  await cachedFetchJson('/swr', {
    cacheKey: 'swr',
    ttlMs: 0,
    fetcher: async () => response({ version: 1 }),
  });
  await new Promise((resolve) => setTimeout(resolve, 2));

  let resolveRefresh;
  const refresh = new Promise((resolve) => { resolveRefresh = resolve; });
  const stale = await cachedFetchJson('/swr', {
    cacheKey: 'swr',
    ttlMs: 0,
    staleWhileRevalidate: true,
    fetcher: () => refresh,
  });

  assert.deepEqual(stale, { version: 1 });
  resolveRefresh(response({ version: 2 }));
  await refresh;
  await new Promise((resolve) => setTimeout(resolve, 0));

  const updated = await cachedFetchJson('/swr', {
    cacheKey: 'swr',
    ttlMs: 1000,
    fetcher: async () => { throw new Error('cache should be fresh'); },
  });
  assert.deepEqual(updated, { version: 2 });
});
