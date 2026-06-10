export const THINK_MODE_STORAGE_KEY = 'modulon-think-mode';

export function readThinkMode() {
  try {
    return localStorage.getItem(THINK_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeThinkMode(enabled) {
  try {
    if (enabled) localStorage.setItem(THINK_MODE_STORAGE_KEY, '1');
    else localStorage.removeItem(THINK_MODE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
