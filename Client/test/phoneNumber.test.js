import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPhoneNumber, normalizePhoneNumber } from '../src/utils/phoneNumber.js';

test('normalizes common phone number formats to ten digits', () => {
  for (const value of [
    '333-333-4444',
    '3333334444',
    '(333) 333-4444',
    '333.333.4444',
    '333 333 4444',
  ]) {
    assert.equal(normalizePhoneNumber(value), '3333334444');
    assert.equal(isValidPhoneNumber(value), true);
  }
});

test('rejects normalized phone numbers that do not contain exactly ten digits', () => {
  assert.equal(isValidPhoneNumber('333-333-444'), false);
  assert.equal(isValidPhoneNumber('1 (333) 333-4444'), false);
  assert.equal(isValidPhoneNumber(''), false);
});
