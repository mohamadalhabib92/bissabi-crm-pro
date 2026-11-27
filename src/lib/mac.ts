import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';

type MacNative = {
  isiOSAppOnMac?: boolean;
  addListener?: (event: 'onKey', listener: (event: { key: string }) => void) => EventSubscription;
};

let cached: boolean | null = null;
let native: MacNative | null | undefined;

function load(): MacNative | null {
  if (native !== undefined) return native;
  if (Platform.OS !== 'ios' || Platform.isTV) {
    native = null;
    return null;
  }
  try {
    native = requireNativeModule<MacNative>('CrmMac');
  } catch {
    native = null;
  }
  return native;
}

/**
 * Vrai seulement quand le binaire iOS tourne sur un Mac Apple Silicon
 * (ProcessInfo.isiOSAppOnMac). Sur iPhone, iPad et le web : faux.
 */
export function isIosAppOnMac(): boolean {
  if (cached != null) return cached;
  if (Platform.OS !== 'ios' || Platform.isTV) {
    cached = false;
    return false;
  }
  try {
    cached = load()?.isiOSAppOnMac === true;
  } catch {
    cached = false;
  }
  return cached;
}

/** Raccourcis installés seulement sur Mac. Sans le module natif, aucun écouteur. */
export function addMacKeyListener(listener: (key: string) => void): () => void {
  const mod = load();
  if (!mod?.addListener || mod.isiOSAppOnMac !== true) return () => undefined;
  const sub = mod.addListener('onKey', (event) => listener(event.key));
  return () => sub.remove();
}
