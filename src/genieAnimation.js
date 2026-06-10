import { isReducedMotionActive } from './displayPreferences';

export const GENIE_IN_KEYFRAMES = [
  { opacity: 0, transform: 'scale(0.12, 0.06) translateY(10px)', filter: 'blur(5px)' },
  { opacity: 1, transform: 'scale(1.07, 1.05) translateY(-5px)', filter: 'blur(0px)', offset: 0.5 },
  { opacity: 1, transform: 'scale(0.96, 0.98) translateY(2px)', filter: 'blur(0px)', offset: 0.72 },
  { opacity: 1, transform: 'scale(1) translateY(0)', filter: 'blur(0px)' },
];

export const GENIE_OUT_KEYFRAMES = [
  { opacity: 1, transform: 'scale(1) translateY(0)', filter: 'blur(0px)' },
  { opacity: 0.9, transform: 'scale(1.03, 0.97) translateY(-3px)', filter: 'blur(0px)', offset: 0.28 },
  { opacity: 0, transform: 'scale(0.1, 0.05) translateY(12px)', filter: 'blur(6px)' },
];

export const GENIE_IN_OPTS = {
  duration: 440,
  easing: 'cubic-bezier(0.22, 1.28, 0.36, 1)',
  fill: 'forwards',
};

export const GENIE_OUT_OPTS = {
  duration: 300,
  easing: 'cubic-bezier(0.55, 0, 0.85, 0.15)',
  fill: 'forwards',
};

export function prefersReducedMotion() {
  return isReducedMotionActive();
}
