export const USER_SESSION_STORAGE_KEY = 'fight-picker-user-session-token';
export const USER_SESSION_EXPIRY_STORAGE_KEY = 'fight-picker-user-session-expiry';

const canUseLocalStorage = () => {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

export const clearUserSession = () => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(USER_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(USER_SESSION_EXPIRY_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

export const storeUserSession = (token, expiresAt) => {
  if (!canUseLocalStorage()) return;
  try {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    if (!normalizedToken) {
      clearUserSession();
      return;
    }
    window.localStorage.setItem(USER_SESSION_STORAGE_KEY, normalizedToken);
    if (typeof expiresAt === 'string' && expiresAt.trim()) {
      window.localStorage.setItem(USER_SESSION_EXPIRY_STORAGE_KEY, expiresAt.trim());
    } else {
      window.localStorage.removeItem(USER_SESSION_EXPIRY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors.
  }
};

export const getUserSessionToken = () => {
  if (!canUseLocalStorage()) return '';
  try {
    return window.localStorage.getItem(USER_SESSION_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const fetchWithUserSession = async (url, options = {}) => {
  const token = getUserSessionToken().trim();
  if (!token) {
    throw new Error('Your session has ended. Please log in again.');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    clearUserSession();
  }
  return response;
};
