import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { addMacKeyListener, isIosAppOnMac } from '@/lib/mac';
import { requestSearchFocus } from '@/lib/searchFocus';
import { useShell } from '@/lib/useShell';

function applyKey(key: string) {
  if (key === 'escape') {
    if (router.canGoBack()) router.back();
    return;
  }
  if (key === 'find') {
    if (!requestSearchFocus()) router.push('/accounts');
  }
}

/** Échap revient en arrière, ⌘F ouvre la recherche des comptes. Inactif sur iPhone. */
export function MacKeyboard({ children }: { children: ReactNode }) {
  const { keyboard } = useShell();
  const mac = isIosAppOnMac();

  useEffect(() => {
    if (!keyboard) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onKey = (event: KeyboardEvent) => {
        const find = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f';
        if (find) {
          event.preventDefault();
          applyKey('find');
          return;
        }
        if (event.key !== 'Escape' || event.metaKey || event.ctrlKey || event.altKey) return;
        const node = event.target as HTMLElement | null;
        const typing = !!node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable);
        if (typing) {
          node.blur();
          return;
        }
        applyKey('escape');
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    if (!mac) return;
    return addMacKeyListener(applyKey);
  }, [keyboard, mac]);

  return <View style={{ flex: 1 }}>{children}</View>;
}
