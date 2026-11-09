/** Whether to play an animation: not for people who prefer less motion, or in a hidden tab. */
export const canAnimate = () =>
  typeof window !== 'undefined' &&
  document.visibilityState === 'visible' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches
