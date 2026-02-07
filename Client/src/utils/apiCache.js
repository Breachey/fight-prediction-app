const MEMORY_CACHE = new Map();
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

const getCacheEntry = (key) => {
  if (MEMORY_CACHE.has(key)) {
    return MEMORY_CACHE.get(key);
  }
  const stored = readStorage(key);
  if (stored) {
    MEMORY_CACHE.set(key, stored);
  }
  return stored;
};

const setCacheEntry = (key, data) => {
  const entry = { ts: Date.now(), data };
  MEMORY_CACHE.set(key, entry);
  writeStorage(key, entry);
};

const isFresh = (entry, ttlMs) => {
  if (!entry) return false;
  return Date.now() - entry.ts <= ttlMs;
};

export const invalidateCache = (key) => {
  MEMORY_CACHE.delete(key);
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(getStorageKey(key));
  } catch (error) {
    // Ignore storage errors
  }
};

export const cachedFetchJson = async (url, options = {}) => {
  const {
    ttlMs = 60000,
    cacheKey = url,
    force = false,
    allowStaleOnError = true
  } = options;

  const cachedEntry = !force ? getCacheEntry(cacheKey) : null;
  if (cachedEntry && isFresh(cachedEntry, ttlMs)) {
    return cachedEntry.data;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    const data = await response.json();
    setCacheEntry(cacheKey, data);
    return data;
  } catch (error) {
    if (allowStaleOnError && cachedEntry) {
      return cachedEntry.data;
    }
    throw error;
  }
};
