export const MOTION_STORAGE_KEY = 'modulon-reduced-motion';
export const DENSITY_STORAGE_KEY = 'modulon-chat-density';

/** @typedef {'system' | 'reduce' | 'full'} ReducedMotionPref */
/** @typedef {'comfortable' | 'compact'} ChatDensity */

export function readReducedMotionPref() {
  try {
    const v = localStorage.getItem(MOTION_STORAGE_KEY);
    if (v === 'system' || v === 'reduce' || v === 'full') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function readChatDensity() {
  try {
    const v = localStorage.getItem(DENSITY_STORAGE_KEY);
    if (v === 'comfortable' || v === 'compact') return v;
  } catch {
    /* ignore */
  }
  return 'comfortable';
}

/** @param {ReducedMotionPref} [pref] */
export function isReducedMotionActive(pref = readReducedMotionPref()) {
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function applyDisplayPreferences({ reducedMotion, chatDensity, reducedMotionActive }) {
  if (typeof document === 'undefined') return;
  const h = document.documentElement;
  h.setAttribute('data-reduced-motion', reducedMotionActive ? 'true' : 'false');
  h.setAttribute('data-chat-density', chatDensity);
}
