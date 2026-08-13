const MEMORY_CACHE = new Map();
const PRIVATE_MEMORY_CACHE = new Map();
const IN_FLIGHT_REQUESTS = new Map();
const STORAGE_PREFIX = 'fp-cache:';

const hasSessionStorage = () => {
  try {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
  } catch (error) {
    return false;
  }
};

const getStorageKey = (key) => `${STORAGE_PREFIX}${key}`;

const readStorage = (key) => {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number') return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const writeStorage = (key, value) => {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(getStorageKey(key), JSON.stringify(value));
  } catch (error) {
    // Ignore storage errors (quota, private mode, etc.)
  }
};

const getCacheEntry = (key, privateCache = false) => {
  const targetCache = privateCache ? PRIVATE_MEMORY_CACHE : MEMORY_CACHE;
  if (targetCache.has(key)) {
    return targetCache.get(key);
  }
  if (privateCache) return null;
  const stored = readStorage(key);
  if (stored) {
    MEMORY_CACHE.set(key, stored);
  }
  return stored;
};

const setCacheEntry = (key, data, privateCache = false) => {
  const entry = { ts: Date.now(), data };
  const targetCache = privateCache ? PRIVATE_MEMORY_CACHE : MEMORY_CACHE;
  targetCache.set(key, entry);
  if (!privateCache) writeStorage(key, entry);
};

const isFresh = (entry, ttlMs) => {
  if (!entry) return false;
  return Date.now() - entry.ts <= ttlMs;
};

export const invalidateCache = (key) => {
  MEMORY_CACHE.delete(key);
  PRIVATE_MEMORY_CACHE.delete(key);
  IN_FLIGHT_REQUESTS.delete(`public:${key}`);
  IN_FLIGHT_REQUESTS.delete(`private:${key}`);
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(getStorageKey(key));
  } catch (error) {
    // Ignore storage errors
  }
};

export const clearPrivateCache = () => {
  PRIVATE_MEMORY_CACHE.clear();
  Array.from(IN_FLIGHT_REQUESTS.keys()).forEach((key) => {
    if (key.startsWith('private:')) IN_FLIGHT_REQUESTS.delete(key);
  });
};

const requestAndCache = async ({ url, cacheKey, privateCache, fetcher, fetchOptions }) => {
  const requestKey = `${privateCache ? 'private' : 'public'}:${cacheKey}`;
  if (IN_FLIGHT_REQUESTS.has(requestKey)) {
    return IN_FLIGHT_REQUESTS.get(requestKey);
  }

  const request = (async () => {
    const response = await fetcher(url, fetchOptions);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    setCacheEntry(cacheKey, data, privateCache);
    return data;
  })();

  IN_FLIGHT_REQUESTS.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (IN_FLIGHT_REQUESTS.get(requestKey) === request) {
      IN_FLIGHT_REQUESTS.delete(requestKey);
    }
  }
};

export const cachedFetchJson = async (url, options = {}) => {
  const {
    ttlMs = 60000,
    cacheKey = url,
    force = false,
    allowStaleOnError = true,
    staleWhileRevalidate = false,
    privateCache = false,
    fetcher = fetch,
    fetchOptions
  } = options;

  const cachedEntry = !force ? getCacheEntry(cacheKey, privateCache) : null;
  if (cachedEntry && isFresh(cachedEntry, ttlMs)) {
    return cachedEntry.data;
  }

  if (cachedEntry && staleWhileRevalidate && !force) {
    requestAndCache({ url, cacheKey, privateCache, fetcher, fetchOptions }).catch(() => {});
    return cachedEntry.data;
  }

  try {
    return await requestAndCache({ url, cacheKey, privateCache, fetcher, fetchOptions });
  } catch (error) {
    if (allowStaleOnError && cachedEntry) {
      return cachedEntry.data;
    }
    throw error;
  }
};
