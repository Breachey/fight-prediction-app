import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getInitialFightTargetId,
  getNextUnvotedFightId,
} from '../src/utils/fightNavigation.js';

const fights = [
  { id: 'main', is_completed: false },
  { id: 'co-main', is_completed: false },
  { id: 'prelim-2', is_completed: false },
  { id: 'prelim-1', is_completed: false },
];

test('finds the next missing pick in bottom-to-top fight order', () => {
  assert.equal(
    getNextUnvotedFightId(fights, { 'prelim-1': 'fighter-a' }),
    'prelim-2'
  );
});

test('starts at the top when no fight is complete and every pick is submitted', () => {
  assert.equal(
    getInitialFightTargetId(fights, {
      main: 'fighter-a',
      'co-main': 'fighter-b',
      'prelim-2': 'fighter-a',
      'prelim-1': 'fighter-b',
    }),
    null
  );
});

test('resumes at the next chronological fight after results begin', () => {
  const liveFights = fights.map((fight) => (
    fight.id === 'prelim-1' ? { ...fight, is_completed: true } : fight
  ));
  const submitted = {
    main: 'fighter-a',
    'co-main': 'fighter-b',
    'prelim-2': 'fighter-a',
    'prelim-1': 'fighter-b',
  };

  assert.equal(getInitialFightTargetId(liveFights, submitted), 'prelim-2');
});

test('ignores cancelled fights when choosing the next target', () => {
  const card = [
    { id: 'main', is_completed: false },
    { id: 'cancelled', is_completed: false, is_canceled: true },
  ];

  assert.equal(getNextUnvotedFightId(card, {}), 'main');
});
