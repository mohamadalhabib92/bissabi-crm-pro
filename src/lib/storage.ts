import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Stockage local (AsyncStorage sur mobile, localStorage sur le web).
 * Toutes les données « cœur » vivent ici : l'app fonctionne hors-ligne,
 * sans backend ni API payante.
 */
// Préfixe propre à l'app : plusieurs PWA partagent la même origine sur GitHub Pages.
const PREFIX = '@bissabi-crm-pro/';

export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function saveJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // stockage plein / indisponible : on ne crashe jamais l'UI
  }
}

export async function clearAll(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX)));
}

export async function exportAll(): Promise<Record<string, unknown>> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  const pairs = await AsyncStorage.multiGet(keys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of pairs) {
    try {
      out[k.slice(PREFIX.length)] = v ? JSON.parse(v) : null;
    } catch {
      out[k.slice(PREFIX.length)] = v;
    }
  }
  return out;
}

/** État React persistant (écriture immédiate à chaque changement). */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const initialRef = useRef(initial);

  useEffect(() => {
    let alive = true;
    const fb = typeof initialRef.current === 'function' ? (initialRef.current as () => T)() : initialRef.current;
    loadJSON<T>(key, fb).then((v) => {
      if (alive) {
        setValue(v);
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        void saveJSON(key, v);
        return v;
      });
    },
    [key],
  );

  return [value, set, ready] as const;
}

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
