/** Retour haptique natif (expo-haptics). Jamais bloquant : toute erreur est ignorée. */
import * as Haptics from 'expo-haptics';
export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error';
export function haptic(kind: HapticKind = 'tap') {
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
