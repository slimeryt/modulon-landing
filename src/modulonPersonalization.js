export const PERSONALIZATION_STORAGE_KEY = 'modulon-personalization';
export const PERSONALIZATION_MAX_CHARS = 500;

function clipPersonalization(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n/g, '\n').slice(0, PERSONALIZATION_MAX_CHARS);
}

/** Trimmed value sent to the API (empty if whitespace-only). */
export function readPersonalization() {
  try {
    const raw = localStorage.getItem(PERSONALIZATION_STORAGE_KEY);
    return clipPersonalization(raw || '').trim();
  } catch {
    return '';
  }
}

/** Raw stored text for the settings textarea (preserves spaces while typing). */
export function readPersonalizationStored() {
  try {
    const raw = localStorage.getItem(PERSONALIZATION_STORAGE_KEY);
    return clipPersonalization(raw || '');
  } catch {
    return '';
  }
}

export function writePersonalization(text) {
  const value = clipPersonalization(text);
  try {
    if (!value.trim()) localStorage.removeItem(PERSONALIZATION_STORAGE_KEY);
    else localStorage.setItem(PERSONALIZATION_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  return value;
}

/** Rough extra input tokens added to each Modulon request when personalization is set. */
export function estimatePersonalizationInputTokens(text) {
  const value = clipPersonalization(text).trim();
  if (!value) return 0;
  return Math.ceil(value.length / 4) + 24;
}
