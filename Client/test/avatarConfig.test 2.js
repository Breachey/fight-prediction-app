import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AVATAR_CHARACTERS,
  AVATAR_EYES,
  AVATAR_PATTERNS,
  AVATAR_SLIDERS,
  DEFAULT_AVATAR_CONFIG,
  cursedAvatarConfig,
  isAvatarColor,
  normalizeAvatarConfig,
  randomAvatarConfig,
} from '../src/utils/avatarConfig.js';

test('normalizes legacy preset avatars into procedural values', () => {
  assert.deepEqual(
    normalizeAvatarConfig({ color: 'cotton-candy', shape: 'wide', pattern: 'spots', eyes: 'round' }),
    {
      ...DEFAULT_AVATAR_CONFIG,
      color: '#F99EAD',
      width: 126,
      height: 84,
      roundness: 72,
      pattern: 'spots',
      eyes: 'round',
    }
  );
});

test('accepts arbitrary six-digit colors and clamps slider values', () => {
  const normalized = normalizeAvatarConfig({
    ...DEFAULT_AVATAR_CONFIG,
    color: '#12ab34',
    eyeColor: '#abcdef',
    patternColor: '#fedcba',
    accentColor: '#13579b',
    width: 500,
    motion: -10,
  });

  assert.equal(normalized.color, '#12AB34');
  assert.equal(normalized.eyeColor, '#ABCDEF');
  assert.equal(normalized.patternColor, '#FEDCBA');
  assert.equal(normalized.accentColor, '#13579B');
  assert.equal(normalized.width, AVATAR_SLIDERS.width.max);
  assert.equal(normalized.motion, AVATAR_SLIDERS.motion.min);
  assert.equal(isAvatarColor('#12AB34'), true);
  assert.equal(isAvatarColor('#xyzxyz'), false);
});

test('random avatars stay within every configured slider range', () => {
  const characters = new Set(AVATAR_CHARACTERS.map((option) => option.id));
  const expressions = new Set(AVATAR_EYES.map((option) => option.id));
  const patterns = new Set(AVATAR_PATTERNS.map((option) => option.id));
  for (let index = 0; index < 40; index += 1) {
    const config = randomAvatarConfig();
    assert.equal(isAvatarColor(config.color), true);
    assert.equal(isAvatarColor(config.eyeColor), true);
    assert.equal(isAvatarColor(config.patternColor), true);
    assert.equal(isAvatarColor(config.accentColor), true);
    assert.notEqual(config.accentColor, config.patternColor);
    assert.equal(characters.has(config.character), true);
    assert.equal(expressions.has(config.eyes), true);
    assert.equal(patterns.has(config.pattern), true);
    Object.entries(AVATAR_SLIDERS).forEach(([key, slider]) => {
      assert.ok(config[key] >= slider.min && config[key] <= slider.max);
    });
  }
});

test('uses friendly display names without changing saved character ids', () => {
  assert.equal(AVATAR_CHARACTERS.find((option) => option.id === 'red-panda')?.label, 'Bear');
  assert.equal(AVATAR_CHARACTERS.find((option) => option.id === 'golden-retriever')?.label, 'Mouse-dog');
});

test('backfills detail colors for saved legacy avatars', () => {
  const lightAvatar = normalizeAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, color: '#FCFBFD', eyeColor: undefined, patternColor: undefined, accentColor: undefined });
  const darkAvatar = normalizeAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, color: '#050000', eyeColor: undefined, patternColor: undefined, accentColor: undefined });
  const patternedAvatar = normalizeAvatarConfig({ ...DEFAULT_AVATAR_CONFIG, patternColor: '#E9170D', accentColor: undefined });

  assert.equal(lightAvatar.eyeColor, '#050000');
  assert.equal(lightAvatar.patternColor, '#050000');
  assert.equal(lightAvatar.accentColor, '#050000');
  assert.equal(darkAvatar.eyeColor, '#FCFBFD');
  assert.equal(darkAvatar.patternColor, '#FCFBFD');
  assert.equal(darkAvatar.accentColor, '#FCFBFD');
  assert.equal(patternedAvatar.accentColor, '#E9170D');
});

test('preserves supported character types and expressions', () => {
  const normalized = normalizeAvatarConfig({
    ...DEFAULT_AVATAR_CONFIG,
    character: 'golden-retriever',
    pattern: 'many-eyes',
    eyes: 'possessed',
  });

  assert.equal(normalized.character, 'golden-retriever');
  assert.equal(normalized.pattern, 'many-eyes');
  assert.equal(normalized.eyes, 'possessed');
});

test('cursed randomizer always returns an intentionally strange valid avatar', () => {
  const cursed = cursedAvatarConfig();
  assert.ok(['ogre', 'golden-retriever', 'red-panda'].includes(cursed.character));
  assert.ok(['many-eyes', 'drips', 'checker'].includes(cursed.pattern));
  assert.ok(['possessed', 'spiral', 'dead'].includes(cursed.eyes));
  assert.deepEqual(normalizeAvatarConfig(cursed), cursed);
});
