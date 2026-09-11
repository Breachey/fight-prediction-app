// External calendar subscriptions have no callback; this is a user-confirmed preference.
export const calendarSubscriptionKey = (userId, feedUrl) =>
  `fight-picker:calendar-subscribed:${encodeURIComponent(userId ?? 'guest')}:${encodeURIComponent(feedUrl)}`;

export function readCalendarSubscription(key) {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

export function saveCalendarSubscription(key, subscribed) {
  try {
    localStorage.setItem(key, String(subscribed));
    return true;
  } catch {
    return false;
  }
}
