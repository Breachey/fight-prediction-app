export const AVATAR_PATTERNS = [
  { id: 'solid', label: 'Solid' },
  { id: 'spots', label: 'Spots' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'split', label: 'Split' },
  { id: 'checker', label: 'Checker' },
  { id: 'drips', label: 'Drips' },
  { id: 'waves', label: 'Waves' },
  { id: 'many-eyes', label: 'Many eyes' },
];

export const AVATAR_CHARACTERS = [
  { id: 'squid', label: 'Squid' },
  { id: 'kirby', label: 'Kirby' },
  { id: 'cloudee', label: 'Cloudee' },
  { id: 'red-panda', label: 'Red panda' },
  { id: 'ogre', label: 'Shrek' },
  { id: 'golden-retriever', label: 'Golden retriever' },
];

export const AVATAR_EYES = [
  { id: 'oval', label: 'Oval' },
  { id: 'round', label: 'Round' },
  { id: 'sleepy', label: 'Sleepy' },
  { id: 'focus', label: 'Focus' },
  { id: 'tiny', label: 'Tiny' },
  { id: 'wide', label: 'Wide' },
  { id: 'side-eye', label: 'Side eye' },
  { id: 'skeptical', label: 'Skeptical' },
  { id: 'determined', label: 'Determined' },
  { id: 'curious', label: 'Curious' },
  { id: 'joy', label: 'Joy' },
  { id: 'angry', label: 'Angry' },
  { id: 'heart', label: 'Heart eyes' },
  { id: 'stars', label: 'Starstruck' },
  { id: 'dead', label: 'Dead' },
  { id: 'spiral', label: 'Spiral' },
  { id: 'teary', label: 'Teary' },
  { id: 'possessed', label: 'Possessed' },
];

export const DEFAULT_AVATAR_CONFIG = Object.freeze({
  character: 'squid',
  color: '#2B31B2',
  eyeColor: '#050000',
  patternColor: '#050000',
  pattern: 'solid',
  eyes: 'oval',
  width: 100,
  height: 100,
  roundness: 72,
  tentacleSpread: 100,
  tentacleLength: 100,
  eyeSpacing: 100,
  size: 100,
  motion: 45,
});

export const AVATAR_SLIDERS = Object.freeze({
  width: { label: 'Width', min: 70, max: 130, step: 1 },
  height: { label: 'Height', min: 75, max: 125, step: 1 },
  roundness: { label: 'Head curve', min: 10, max: 100, step: 1 },
  tentacleSpread: { label: 'Tentacle spread', min: 70, max: 130, step: 1 },
  tentacleLength: { label: 'Tentacle length', min: 70, max: 125, step: 1 },
  eyeSpacing: { label: 'Eye spacing', min: 70, max: 130, step: 1 },
  size: { label: 'Overall size', min: 80, max: 120, step: 1 },
  motion: { label: 'Motion', min: 0, max: 100, step: 1 },
});

const OPTION_IDS = {
  character: new Set(AVATAR_CHARACTERS.map((option) => option.id)),
  pattern: new Set(AVATAR_PATTERNS.map((option) => option.id)),
  eyes: new Set(AVATAR_EYES.map((option) => option.id)),
};

const LEGACY_COLORS = {
  'persian-blue': '#2B31B2',
  'burnt-tangerine': '#E9170D',
  'cotton-candy': '#F99EAD',
  white: '#FCFBFD',
  black: '#050000',
};

const LEGACY_SHAPES = {
  classic: {},
  tall: { width: 84, height: 118, roundness: 82 },
  wide: { width: 126, height: 84, roundness: 72 },
  diamond: { width: 96, height: 104, roundness: 18 },
};

const RANDOM_COLORS = ['#2B31B2', '#E9170D', '#F99EAD', '#FCFBFD', '#050000', '#1E3A8A', '#7F1D1D', '#334155'];

