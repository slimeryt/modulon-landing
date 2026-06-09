export const LANGUAGE_STORAGE_KEY = 'modulon-language';

/** @typedef {{ code: string; label: string; native: string; short: string }} LanguageOption */

/** @type {LanguageOption[]} */
export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', short: 'EN' },
  { code: 'de', label: 'German', native: 'Deutsch', short: 'DE' },
  { code: 'es', label: 'Spanish', native: 'Español', short: 'ES' },
  { code: 'fr', label: 'French', native: 'Français', short: 'FR' },
  { code: 'pt', label: 'Portuguese', native: 'Português', short: 'PT' },
  { code: 'zh', label: 'Chinese', native: '中文', short: 'ZH' },
  { code: 'ja', label: 'Japanese', native: '日本語', short: 'JA' },
];

/**
 * @param {string | null | undefined} code
 * @returns {LanguageOption}
 */
export function languageByCode(code) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** System instruction so third-party models match the user's language. */
export function providerReplyPrompt(langCode) {
  const { label } = languageByCode(langCode);
  return (
    `You are a helpful assistant. Always reply in the same language as the user's latest message. ` +
    `If the language is unclear, use ${label}. Do not default to Chinese unless the user is writing in Chinese.`
  );
}

/**
 * @returns {string}
 */
export function detectBrowserLanguage() {
  if (typeof navigator === 'undefined') return 'en';
  const raw = navigator.language || 'en';
  const base = raw.split('-')[0].toLowerCase();
  return LANGUAGES.some((l) => l.code === base) ? base : 'en';
}

/**
 * @returns {string}
 */
export function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  } catch {
    /* ignore */
  }
  return detectBrowserLanguage();
}
