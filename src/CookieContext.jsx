import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  hasAnalyticsCookies,
  hasFunctionalCookies,
  persistConsent,
  readConsentStatus,
} from './cookies';

const CookieContext = createContext(null);

export function CookieProvider({ children }) {
  const [status, setStatus] = useState(() => readConsentStatus() ?? 'pending');

  const acceptAll = useCallback(() => {
    persistConsent('accepted', { functional: true, analytics: false });
    setStatus('accepted');
  }, []);

  const acceptEssentialOnly = useCallback(() => {
    persistConsent('essential', { functional: false, analytics: false });
    setStatus('essential');
  }, []);

  const value = useMemo(
    () => ({
      status,
      pending: status === 'pending',
      accepted: status === 'accepted',
      functional: status === 'accepted' && hasFunctionalCookies(),
      analytics: status === 'accepted' && hasAnalyticsCookies(),
      acceptAll,
      acceptEssentialOnly,
    }),
    [status, acceptAll, acceptEssentialOnly],
  );

  return <CookieContext.Provider value={value}>{children}</CookieContext.Provider>;
}

export function useCookies() {
  const ctx = useContext(CookieContext);
  if (!ctx) throw new Error('useCookies must be used within CookieProvider');
  return ctx;
}
