import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  GENIE_IN_KEYFRAMES,
  GENIE_IN_OPTS,
  GENIE_OUT_KEYFRAMES,
  GENIE_OUT_OPTS,
  prefersReducedMotion,
} from './genieAnimation';
import { useDisplayPreferences } from './DisplayPreferencesContext';

/** Duration of the genie-out animation (ms) + small buffer. */
const GENIE_EXIT_MS = 340;

/** Keeps the menu mounted through the exit animation (genie back into the lamp). */
export function useGenieMenu(isOpen, panelClass = 'model-picker-menu') {
  const { reducedMotionActive } = useDisplayPreferences();
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [openGen, setOpenGen] = useState(0);
  const [animTick, setAnimTick] = useState(0);
  const panelElRef = useRef(null);
  const exitingRef = useRef(false);
  const animRef = useRef(null);

  const panelRef = useCallback((node) => {
    if (panelElRef.current === node) return;
    panelElRef.current = node;
    if (node) setAnimTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (isOpen) {
      exitingRef.current = false;
      setExiting(false);
      setMounted(true);
      setOpenGen((g) => g + 1);
    } else if (mounted) {
      exitingRef.current = true;
      setExiting(true);
    }
  }, [isOpen, mounted]);

  const finishExit = useCallback(() => {
    if (!exitingRef.current) return;
    exitingRef.current = false;
    setExiting(false);
    setMounted(false);
    panelElRef.current = null;
  }, []);

  useEffect(() => {
    if (!exiting) return undefined;
    const t = window.setTimeout(finishExit, GENIE_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [exiting, finishExit]);

  useLayoutEffect(() => {
    const panelEl = panelElRef.current;
    if (!panelEl || !mounted) return undefined;

    animRef.current?.cancel();

    if (prefersReducedMotion()) {
      if (exiting) finishExit();
      return undefined;
    }

    if (exiting) {
      const anim = panelEl.animate(GENIE_OUT_KEYFRAMES, GENIE_OUT_OPTS);
      animRef.current = anim;
      anim.onfinish = () => finishExit();
      return () => anim.cancel();
    }

    const anim = panelEl.animate(GENIE_IN_KEYFRAMES, GENIE_IN_OPTS);
    animRef.current = anim;
    return () => anim.cancel();
  }, [mounted, exiting, openGen, animTick, finishExit, reducedMotionActive]);

  const menuClass = exiting ? `${panelClass} ${panelClass}--exiting` : panelClass;

  return { menuMounted: mounted, menuClass, panelRef, exiting };
}
