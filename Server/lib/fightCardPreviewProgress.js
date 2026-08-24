const crypto = require('node:crypto');

const PROGRESS_PREFIX = 'FIGHT_PICKER_PROGRESS ';
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const progressStore = new Map();

function normalizeProgressToken(value) {
  const token = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{16,96}$/.test(token) ? token : '';
}

function cleanupFightCardPreviewProgress(now = Date.now()) {
  for (const [token, entry] of progressStore.entries()) {
    if (entry.expiresAt <= now) {
      progressStore.delete(token);
    }
  }
}

function createFightCardPreviewProgress({ token, eventId, ttlMs = DEFAULT_TTL_MS }) {
  cleanupFightCardPreviewProgress();
  const normalizedToken = normalizeProgressToken(token) || crypto.randomUUID().replace(/-/g, '');
  const now = Date.now();
  const entry = {
    token: normalizedToken,
    eventId: Number(eventId),
    status: 'running',
    phase: 'starting',
    label: 'Starting fight-card refresh',
    detail: 'Preparing the preview workspace…',
    current: null,
    total: null,
    percent: 1,
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + ttlMs,
  };
  progressStore.set(normalizedToken, entry);
  return { ...entry };
}

function updateFightCardPreviewProgress(token, patch = {}) {
  const normalizedToken = normalizeProgressToken(token);
  const current = progressStore.get(normalizedToken);
  if (!current) return null;

  const now = Date.now();
  const percent = Number(patch.percent);
  const next = {
    ...current,
    ...patch,
    percent: Number.isFinite(percent)
      ? Math.max(current.percent || 0, Math.min(100, Math.round(percent)))
      : current.percent,
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + DEFAULT_TTL_MS,
  };
  progressStore.set(normalizedToken, next);
  return { ...next };
}

function getFightCardPreviewProgress(token, eventId = null) {
  cleanupFightCardPreviewProgress();
  const entry = progressStore.get(normalizeProgressToken(token));
  if (!entry) return null;
  if (eventId !== null && Number(entry.eventId) !== Number(eventId)) return null;
  return { ...entry };
}

function completeFightCardPreviewProgress(token, patch = {}) {
  return updateFightCardPreviewProgress(token, {
    status: 'complete',
    phase: 'complete',
    label: 'Fight-card preview ready',
    percent: 100,
    ...patch,
  });
}

function failFightCardPreviewProgress(token, error) {
  return updateFightCardPreviewProgress(token, {
    status: 'failed',
    phase: 'failed',
    label: 'Fight-card refresh failed',
    detail: String(error?.message || error || 'The preview could not be completed.'),
  });
}

function parseScraperProgressLine(line) {
  const text = String(line || '').trim();
  if (!text.startsWith(PROGRESS_PREFIX)) return null;
  try {
    const payload = JSON.parse(text.slice(PROGRESS_PREFIX.length));
    return payload && typeof payload === 'object' ? payload : null;
  } catch (error) {
    return null;
  }
}

module.exports = {
  PROGRESS_PREFIX,
  cleanupFightCardPreviewProgress,
  completeFightCardPreviewProgress,
  createFightCardPreviewProgress,
  failFightCardPreviewProgress,
  getFightCardPreviewProgress,
  normalizeProgressToken,
  parseScraperProgressLine,
  updateFightCardPreviewProgress,
};
