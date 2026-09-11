const PERFORMANCE_STAT_TYPES = {
  SigStrLandedPerMin: 'decimal',
  SigStrAbsorbedPerMin: 'decimal',
  SigStrikeAccuracyPct: 'percentage',
  SigStrikeDefensePct: 'percentage',
  TakedownAvgPer15: 'decimal',
  TakedownAccuracyPct: 'percentage',
  TakedownDefensePct: 'percentage',
  SubmissionAvgPer15: 'decimal',
  KnockdownAvgPer15: 'decimal',
  AverageFightTimeSeconds: 'seconds',
  RecentForm: 'form',
  LastFightDate: 'date',
};
const PERFORMANCE_STAT_FIELDS = Object.keys(PERFORMANCE_STAT_TYPES);

function normalizePerformanceStatValue(field, value) {
  const type = PERFORMANCE_STAT_TYPES[field];
  if (!type) return { ok: false, error: `Unsupported performance field: ${field}` };
  const text = value == null ? '' : String(value).trim();
  if (!text) return { ok: true, value: null };
  if (type === 'decimal' || type === 'percentage') {
    const parsed = Number(text);
    return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) && Number.isFinite(parsed)
      && parsed >= 0 && (type !== 'percentage' || parsed <= 100)
      ? { ok: true, value: parsed }
      : { ok: false, error: `${field} must be ${type === 'percentage' ? 'a percentage from 0 to 100' : 'a non-negative decimal number'}` };
  }
  if (type === 'seconds') {
    return /^\d+$/.test(text) && Number(text) <= 2147483647
      ? { ok: true, value: Number(text) }
      : { ok: false, error: `${field} must be whole seconds from 0 to 2147483647` };
  }
  if (type === 'date') {
    const date = new Date(`${text}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number(text.slice(0, 4)) > 0
      && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
      ? { ok: true, value: text }
      : { ok: false, error: `${field} must be a valid date in YYYY-MM-DD format` };
  }
  const normalized = text.toUpperCase().split(',').map((part) => part.trim()).join(',');
  return /^(?:W|L|D|NC)(?:,(?:W|L|D|NC)){0,4}$/.test(normalized)
    ? { ok: true, value: normalized }
    : { ok: false, error: `${field} must contain up to five comma-separated W, L, D, or NC results, newest first` };
}

module.exports = { PERFORMANCE_STAT_FIELDS, PERFORMANCE_STAT_TYPES, normalizePerformanceStatValue };
