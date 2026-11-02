import { appendAudit, type AuditEvent } from './audit';
import { DEFAULT_COMPANY, type Account, type Company, type Expense, type Invoice, type Offer, type Product } from './model';
import { SEED_ACCOUNTS, SEED_EXPENSES, SEED_INVOICES, SEED_OFFERS } from './seed';

/** Version de schéma. Incrémenter à chaque migration additive. */
export const SCHEMA_VERSION = 1;

export const BUSINESS_KEYS = ['accounts', 'offers', 'invoices', 'expenses', 'products'] as const;

export type MigrationBackup = {
  id: string;
  at: string;
  fromVersion: number;
  toVersion: number;
  snapshot: Snapshot;
};

export type Snapshot = {
  accounts: Account[];
  offers: Offer[];
  invoices: Invoice[];
  expenses: Expense[];
  company: Partial<Company>;
  products: Product[];
  counters: Record<string, number>;
  audit: AuditEvent[];
  schemaVersion: number;
};

export type Database = {
  accounts: Account[];
  offers: Offer[];
  invoices: Invoice[];
  expenses: Expense[];
  company: Company;
  products: Product[];
  counters: Record<string, number>;
  audit: AuditEvent[];
  schemaVersion: number;
  migrationBackups: MigrationBackup[];
};

export type PersistedInput = {
  accounts?: Account[];
  offers?: Offer[];
  invoices?: Invoice[];
  expenses?: Expense[];
  company?: Partial<Company>;
  products?: Product[];
  counters?: Record<string, number>;
  audit?: AuditEvent[];
  schemaVersion?: number;
  migrationBackups?: MigrationBackup[];
};

export type DataCounts = {
  accounts: number;
  offers: number;
  invoices: number;
  expenses: number;
  products: number;
  invoiceLines: number;
  offerLines: number;
  attachments: number;
  demoAccounts: number;
  realAccounts: number;
  demoInvoices: number;
  realInvoices: number;
  demoExpenses: number;
  realExpenses: number;
  invoiceNumbers: string[];
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function dataCounts(s: PersistedInput): DataCounts {
  const accounts = s.accounts ?? [];
  const offers = s.offers ?? [];
  const invoices = s.invoices ?? [];
  const expenses = s.expenses ?? [];
  return {
    accounts: accounts.length,
    offers: offers.length,
    invoices: invoices.length,
    expenses: expenses.length,
    products: (s.products ?? []).length,
    invoiceLines: invoices.reduce((n, i) => n + (i.lines?.length ?? 0), 0),
    offerLines: offers.reduce((n, o) => n + (o.lines?.length ?? 0), 0),
    attachments: expenses.filter((e) => !!e.attachment?.uri).length,
    demoAccounts: accounts.filter((a) => a.demo === true).length,
    realAccounts: accounts.filter((a) => a.demo !== true).length,
    demoInvoices: invoices.filter((i) => i.demo === true).length,
    realInvoices: invoices.filter((i) => i.demo !== true).length,
    demoExpenses: expenses.filter((e) => e.demo === true).length,
    realExpenses: expenses.filter((e) => e.demo !== true).length,
    invoiceNumbers: invoices.map((i) => i.number).sort(),
  };
}

export function withoutDemo<T extends { demo?: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => r.demo !== true);
}

function snapshotOf(input: PersistedInput): Snapshot {
  return {
    accounts: clone(input.accounts ?? []),
    offers: clone(input.offers ?? []),
    invoices: clone(input.invoices ?? []),
    expenses: clone(input.expenses ?? []),
    company: clone(input.company ?? {}),
    products: clone(input.products ?? []),
    counters: clone(input.counters ?? {}),
    audit: clone(input.audit ?? []),
    schemaVersion: input.schemaVersion ?? 0,
  };
}

function asDatabase(input: PersistedInput): Database {
  return {
    accounts: input.accounts ?? [],
    offers: input.offers ?? [],
    invoices: input.invoices ?? [],
    expenses: input.expenses ?? [],
    company: { ...DEFAULT_COMPANY, ...(input.company ?? {}) },
    products: input.products ?? [],
    counters: input.counters ?? {},
    audit: input.audit ?? [],
    schemaVersion: input.schemaVersion ?? 0,
    migrationBackups: input.migrationBackups ?? [],
  };
}

export function seedDatabase(): Database {
  return {
    accounts: SEED_ACCOUNTS,
    offers: SEED_OFFERS,
    invoices: SEED_INVOICES,
    expenses: SEED_EXPENSES,
    company: { ...DEFAULT_COMPANY },
    products: [],
    counters: {},
    audit: [],
    schemaVersion: 0,
    migrationBackups: [],
  };
}

