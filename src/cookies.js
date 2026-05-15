/** Cookie names used by Modulon. */
export const COOKIE_CONSENT = 'modulon_cookie_consent';
export const COOKIE_FUNCTIONAL = 'modulon_cookie_functional';
export const COOKIE_ANALYTICS = 'modulon_cookie_analytics';
export const COOKIE_VISITOR = 'modulon_visitor_id';

export const CONSENT_STORAGE_KEY = 'modulon-cookie-consent';

/** @typedef {'pending' | 'accepted' | 'essential'} ConsentStatus */

/**
 * @param {string} name
 * @param {string} value
 * @param {number} [days]
 */
export function setCookie(name, value, days = 365) {
  if (typeof document === 'undefined') return;
  const maxAge = Math.floor(days * 24 * 60 * 60);
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

/**
 * @param {string} name
 * @returns {string | null}
 */
export function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split('; ');
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

export function deleteCookie(name) {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; SameSite=Lax`;
}

function randomVisitorId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @returns {ConsentStatus | null}
 */
export function readConsentStatus() {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === 'accepted' || stored === 'essential') return stored;
  } catch {
    /* ignore */
  }
  const fromCookie = getCookie(COOKIE_CONSENT);
  if (fromCookie === 'accepted' || fromCookie === 'essential') return fromCookie;
  return null;
}

/**
 * @param {ConsentStatus} status
 * @param {{ functional?: boolean; analytics?: boolean }} [opts]
 */
export function persistConsent(status, opts = {}) {
  const functional = status === 'accepted' ? opts.functional !== false : false;
  const analytics = status === 'accepted' && opts.analytics === true;

  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, status);
  } catch {
    /* ignore */
  }

  setCookie(COOKIE_CONSENT, status, 365);
  setCookie(COOKIE_FUNCTIONAL, functional ? '1' : '0', 365);
  setCookie(COOKIE_ANALYTICS, analytics ? '1' : '0', 365);

  if (functional) {
    if (!getCookie(COOKIE_VISITOR)) {
      setCookie(COOKIE_VISITOR, randomVisitorId(), 365);
    }
  } else {
    deleteCookie(COOKIE_VISITOR);
  }

  if (!analytics) {
    deleteCookie('modulon_analytics_session');
  }
}

export function hasFunctionalCookies() {
  return getCookie(COOKIE_FUNCTIONAL) === '1';
}

export function hasAnalyticsCookies() {
  return getCookie(COOKIE_ANALYTICS) === '1';
}
