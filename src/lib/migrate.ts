import { appendAudit, type AuditEvent } from './audit';
import { raiseCounters } from './numbering';
import { DEFAULT_COMPANY, isDemo, type Account, type Company, type CreditNote, type Expense, type Invoice, type Offer, type Product } from './model';
import { SEED_ACCOUNTS, SEED_EXPENSES, SEED_INVOICES, SEED_OFFERS } from './seed';
import { uid } from './uid';

/** Version de schéma. Les données v1 (sans clé) valent 0. Migration additive uniquement. */
export const SCHEMA_VERSION = 2;

/** Clés historiques : ne jamais les renommer. Le préfixe `@bissabi-crm-pro/` est ajouté par le stockage. */
export const CORE_KEYS = ['accounts', 'offers', 'invoices', 'expenses', 'company', 'products', 'counters'] as const;
export const STORE_KEYS = [...CORE_KEYS, 'creditNotes', 'audit', 'backups', 'schemaVersion'] as const;
export type StoreKey = (typeof STORE_KEYS)[number];

export type BackupReason = 'pre-migration' | 'pre-restore' | 'pre-reset' | 'manual';
export type BackupRecord = {
  id: string;
  at: string;
  reason: BackupReason;
  fromVersion: number;
  toVersion?: number;
  /** Copie des données métier avant l’opération. Ne contient pas la liste `backups` (pas d’imbrication). */
  data: Record<string, unknown>;
};

export type Store = {
  accounts: Account[];
  offers: Offer[];
  invoices: Invoice[];
  expenses: Expense[];
  company: Company;
  products: Product[];
  counters: Record<string, number>;
  creditNotes: CreditNote[];
  audit: AuditEvent[];
  backups: BackupRecord[];
  schemaVersion: number;
};

export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function entityCounts(store: Pick<Store, 'accounts' | 'offers' | 'invoices' | 'expenses' | 'products' | 'creditNotes'>) {
  return {
    accounts: store.accounts.length,
    offers: store.offers.length,
    invoices: store.invoices.length,
    expenses: store.expenses.length,
    products: store.products.length,
    creditNotes: store.creditNotes.length,
  };
}

export function businessSnapshot(store: Store): Record<string, unknown> {
  return clone({
    accounts: store.accounts,
    offers: store.offers,
    invoices: store.invoices,
    expenses: store.expenses,
    company: store.company,
    products: store.products,
    counters: store.counters,
    creditNotes: store.creditNotes,
    schemaVersion: store.schemaVersion,
    audit: store.audit,
  });
}

export function stripDemo(store: Store): Store {
  const keep = <T extends { demo?: boolean }>(rows: T[]) => rows.filter((row) => !isDemo(row));
  return {
    ...store,
    accounts: keep(store.accounts),
    offers: keep(store.offers),
    invoices: keep(store.invoices),
    expenses: keep(store.expenses),
    creditNotes: keep(store.creditNotes),
  };
}

