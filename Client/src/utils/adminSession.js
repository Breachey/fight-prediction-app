export const ADMIN_SESSION_STORAGE_KEY = 'fight-picker-admin-session-token';
export const ADMIN_SESSION_EXPIRY_STORAGE_KEY = 'fight-picker-admin-session-expiry';

const canUseLocalStorage = () => {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch (error) {
    return false;
  }
};

export const clearAdminSession = () => {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(ADMIN_SESSION_EXPIRY_STORAGE_KEY);
  } catch (error) {
    // Ignore storage errors.
  }
};

export const storeAdminSession = (token, expiresAt) => {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    if (!normalizedToken) {
      clearAdminSession();
      return;
    }

    window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, normalizedToken);

    if (typeof expiresAt === 'string' && expiresAt.trim()) {
      window.localStorage.setItem(ADMIN_SESSION_EXPIRY_STORAGE_KEY, expiresAt.trim());
    } else {
      window.localStorage.removeItem(ADMIN_SESSION_EXPIRY_STORAGE_KEY);
    }
  } catch (error) {
    // Ignore storage errors.
  }
};

export const getAdminSessionToken = () => {
  if (!canUseLocalStorage()) {
    return '';
  }

  try {
    return window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY) || '';
  } catch (error) {
    return '';
  }
};

export const getAdminSessionExpiry = () => {
  if (!canUseLocalStorage()) {
    return '';
  }

  try {
    return window.localStorage.getItem(ADMIN_SESSION_EXPIRY_STORAGE_KEY) || '';
  } catch (error) {
    return '';
  }
};

export const hasActiveAdminSession = () => {
  return Boolean(getAdminSessionToken().trim());
};

export const fetchWithAdminSession = async (url, options = {}) => {
  const adminSessionToken = getAdminSessionToken().trim();
  if (!adminSessionToken) {
    throw new Error('Admin access is unavailable. Please log out and log back in as an admin.');
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${adminSessionToken}`,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    clearAdminSession();
  }

  return response;
};
