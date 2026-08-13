import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkspaceSearch, resolveWorkspaceState } from '../src/utils/workspaceState.js';

test('workspace URL wins over stored event and preserves a valid view', () => {
  assert.deepEqual(resolveWorkspaceState('?event=1324&view=props', '1300'), {
    eventId: '1324',
    view: 'props',
    hasValidView: true,
  });
});

test('workspace state falls back to the stored event and picks view', () => {
  assert.deepEqual(resolveWorkspaceState('', '1300'), {
    eventId: '1300',
    view: 'picks',
    hasValidView: false,
  });
});

test('workspace search normalizes invalid views', () => {
  assert.equal(buildWorkspaceSearch(1324, 'unknown'), '?event=1324&view=picks');
});
