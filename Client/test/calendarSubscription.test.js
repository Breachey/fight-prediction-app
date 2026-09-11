import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarSubscriptionKey, readCalendarSubscription, saveCalendarSubscription } from '../src/utils/calendarSubscription.js';

test('subscription confirmations persist per account and feed and can be cleared', () => {
  const values = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key), setItem: (key, value) => values.set(key, value),
  } });
  try {
    const key = calendarSubscriptionKey(1, 'https://example.com/calendar/ufc.ics');
    assert.equal(readCalendarSubscription(key), false);
    assert.equal(saveCalendarSubscription(key, true), true);
    assert.equal(readCalendarSubscription(key), true);
    assert.equal(readCalendarSubscription(calendarSubscriptionKey(2, 'https://example.com/calendar/ufc.ics')), false);
    assert.equal(readCalendarSubscription(calendarSubscriptionKey(1, 'https://other.example/calendar/ufc.ics')), false);
    saveCalendarSubscription(key, false);
    assert.equal(readCalendarSubscription(key), false);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
    assert.equal(readCalendarSubscription(key), false);
    assert.equal(saveCalendarSubscription(key, true), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
