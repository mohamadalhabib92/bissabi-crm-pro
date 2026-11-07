import { STORE_KEYS, type Kv, type Store, type StoreKey } from './migrate';

/**
 * Aucune clé métier n’est écrite tant que le stockage local n’a pas été lu avec succès.
 * Le repli « Réessayer » / « Continuer hors ligne » ne lève pas cette barrière :
 * un état vide (premier rendu, timeout) ne peut pas écraser les données déjà présentes.
 */
let hydrated = false;
let preserveOnly = false;

const BUSINESS = new Set<string>(STORE_KEYS);

export function storageHydrated(): boolean {
  return hydrated;
}

/** Uniquement après une lecture réussie. Jamais depuis un timeout ou un bouton de repli. */
export function markStorageHydrated(): void {
  hydrated = true;
}

/** Schéma plus récent que celui de cette application : lecture seule, aucune clé métier. */
export function markPreserveOnly(on: boolean): void {
  preserveOnly = on;
}

export function isPreserveOnly(): boolean {
  return preserveOnly;
}

export function resetHydrationForTests(): void {
  hydrated = false;
  preserveOnly = false;
}

/**
 * Action du repli de chargement (Réessayer, ou « Continuer hors ligne »).
 * Relance la lecture. N’hydrate pas et n’écrit rien.
 */
export function continueOffline(): void {
  // volontairement vide : ne pas passer hydrated à true
}

export function canPersistBusinessKey(key: string): boolean {
  if (preserveOnly && BUSINESS.has(key)) return false;
  return !BUSINESS.has(key) || hydrated;
}

/** `keyLoaded` est faux au premier rendu, avant la lecture de cette clé. */
export function shouldPersist(keyLoaded: boolean, key: string): boolean {
  return keyLoaded && canPersistBusinessKey(key);
}

/** Point de passage unique des écritures métier. Retourne false sans toucher au stockage si la lecture n’a pas abouti. */
export async function commitIfHydrated(kv: Kv, entries: { key: string; value: string }[]): Promise<boolean> {
  if (!hydrated || preserveOnly) return false;
  for (const entry of entries) {
    if (!BUSINESS.has(entry.key)) continue;
    await kv.set(entry.key, entry.value);
  }
  return true;
}

export function isBusinessKey(key: string): key is StoreKey {
  return BUSINESS.has(key);
}

export type DiskWrite = { key: StoreKey; value: string };

/**
 * Clés à écrire : celles qui diffèrent de la dernière valeur confirmée, plus celles dont l’écriture a échoué.
 * `confirmed` n’est mis à jour qu’après succès, jamais avant.
 */
export function planDiskWrites(
  confirmed: Partial<Record<StoreKey, string>>,
  pending: ReadonlySet<StoreKey>,
  next: Store,
): DiskWrite[] {
  const plan: DiskWrite[] = [];
  for (const key of STORE_KEYS) {
    const value = JSON.stringify(next[key]);
    if (pending.has(key) || confirmed[key] !== value) plan.push({ key, value });
  }
  return plan;
}

/** Succès : la clé est confirmée. Échec : elle reste en attente, la valeur confirmée ne change pas. */
export function recordWriteOutcome(
  confirmed: Partial<Record<StoreKey, string>>,
  pending: Set<StoreKey>,
  entry: DiskWrite,
  ok: boolean,
): void {
  if (ok) {
    confirmed[entry.key] = entry.value;
    pending.delete(entry.key);
  } else {
    pending.add(entry.key);
  }
}
