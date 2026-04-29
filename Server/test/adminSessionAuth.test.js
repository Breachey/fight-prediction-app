const assert = require('node:assert/strict');
const test = require('node:test');
const { getAdminSessionTtlHours } = require('../lib/adminSessionAuth');

test('getAdminSessionTtlHours reads positive ADMIN_SESSION_TTL_HOURS values', () => {
  const originalValue = process.env.ADMIN_SESSION_TTL_HOURS;
  process.env.ADMIN_SESSION_TTL_HOURS = '720';

  try {
    assert.equal(getAdminSessionTtlHours(), 720);
  } finally {
    if (originalValue === undefined) {
      delete process.env.ADMIN_SESSION_TTL_HOURS;
    } else {
      process.env.ADMIN_SESSION_TTL_HOURS = originalValue;
    }
  }
});

test('getAdminSessionTtlHours falls back for invalid ADMIN_SESSION_TTL_HOURS values', () => {
  const originalValue = process.env.ADMIN_SESSION_TTL_HOURS;
  process.env.ADMIN_SESSION_TTL_HOURS = '0';

  try {
    assert.equal(getAdminSessionTtlHours(), 24 * 365 * 10);
  } finally {
    if (originalValue === undefined) {
      delete process.env.ADMIN_SESSION_TTL_HOURS;
    } else {
      process.env.ADMIN_SESSION_TTL_HOURS = originalValue;
    }
  }
});
