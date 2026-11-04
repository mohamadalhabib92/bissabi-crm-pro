/**
 * Retour haptique — version web (et repli) : légère vibration là où le navigateur la permet
 * (Android Chrome). Silencieux ailleurs. La version native est dans haptics.native.ts.
 */
import { vibrationsEnabled } from './access';
export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error';
const PATTERN: Record<HapticKind, number | number[]> = { tap: 8, select: 6, success: [12, 40, 18], warning: [20, 60, 20], error: [30, 50, 30] };
export function haptic(kind: HapticKind = 'tap') {
  if (!vibrationsEnabled()) return;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(PATTERN[kind]);
  } catch {
    /* ignoré */
  }
}
