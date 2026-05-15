import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { CATALOG, CATALOG_IDS } from './i18n/catalog';
import {
  readLangBundle,
  translateEntries,
  writeLangBundle,
} from './i18n/translateApi';
import {
  LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  languageByCode,
  readStoredLanguage,
} from './languages';

const LanguageContext = createContext(null);

function applyDocumentLang(code) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
}

function bundleComplete(bundle) {
  if (!bundle) return false;
  return CATALOG_IDS.every((id) => typeof bundle[id] === 'string' && bundle[id].length > 0);
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => readStoredLanguage());
  const [dict, setDict] = useState(/** @type {Record<string, string>} */ ({}));
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');

  const current = useMemo(() => languageByCode(language), [language]);

  useLayoutEffect(() => {
    applyDocumentLang(language);
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    if (language === 'en') {
      setDict({});
      setTranslateError('');
      setTranslating(false);
      return undefined;
    }

    const cached = readLangBundle(language);
    if (bundleComplete(cached)) {
      setDict(cached);
      setTranslateError('');
      setTranslating(false);
      return undefined;
    }

    (async () => {
      setTranslating(true);
      setTranslateError('');
      const partial = cached && typeof cached === 'object' ? { ...cached } : {};
      const missing = CATALOG_IDS.filter((id) => !partial[id]).map((id) => ({
        id,
        text: CATALOG[id],
      }));

      try {
        if (missing.length > 0) {
          const fetched = await translateEntries(missing, language);
          Object.assign(partial, fetched);
        }
        if (!cancelled) {
          writeLangBundle(language, partial);
          setDict(partial);
        }
      } catch (e) {
        if (!cancelled) {
          setTranslateError(e?.message || 'Translation unavailable');
          setDict(partial);
        }
      } finally {
        if (!cancelled) setTranslating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [language]);

  const setLanguage = useCallback((code) => {
    if (!LANGUAGES.some((l) => l.code === code)) return;
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    setLanguageState(code);
    applyDocumentLang(code);
  }, []);

  const t = useCallback(
    (id, vars) => {
      let text = language === 'en' ? CATALOG[id] : dict[id] ?? CATALOG[id];
      if (text == null) text = id;
      if (vars && typeof vars === 'object') {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    [language, dict],
  );

  const value = useMemo(
    () => ({
      language,
      current,
      languages: LANGUAGES,
      setLanguage,
      t,
      translating,
      translateError,
    }),
    [language, current, setLanguage, t, translating, translateError],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
