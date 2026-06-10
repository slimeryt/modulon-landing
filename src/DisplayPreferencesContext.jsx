import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  MOTION_STORAGE_KEY,
  DENSITY_STORAGE_KEY,
  applyDisplayPreferences,
  isReducedMotionActive,
  readChatDensity,
  readReducedMotionPref,
} from './displayPreferences';

const DisplayPreferencesContext = createContext(null);

export function DisplayPreferencesProvider({ children }) {
  const [reducedMotion, setReducedMotionState] = useState(() => readReducedMotionPref());
  const [chatDensity, setChatDensityState] = useState(() => readChatDensity());
  const [systemMotionTick, setSystemMotionTick] = useState(0);

  const reducedMotionActive = useMemo(
    () => isReducedMotionActive(reducedMotion),
    [reducedMotion, systemMotionTick],
  );

  useLayoutEffect(() => {
    applyDisplayPreferences({ reducedMotion, chatDensity, reducedMotionActive });
  }, [reducedMotion, chatDensity, reducedMotionActive]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MOTION_STORAGE_KEY) setReducedMotionState(readReducedMotionPref());
      if (e.key === DENSITY_STORAGE_KEY) setChatDensityState(readChatDensity());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (reducedMotion !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystemMotionTick((n) => n + 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [reducedMotion]);

  const setReducedMotion = useCallback((next) => {
    if (next !== 'system' && next !== 'reduce' && next !== 'full') return;
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setReducedMotionState(next);
    const active = isReducedMotionActive(next);
    applyDisplayPreferences({ reducedMotion: next, chatDensity: readChatDensity(), reducedMotionActive: active });
  }, []);

  const setChatDensity = useCallback((next) => {
    if (next !== 'comfortable' && next !== 'compact') return;
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setChatDensityState(next);
    applyDisplayPreferences({
      reducedMotion: readReducedMotionPref(),
      chatDensity: next,
      reducedMotionActive: isReducedMotionActive(),
    });
  }, []);

  const value = useMemo(
    () => ({
      reducedMotion,
      reducedMotionActive,
      chatDensity,
      setReducedMotion,
      setChatDensity,
    }),
    [reducedMotion, reducedMotionActive, chatDensity, setReducedMotion, setChatDensity],
  );

  return (
    <DisplayPreferencesContext.Provider value={value}>{children}</DisplayPreferencesContext.Provider>
  );
}

export function useDisplayPreferences() {
  const ctx = useContext(DisplayPreferencesContext);
  if (!ctx) throw new Error('useDisplayPreferences must be used within DisplayPreferencesProvider');
  return ctx;
}
