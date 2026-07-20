import type { Settings } from '../config/physics';

export function isTouchDevice(): boolean {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return hasTouch && (coarse || Math.min(screen.width, screen.height) < 900);
}

export function resolveControlScheme(s: Settings): 'desktop' | 'touch' {
  if (s.controls === 'desktop') return 'desktop';
  if (s.controls === 'touch') return 'touch';
  return isTouchDevice() ? 'touch' : 'desktop';
}
