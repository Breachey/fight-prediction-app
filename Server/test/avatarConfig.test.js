const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AVATAR_RANGES,
  DEFAULT_AVATAR_CONFIG,
  randomAvatarConfig,
  validateAvatarConfig,
} = require('../lib/avatarConfig');

test('accepts a complete procedural avatar configuration', () => {
  const result = validateAvatarConfig({
    ...DEFAULT_AVATAR_CONFIG,
    character: 'ogre',
    color: '#f99ead',
    eyeColor: '#abcdef',
    patternColor: '#123456',
    width: 126,
    height: 84,
    roundness: 36,
    tentacleSpread: 112,
    tentacleLength: 118,
    eyeSpacing: 88,
    size: 114,
    motion: 72,
    pattern: 'waves',
    eyes: 'spiral',
  });

  assert.equal(result.valid, true);
  assert.equal(result.value.color, '#F99EAD');
  assert.equal(result.value.eyeColor, '#ABCDEF');
  assert.equal(result.value.patternColor, '#123456');
  assert.equal(result.value.width, 126);
  assert.equal(result.value.character, 'ogre');
});

test('rejects invalid colors, ranges, and extra fields', () => {
  assert.equal(validateAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, color: 'pink' }).valid, false);
  assert.equal(validateAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, eyeColor: 'black' }).valid, false);
  assert.equal(validateAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, patternColor: '#123' }).valid, false);
  assert.equal(validateAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, width: 131 }).valid, false);
  assert.equal(validateAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, motion: 12.5 }).valid, false);
  assert.equal(validateAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, accessory: 'hat' }).valid, false);
  assert.equal(validateAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, character: 'robot' }).valid, false);
  assert.equal(validateAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, eyes: 'smiling-mouth' }).valid, false);
});

test('rejects partial and non-object configurations', () => {
  assert.equal(validateAvatarConfig({ color: '#2B31B2' }).valid, false);
  assert.equal(validateAvatarConfig(null).valid, false);
  assert.equal(validateAvatarConfig([]).valid, false);
});

test('random avatar configs always pass validation and vary procedural fields', () => {
  const configs = Array.from({ length: 40 }, () => randomAvatarConfig());
  configs.forEach((config) => assert.equal(validateAvatarConfig(config).valid, true));

  Object.entries(AVATAR_RANGES).forEach(([key, [min, max]]) => {
    configs.forEach((config) => assert.ok(config[key] >= min && config[key] <= max));
  });
  assert.ok(new Set(configs.map((config) => JSON.stringify(config))).size > 1);
});
