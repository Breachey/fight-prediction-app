const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getUserSessionTtlHours,
  hashUserSessionToken,
  requireOwnUserParam,
} = require('../lib/userSessionAuth');

test('getUserSessionTtlHours defaults to 30 days', () => {
  const originalValue = process.env.USER_SESSION_TTL_HOURS;
  delete process.env.USER_SESSION_TTL_HOURS;

  try {
    assert.equal(getUserSessionTtlHours(), 24 * 30);
  } finally {
    if (originalValue !== undefined) process.env.USER_SESSION_TTL_HOURS = originalValue;
  }
});

test('getUserSessionTtlHours accepts a positive override', () => {
  const originalValue = process.env.USER_SESSION_TTL_HOURS;
  process.env.USER_SESSION_TTL_HOURS = '48';

  try {
    assert.equal(getUserSessionTtlHours(), 48);
  } finally {
    if (originalValue === undefined) delete process.env.USER_SESSION_TTL_HOURS;
    else process.env.USER_SESSION_TTL_HOURS = originalValue;
  }
});

test('session tokens are hashed before persistence', () => {
  const token = 'fps_user_example';
  assert.notEqual(hashUserSessionToken(token), token);
  assert.equal(hashUserSessionToken(token).length, 64);
});

test('requireOwnUserParam rejects a different user id', () => {
  let statusCode = null;
  let nextCalled = false;
  const middleware = requireOwnUserParam();

  middleware(
    { params: { user_id: '7' }, authenticatedUser: { user_id: 8 } },
    {
      status(code) { statusCode = code; return this; },
      json() { return this; },
    },
    () => { nextCalled = true; },
  );

  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
});

test('requireOwnUserParam accepts the authenticated user id', () => {
  let nextCalled = false;
  requireOwnUserParam()(
    { params: { user_id: '8' }, authenticatedUser: { user_id: 8 } },
    {},
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});
