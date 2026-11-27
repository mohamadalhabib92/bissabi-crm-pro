/** Retour haptique natif (expo-haptics). Sur Mac : rien. Jamais bloquant. */
import * as Haptics from 'expo-haptics';
import { isIosAppOnMac } from '@/lib/mac';
import { vibrationsEnabled } from './access';
export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error';
export function haptic(kind: HapticKind = 'tap') {
  if (!vibrationsEnabled() || isIosAppOnMac()) return;
  try {
    if (kind === 'select') void Haptics.selectionAsync().catch(() => {});
    else if (kind === 'tap') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else {
      const map = { success: Haptics.NotificationFeedbackType.Success, warning: Haptics.NotificationFeedbackType.Warning, error: Haptics.NotificationFeedbackType.Error } as const;
      void Haptics.notificationAsync(map[kind]).catch(() => {});
    }
  } catch {
    /* ignoré */
  }
}
