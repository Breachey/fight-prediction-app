export function parseFighterMetric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getComparisonWidth(value, opponentValue, minimumMax = 1) {
  const parsed = parseFighterMetric(value);
  if (parsed === null) return 0;
  const opponent = parseFighterMetric(opponentValue) ?? 0;
  const maximum = Math.max(parsed, opponent, minimumMax);
  return Math.min(100, (parsed / maximum) * 100);
}

export function getMetricScaleRatio(value, maximum) {
  const parsed = parseFighterMetric(value);
  const parsedMaximum = parseFighterMetric(maximum);
  if (parsed === null || parsedMaximum === null || parsedMaximum === 0) return null;
  return Math.min(1, parsed / parsedMaximum);
}

export function getMetricScalePosition(value, maximum, inset = 4) {
  const ratio = getMetricScaleRatio(value, maximum);
  if (ratio === null) return null;
  const safeInset = Math.max(0, Math.min(49, Number(inset) || 0));
  return safeInset + (ratio * (100 - (safeInset * 2)));
}

export function parseRecentForm(value) {
  return String(value || '')
    .split(',')
    .map((result) => result.trim().toUpperCase())
    .filter((result) => ['W', 'L', 'D', 'NC'].includes(result))
    .slice(0, 5);
}

export function formatAverageFightTime(seconds) {
  const parsed = parseFighterMetric(seconds);
  if (parsed === null) return 'N/A';
  const wholeSeconds = Math.round(parsed);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

export function formatLastFightRecency(value, now = new Date()) {
  if (!value) return 'Last fight unavailable';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Last fight unavailable';
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
  if (days < 14) return `${days}d since last fight`;
  if (days < 70) return `${Math.round(days / 7)}w since last fight`;
  if (days < 730) return `${Math.round(days / 30.4375)}mo since last fight`;
  return `${(days / 365.25).toFixed(1)}y since last fight`;
}
