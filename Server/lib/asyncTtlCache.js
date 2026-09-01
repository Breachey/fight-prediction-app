function createAsyncTtlCache({ ttlMs, now = Date.now } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error('A positive ttlMs is required.');
  }

  let cachedValue;
  let cachedAt = 0;
  let inFlight = null;

  async function get(loader) {
    const currentTime = now();
    if (cachedValue !== undefined && currentTime - cachedAt < ttlMs) {
      return cachedValue;
    }

    if (inFlight) {
      return inFlight;
    }

    const staleValue = cachedValue;
    inFlight = Promise.resolve()
      .then(loader)
      .then((value) => {
        cachedValue = value;
        cachedAt = now();
        return value;
      })
      .catch((error) => {
        if (staleValue !== undefined) {
          cachedAt = now();
          return staleValue;
        }
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  function invalidate() {
    cachedValue = undefined;
    cachedAt = 0;
  }

  return { get, invalidate };
}

module.exports = { createAsyncTtlCache };