function seedStore(extras?: { audit?: AuditEvent[]; backups?: BackupRecord[] }): Store {
  return {
    accounts: clone(SEED_ACCOUNTS),
    offers: clone(SEED_OFFERS),
    invoices: clone(SEED_INVOICES),
    expenses: clone(SEED_EXPENSES),
    company: { ...DEFAULT_COMPANY },
    products: [],
    counters: {},
    creditNotes: [],
    audit: extras?.audit ?? [],
    backups: extras?.backups ?? [],
    schemaVersion: SCHEMA_VERSION,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function ensureVat(company: Company): { company: Company; changed: boolean } {
  const current = (company.vatNumber ?? '').trim();
  if (current) return { company, changed: false };
  return { company: { ...company, vatNumber: 'YOUR_VAT_NUMBER' }, changed: true };
}

/** Migration pure v0/v1 → v2. Ne réécrit aucun numéro, ne pose jamais `demo: true`. */
export function applySchemaMigration(store: Store, now: string): { store: Store; changed: boolean } {
  if (store.schemaVersion >= SCHEMA_VERSION) return { store, changed: false };
  const fromVersion = store.schemaVersion || 0;
  const backup: BackupRecord = {
    id: uid('bak_'),
    at: now,
    reason: 'pre-migration',
    fromVersion,
    toVersion: SCHEMA_VERSION,
    data: businessSnapshot(store),
  };
  const vat = ensureVat(store.company);
  const counters = raiseCounters({
    invoices: store.invoices.map((i) => i.number),
    offers: store.offers.map((o) => o.number),
    creditNotes: store.creditNotes.map((c) => c.number),
    counters: store.counters,
  });
  const migrated: Store = {
    ...store,
    company: vat.company,
    counters,
    schemaVersion: SCHEMA_VERSION,
    backups: [...store.backups, backup],
    audit: appendAudit(store.audit, {
      action: 'migration',
      entity: 'store',
      at: now,
      detail: `Schéma v${fromVersion} → v${SCHEMA_VERSION}. Numéros et pièces conservés.`,
    }),
  };
  return { store: migrated, changed: true };
}

export function rollbackMigration(store: Store, now: string): { ok: true; store: Store } | { ok: false; error: string } {
  const backup = [...store.backups].reverse().find((b) => b.reason === 'pre-migration');
  if (!backup) return { ok: false, error: 'Aucune sauvegarde d’avant migration.' };
  const data = backup.data;
  const restored: Store = {
    ...store,
    accounts: Array.isArray(data.accounts) ? (data.accounts as Account[]) : store.accounts,
    offers: Array.isArray(data.offers) ? (data.offers as Offer[]) : store.offers,
    invoices: Array.isArray(data.invoices) ? (data.invoices as Invoice[]) : store.invoices,
    expenses: Array.isArray(data.expenses) ? (data.expenses as Expense[]) : store.expenses,
    products: Array.isArray(data.products) ? (data.products as Product[]) : store.products,
    creditNotes: Array.isArray(data.creditNotes) ? (data.creditNotes as CreditNote[]) : [],
    counters: asRecord(data.counters) ? (data.counters as Record<string, number>) : {},
    company: asRecord(data.company) ? ({ ...DEFAULT_COMPANY, ...(data.company as Company) }) : store.company,
    // Le journal et les sauvegardes ne rétrécissent pas.
    backups: store.backups,
    schemaVersion: SCHEMA_VERSION,
    audit: appendAudit(store.audit, { action: 'rollback', entity: 'store', at: now, detail: `Retour au snapshot ${backup.id}.` }),
  };
  return { ok: true, store: restored };
}

const ARRAY_KEYS = ['accounts', 'offers', 'invoices', 'expenses', 'products', 'creditNotes', 'audit', 'backups'] as const;

export function parsePlainBackup(text: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Fichier JSON illisible.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Sauvegarde invalide.' };
  const obj = data as Record<string, unknown>;
  if (obj.format === 'bissabi-backup' && obj.ciphertext) return { ok: false, error: 'Ce fichier est chiffré. Utilisez la restauration chiffrée.' };
  for (const key of ARRAY_KEYS) {
    if (key in obj && obj[key] != null && !Array.isArray(obj[key])) return { ok: false, error: `Le champ « ${key} » est illisible. Restauration annulée, rien n’a été écrit.` };
  }
  if (!('accounts' in obj) && !('invoices' in obj) && !('expenses' in obj) && !('offers' in obj)) {
    return { ok: false, error: 'Aucune donnée reconnue dans ce fichier.' };
  }
  return { ok: true, data: obj };
}

export function applyRestore(current: Store, data: Record<string, unknown>, now: string): Store {
  const backup: BackupRecord = {
    id: uid('bak_'),
    at: now,
    reason: 'pre-restore',
    fromVersion: current.schemaVersion,
    data: businessSnapshot(current),
  };
  const next: Store = { ...current, backups: [...current.backups, backup] };
  if (Array.isArray(data.accounts)) next.accounts = data.accounts as Account[];
  if (Array.isArray(data.offers)) next.offers = data.offers as Offer[];
  if (Array.isArray(data.invoices)) next.invoices = data.invoices as Invoice[];
  if (Array.isArray(data.expenses)) next.expenses = data.expenses as Expense[];
  if (Array.isArray(data.products)) next.products = data.products as Product[];
  if (Array.isArray(data.creditNotes)) next.creditNotes = data.creditNotes as CreditNote[];
  if (asRecord(data.counters)) next.counters = data.counters as Record<string, number>;
  if (asRecord(data.company)) next.company = { ...DEFAULT_COMPANY, ...(data.company as Company) };
  if (Array.isArray(data.audit)) {
    const ids = new Set(current.audit.map((event) => event.id));
    const extra = (data.audit as AuditEvent[]).filter((event) => event && typeof event.id === 'string' && !ids.has(event.id));
    next.audit = [...current.audit, ...extra];
  }
  next.audit = appendAudit(next.audit, { action: 'restore', entity: 'store', at: now, detail: 'Restauration d’une sauvegarde JSON.' });
  next.schemaVersion = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  return applySchemaMigration(next, now).store;
}

function fail(label: string): string {
  return `La clé « ${label} » est illisible. Aucune donnée n’a été réécrite.`;
}

export async function loadAndMigrate(kv: Kv, now: string): Promise<{ store: Store; persisted: boolean } | { error: string }> {
  const raw: Partial<Record<StoreKey, string>> = {};
  const parsed: Partial<Record<StoreKey, unknown>> = {};
  for (const key of STORE_KEYS) {
    let text: string | null;
    try {
      text = await kv.get(key);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Lecture du stockage impossible.' };
    }
    if (text == null) continue;
    raw[key] = text;
    try {
      parsed[key] = JSON.parse(text);
    } catch {
      return { error: fail(key) };
    }
  }

  const empty = CORE_KEYS.every((key) => raw[key] == null);
  if (empty) {
    const store = seedStore({
      audit: Array.isArray(parsed.audit) ? (parsed.audit as AuditEvent[]) : [],
      backups: Array.isArray(parsed.backups) ? (parsed.backups as BackupRecord[]) : [],
    });
    return { store, persisted: false };
  }

  for (const key of ['accounts', 'offers', 'invoices', 'expenses', 'products', 'creditNotes', 'audit', 'backups'] as const) {
    if (parsed[key] !== undefined && !Array.isArray(parsed[key])) return { error: fail(key) };
  }
  if (parsed.counters !== undefined && !asRecord(parsed.counters)) return { error: fail('counters') };
  if (parsed.company !== undefined && !asRecord(parsed.company)) return { error: fail('company') };
  if (parsed.schemaVersion !== undefined && typeof parsed.schemaVersion !== 'number') return { error: fail('schemaVersion') };

  // Ne pas fusionner les valeurs par défaut avant le snapshot : la sauvegarde doit être le JSON d’origine.
  const company = (parsed.company as Company | undefined) ?? { ...DEFAULT_COMPANY };
  const store: Store = {
    accounts: (parsed.accounts as Account[]) ?? [],
    offers: (parsed.offers as Offer[]) ?? [],
    invoices: (parsed.invoices as Invoice[]) ?? [],
    expenses: (parsed.expenses as Expense[]) ?? [],
    products: (parsed.products as Product[]) ?? [],
    creditNotes: (parsed.creditNotes as CreditNote[]) ?? [],
    audit: (parsed.audit as AuditEvent[]) ?? [],
    backups: (parsed.backups as BackupRecord[]) ?? [],
    counters: (parsed.counters as Record<string, number>) ?? {},
    company,
    schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0,
  };

  const result = applySchemaMigration(store, now);
  if (!result.changed) return { store: result.store, persisted: true };

  const next = result.store;
  const writes: [StoreKey, unknown][] = [
    ['schemaVersion', next.schemaVersion],
    ['backups', next.backups],
    ['audit', next.audit],
  ];
  if (JSON.stringify(next.counters) !== JSON.stringify(store.counters)) writes.push(['counters', next.counters]);
  if (raw.company != null && JSON.stringify(next.company) !== JSON.stringify(parsed.company)) writes.push(['company', next.company]);
  for (const [key, value] of writes) await kv.set(key, JSON.stringify(value));
  return { store: next, persisted: true };
}
