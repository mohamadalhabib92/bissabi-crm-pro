import { keysToPersist, migratePersisted, shouldMigrate, assembleDatabase, type Database, type PersistedInput } from './migrate';
import { readStorageEntry, saveJSON } from './storage';

const HYDRATE_KEYS = ['accounts', 'offers', 'invoices', 'expenses', 'company', 'products', 'counters', 'audit', 'schemaVersion', 'migrationBackups'] as const;

export class HydrateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HydrateError';
  }
}

/**
 * Lecture locale, puis migration si des données métier existent déjà.
 * La sauvegarde est écrite AVANT le reste. Si elle échoue, rien d'autre n'est écrit.
 * Une clé illisible bloque la migration : on n'écrase jamais avec la démo.
 */
let inflight: Promise<{ db: Database; warning: string | null }> | null = null;

/** Une seule lecture à la fois (React Strict Mode relance l'effet). */
export function hydrate(now = new Date().toISOString()): Promise<{ db: Database; warning: string | null }> {
  if (inflight) return inflight;
  inflight = hydrateOnce(now).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function hydrateOnce(now: string): Promise<{ db: Database; warning: string | null }> {
  const present: Record<string, boolean> = {};
  const values: PersistedInput = {};
  const corrupt: string[] = [];
  for (const key of HYDRATE_KEYS) {
    const read = await readStorageEntry(key);
    if (read.state === 'corrupt') corrupt.push(key);
    else if (read.state === 'ok') {
      present[key] = true;
      (values as Record<string, unknown>)[key] = read.value;
    } else present[key] = false;
  }
  if (corrupt.length) {
    throw new HydrateError(`Donnée locale illisible (${corrupt.join(', ')}). Rien n’a été écrasé. Réessayez.`);
  }
  const version = typeof values.schemaVersion === 'number' ? values.schemaVersion : 0;
  if (!shouldMigrate(present, version)) {
    return { db: assembleDatabase(present, values), warning: null };
  }
  const migrated = migratePersisted({ ...values, schemaVersion: version }, now);
  const keys = keysToPersist(values, migrated.state);
  if (keys.includes('migrationBackups')) {
    const ok = await saveJSON('migrationBackups', migrated.state.migrationBackups);
    if (!ok) {
      return {
        db: assembleDatabase(present, values),
        warning: 'Migration reportée : la sauvegarde n’a pas pu être écrite. Vos données d’origine sont intactes.',
      };
    }
  }
  for (const key of keys) {
    if (key === 'migrationBackups') continue;
    await saveJSON(key, migrated.state[key as keyof Database]);
  }
  return { db: migrated.state, warning: null };
}
