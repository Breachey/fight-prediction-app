const AVATAR_OPTIONS = Object.freeze({
  character: new Set(['squid', 'kirby', 'cloudee', 'red-panda', 'ogre', 'golden-retriever']),
  pattern: new Set(['solid', 'spots', 'stripes', 'split', 'checker', 'drips', 'waves', 'many-eyes']),
  eyes: new Set([
    'oval', 'round', 'sleepy', 'focus', 'tiny',
    'wide', 'side-eye', 'skeptical', 'determined', 'curious',
    'joy', 'angry', 'heart', 'stars', 'dead', 'spiral', 'teary', 'possessed',
  ]),
});

const AVATAR_RANGES = Object.freeze({
  width: [70, 130],
  height: [75, 125],
  roundness: [10, 100],
  tentacleSpread: [70, 130],
  tentacleLength: [70, 125],
  eyeSpacing: [70, 130],
  size: [80, 120],
  motion: [0, 100],
});

const DEFAULT_AVATAR_CONFIG = Object.freeze({
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

const RANDOM_COLORS = Object.freeze([
  '#2B31B2', '#E9170D', '#F99EAD', '#FCFBFD',
  '#050000', '#1E3A8A', '#7F1D1D', '#334155',
]);

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(values) {
  return values[randomInteger(0, values.length - 1)];
}

function getAvatarContrastColor(hexColor) {
  const value = Number.parseInt(hexColor.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return ((red * 299) + (green * 587) + (blue * 114)) / 1000 < 48 ? '#FCFBFD' : '#050000';
}

function randomAvatarConfig() {
  const color = pickRandom(RANDOM_COLORS);
  const detailColor = getAvatarContrastColor(color);
  return {
    character: pickRandom(Array.from(AVATAR_OPTIONS.character)),
    color,
    eyeColor: detailColor,
    patternColor: detailColor,
    pattern: pickRandom(Array.from(AVATAR_OPTIONS.pattern)),
    eyes: pickRandom(Array.from(AVATAR_OPTIONS.eyes)),
    ...Object.fromEntries(
      Object.entries(AVATAR_RANGES).map(([key, [min, max]]) => [
        key,
        key === 'motion' ? randomInteger(20, max) : randomInteger(min, max),
      ])
    ),
  };
}

function validateAvatarConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'Avatar configuration must be an object' };
  }

  const expectedKeys = Object.keys(DEFAULT_AVATAR_CONFIG);
  const keys = Object.keys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    return { valid: false, error: 'Avatar configuration contains unsupported fields' };
  }

  for (const colorKey of ['color', 'eyeColor', 'patternColor']) {
    if (typeof value[colorKey] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[colorKey])) {
      return { valid: false, error: `Avatar ${colorKey} must be a six-digit hex color` };
    }
  }

  for (const [key, allowedValues] of Object.entries(AVATAR_OPTIONS)) {
    if (!allowedValues.has(value[key])) {
      return { valid: false, error: `Unsupported avatar ${key}` };
    }
  }

  for (const [key, [min, max]] of Object.entries(AVATAR_RANGES)) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) {
      return { valid: false, error: `Avatar ${key} must be an integer from ${min} to ${max}` };
    }
  }

  return {
    valid: true,
    value: {
      ...Object.fromEntries(expectedKeys.map((key) => [key, value[key]])),
      color: value.color.toUpperCase(),
      eyeColor: value.eyeColor.toUpperCase(),
      patternColor: value.patternColor.toUpperCase(),
    },
  };
}

module.exports = {
  AVATAR_OPTIONS,
  AVATAR_RANGES,
  DEFAULT_AVATAR_CONFIG,
  RANDOM_COLORS,
  randomAvatarConfig,
  validateAvatarConfig,
};
