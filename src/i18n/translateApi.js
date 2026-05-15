/** Free MyMemory translation API (browser CORS OK). ~1000 words/day without API key. */

const CACHE_PREFIX = 'modulon-tr-v1-';
const BUNDLE_PREFIX = 'modulon-translations-v1-';
const SOURCE_LANG = 'en';
const MAX_Q_LEN = 450;

/** @param {string} code */
export function mapLangForApi(code) {
  if (code === 'zh') return 'zh-CN';
  if (code === 'pt') return 'pt-PT';
  return code;
}

function cacheKey(from, to, text) {
  return `${CACHE_PREFIX}${from}|${to}|${text}`;
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} text
 * @returns {string | null}
 */
function readLineCache(from, to, text) {
  try {
    return localStorage.getItem(cacheKey(from, to, text));
  } catch {
    return null;
  }
}

/**
 * @param {string} from
 * @param {string} to
 * @param {string} text
 * @param {string} translated
 */
function writeLineCache(from, to, text, translated) {
  try {
    localStorage.setItem(cacheKey(from, to, text), translated);
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {string} lang
 * @returns {Record<string, string> | null}
 */
export function readLangBundle(lang) {
  try {
    const raw = localStorage.getItem(`${BUNDLE_PREFIX}${lang}`);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} lang
 * @param {Record<string, string>} bundle
 */
export function writeLangBundle(lang, bundle) {
  try {
    localStorage.setItem(`${BUNDLE_PREFIX}${lang}`, JSON.stringify(bundle));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} text
 * @param {string} targetLang
 * @param {string} [sourceLang]
 * @returns {Promise<string>}
 */
export async function translateText(text, targetLang, sourceLang = SOURCE_LANG) {
  const trimmed = text?.trim();
  if (!trimmed || targetLang === sourceLang) return text;

  const from = mapLangForApi(sourceLang);
  const to = mapLangForApi(targetLang);

  const cached = readLineCache(from, to, trimmed);
  if (cached) return cached;

  const q = trimmed.length > MAX_Q_LEN ? `${trimmed.slice(0, MAX_Q_LEN)}…` : trimmed;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${from}|${to}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation HTTP ${res.status}`);

  const data = await res.json();
  if (data.quotaFinished || data.responseStatus === 429) {
    throw new Error('Translation daily limit reached. Try again tomorrow or use English.');
  }

  let translated = data.responseData?.translatedText?.trim() || trimmed;
  if (translated === q && trimmed !== q) translated = trimmed;

  writeLineCache(from, to, trimmed, translated);
  return translated;
}

/**
 * @param {{ id: string; text: string }[]} entries
 * @param {string} targetLang
 * @param {{ concurrency?: number }} [opts]
 * @returns {Promise<Record<string, string>>}
 */
export async function translateEntries(entries, targetLang, opts = {}) {
  const { concurrency = 3 } = opts;
  const out = /** @type {Record<string, string>} */ ({});
  const queue = [...entries];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      out[item.id] = await translateText(item.text, targetLang);
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
