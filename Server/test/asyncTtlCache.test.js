const assert = require('node:assert/strict');
const test = require('node:test');
const { createAsyncTtlCache } = require('../lib/asyncTtlCache');

test('async TTL cache reuses fresh values and deduplicates concurrent loads', async () => {
  let now = 1000;
  let loads = 0;
  const cache = createAsyncTtlCache({ ttlMs: 100, now: () => now });
  const loader = async () => {
    loads += 1;
    await Promise.resolve();
    return `value-${loads}`;
  };

  const [first, concurrent] = await Promise.all([cache.get(loader), cache.get(loader)]);
  assert.equal(first, 'value-1');
  assert.equal(concurrent, 'value-1');
  assert.equal(await cache.get(loader), 'value-1');
  assert.equal(loads, 1);

  now += 101;
  assert.equal(await cache.get(loader), 'value-2');
  assert.equal(loads, 2);
});

test('async TTL cache can be invalidated and serves stale data on refresh failure', async () => {
  let now = 1000;
  let failedLoads = 0;
  const cache = createAsyncTtlCache({ ttlMs: 100, now: () => now });
  assert.equal(await cache.get(async () => 'stable'), 'stable');

  now += 101;
  const failingLoader = async () => {
    failedLoads += 1;
    throw new Error('temporary failure');
  };
  assert.equal(await cache.get(failingLoader), 'stable');
  assert.equal(await cache.get(failingLoader), 'stable');
  assert.equal(failedLoads, 1);

  cache.invalidate();
  await assert.rejects(cache.get(async () => { throw new Error('no fallback'); }), /no fallback/);
});