export function isAvatarColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function getAvatarContrastColor(hexColor) {
  if (!isAvatarColor(hexColor)) return '#050000';
  const value = Number.parseInt(hexColor.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return ((red * 299) + (green * 587) + (blue * 114)) / 1000 < 48 ? '#FCFBFD' : '#050000';
}

function normalizeSliderValue(key, value) {
  const slider = AVATAR_SLIDERS[key];
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_AVATAR_CONFIG[key];
  return Math.round(Math.min(slider.max, Math.max(slider.min, numericValue)));
}

export function normalizeAvatarConfig(config) {
  const candidate = config && typeof config === 'object' ? config : {};
  const legacyShape = LEGACY_SHAPES[candidate.shape] || {};
  const color = LEGACY_COLORS[candidate.color] || candidate.color;
  const normalizedColor = isAvatarColor(color) ? color.toUpperCase() : DEFAULT_AVATAR_CONFIG.color;
  const fallbackDetailColor = getAvatarContrastColor(normalizedColor);

  return {
    character: OPTION_IDS.character.has(candidate.character) ? candidate.character : DEFAULT_AVATAR_CONFIG.character,
    color: normalizedColor,
    eyeColor: isAvatarColor(candidate.eyeColor) ? candidate.eyeColor.toUpperCase() : fallbackDetailColor,
    patternColor: isAvatarColor(candidate.patternColor) ? candidate.patternColor.toUpperCase() : fallbackDetailColor,
    pattern: OPTION_IDS.pattern.has(candidate.pattern) ? candidate.pattern : DEFAULT_AVATAR_CONFIG.pattern,
    eyes: OPTION_IDS.eyes.has(candidate.eyes) ? candidate.eyes : DEFAULT_AVATAR_CONFIG.eyes,
    ...Object.fromEntries(
      Object.keys(AVATAR_SLIDERS).map((key) => [
        key,
        normalizeSliderValue(key, candidate[key] ?? legacyShape[key]),
      ])
    ),
  };
}

export function avatarConfigsEqual(left, right) {
  const normalizedLeft = normalizeAvatarConfig(left);
  const normalizedRight = normalizeAvatarConfig(right);
  return Object.keys(DEFAULT_AVATAR_CONFIG).every((key) => normalizedLeft[key] === normalizedRight[key]);
}

export function randomAvatarConfig() {
  const pick = (options) => options[Math.floor(Math.random() * options.length)].id;
  const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const color = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)];
  const detailColor = getAvatarContrastColor(color);
  return {
    character: pick(AVATAR_CHARACTERS),
    color,
    eyeColor: detailColor,
    patternColor: detailColor,
    pattern: pick(AVATAR_PATTERNS),
    eyes: pick(AVATAR_EYES),
    ...Object.fromEntries(
      Object.entries(AVATAR_SLIDERS).map(([key, slider]) => [
        key,
        key === 'motion'
          ? randomBetween(20, slider.max)
          : randomBetween(slider.min, slider.max),
      ])
    ),
  };
}

export function cursedAvatarConfig() {
  const base = randomAvatarConfig();
  const cursedCharacters = ['ogre', 'golden-retriever', 'red-panda'];
  const cursedPatterns = ['many-eyes', 'drips', 'checker'];
  const cursedEyes = ['possessed', 'spiral', 'dead'];
  const pick = (values) => values[Math.floor(Math.random() * values.length)];
  const color = pick(['#2B31B2', '#E9170D', '#F99EAD', '#050000']);
  const detailColor = getAvatarContrastColor(color);

  return {
    ...base,
    character: pick(cursedCharacters),
    color,
    eyeColor: detailColor,
    patternColor: color === '#2B31B2' ? '#F99EAD' : '#2B31B2',
    pattern: pick(cursedPatterns),
    eyes: pick(cursedEyes),
    width: 118 + Math.floor(Math.random() * 13),
    height: 82 + Math.floor(Math.random() * 15),
    roundness: 10 + Math.floor(Math.random() * 31),
    eyeSpacing: 108 + Math.floor(Math.random() * 23),
    size: 108 + Math.floor(Math.random() * 13),
    motion: 76 + Math.floor(Math.random() * 25),
  };
}