/**
 * Clé absente + aucune collection métier en base → démo (premier lancement).
 * Dès qu'une collection métier existe, une clé absente devient une liste vide :
 * on n'injecte jamais la démo dans les vraies données.
 */
export function assembleDatabase(present: Record<string, boolean>, values: PersistedInput): Database {
  const anyBusiness = BUSINESS_KEYS.some((k) => present[k]);
  const anyStored = anyBusiness || present.company || present.counters || present.schemaVersion || present.audit;
  if (!anyStored) return seedDatabase();
  return {
    accounts: present.accounts ? (values.accounts ?? []) : anyBusiness ? [] : SEED_ACCOUNTS,
    offers: present.offers ? (values.offers ?? []) : anyBusiness ? [] : SEED_OFFERS,
    invoices: present.invoices ? (values.invoices ?? []) : anyBusiness ? [] : SEED_INVOICES,
    expenses: present.expenses ? (values.expenses ?? []) : anyBusiness ? [] : SEED_EXPENSES,
    company: { ...DEFAULT_COMPANY, ...(present.company ? (values.company ?? {}) : {}) },
    products: present.products ? (values.products ?? []) : [],
    counters: present.counters ? (values.counters ?? {}) : {},
    audit: present.audit ? (values.audit ?? []) : [],
    schemaVersion: values.schemaVersion ?? 0,
    migrationBackups: present.migrationBackups ? (values.migrationBackups ?? []) : [],
  };
}

export function shouldMigrate(present: Record<string, boolean>, version: number): boolean {
  return version < SCHEMA_VERSION && BUSINESS_KEYS.some((k) => present[k]);
}

/**
 * Migration v0 → v1 : additive, idempotente.
 * - ne renumérote pas, ne pose pas demo:true, n'efface aucune ligne ;
 * - ajoute vatNumber vide s'il manque, un événement d'audit, la version ;
 * - le snapshot pré-migration permet le retour arrière.
 * Les écritures disque (sauvegarde d'abord) sont faites par l'appelant.
 */
export function migratePersisted(input: PersistedInput, now: string): { state: Database; migrated: boolean } {
  if ((input.schemaVersion ?? 0) >= SCHEMA_VERSION) {
    return { state: asDatabase(input), migrated: false };
  }
  const snap = snapshotOf(input);
  const backup: MigrationBackup = {
    id: `bak-${now}`,
    at: now,
    fromVersion: snap.schemaVersion,
    toVersion: SCHEMA_VERSION,
    snapshot: snap,
  };
  const company = { ...DEFAULT_COMPANY, ...(input.company ?? {}) };
  if (company.vatNumber == null) company.vatNumber = '';
  const audit = appendAudit(snap.audit, {
    id: `aud-migrate-${now}`,
    at: now,
    action: 'migrate',
    entity: 'system',
    detail: `Schéma ${snap.schemaVersion} → ${SCHEMA_VERSION} (aucune ligne métier modifiée)`,
  });
  return {
    migrated: true,
    state: {
      accounts: snap.accounts,
      offers: snap.offers,
      invoices: snap.invoices,
      expenses: snap.expenses,
      products: snap.products,
      counters: snap.counters,
      company,
      audit,
      schemaVersion: SCHEMA_VERSION,
      migrationBackups: [backup, ...(input.migrationBackups ?? [])].slice(0, 5),
    },
  };
}

export function rollbackMigration(state: Database): Database | null {
  const [latest, ...rest] = state.migrationBackups;
  if (!latest) return null;
  const snap = latest.snapshot;
  return {
    accounts: snap.accounts,
    offers: snap.offers,
    invoices: snap.invoices,
    expenses: snap.expenses,
    products: snap.products,
    counters: snap.counters,
    company: { ...DEFAULT_COMPANY, ...snap.company },
    audit: appendAudit(snap.audit, {
      id: `aud-rollback-${latest.id}`,
      at: new Date().toISOString(),
      action: 'rollback',
      entity: 'system',
      detail: `Retour au schéma ${snap.schemaVersion} (sauvegarde ${latest.at})`,
    }),
    schemaVersion: snap.schemaVersion,
    migrationBackups: rest,
  };
}

/** Clés réellement modifiées par la migration v1 — on ne réécrit pas les factures. */
export function keysToPersist(before: PersistedInput, after: Database): string[] {
  const keys: string[] = [];
  const consider = (key: keyof Database) => {
    if (JSON.stringify(before[key as keyof PersistedInput] ?? null) !== JSON.stringify(after[key])) keys.push(key);
  };
  consider('company');
  consider('audit');
  consider('schemaVersion');
  consider('migrationBackups');
  return keys;
}
