import { useCallback, useEffect, useState } from 'react';

/** Keeps the menu mounted through the exit animation (genie back into the lamp). */
export function useGenieMenu(isOpen) {
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setExiting(false);
      setMounted(true);
    } else if (mounted) {
      setExiting(true);
    }
  }, [isOpen, mounted]);

  const onAnimationEnd = useCallback(() => {
    if (exiting) {
      setMounted(false);
      setExiting(false);
    }
  }, [exiting]);

  const menuClass = exiting
    ? 'model-picker-menu model-picker-menu--out'
    : 'model-picker-menu model-picker-menu--in';

  return { menuMounted: mounted, menuClass, onMenuAnimationEnd: onAnimationEnd };
}
