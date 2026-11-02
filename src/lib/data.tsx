import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { appendAudit } from './audit';
import { applyRestore, exportRestoreFile, type RestoreFile } from './backup';
import { addDays, todayISO } from './format';
import { hydrate } from './hydrate';
import { buildCreditNote, canCredit, canDeleteInvoice } from './invoices';
import { rollbackMigration, withoutDemo, type Database, type MigrationBackup, type PersistedInput } from './migrate';
import type { AuditEvent } from './audit';
import { DEFAULT_COMPANY, type Account, type Company, type Expense, type Invoice, type Offer, type Product } from './model';
import { formatNumber, nextSequence, sequenceOf, type DocKind } from './numbering';
import { saveJSON, uid } from './storage';

type Setter<T> = (v: T | ((p: T) => T)) => void;

const PERSIST_KEYS = ['accounts', 'offers', 'invoices', 'expenses', 'company', 'products', 'counters', 'audit', 'schemaVersion', 'migrationBackups'] as const;

type Ctx = {
  ready: boolean;
  loadError: string | null;
  migrationWarning: string | null;
  retry: () => void;
  accounts: Account[]; setAccounts: Setter<Account[]>;
  offers: Offer[]; setOffers: Setter<Offer[]>;
  invoices: Invoice[]; setInvoices: Setter<Invoice[]>;
  expenses: Expense[]; setExpenses: Setter<Expense[]>;
  company: Company; setCompany: Setter<Company>;
  products: Product[]; setProducts: Setter<Product[]>;
  audit: AuditEvent[];
  migrationBackups: MigrationBackup[];
  nextNumber: (kind: DocKind) => string;
  saveInvoice: (inv: Invoice) => Invoice;
  issueInvoice: (inv: Invoice) => Invoice;
  markInvoiceSent: (inv: Invoice) => Invoice;
  markInvoicePaid: (inv: Invoice) => Invoice;
  createCreditNote: (inv: Invoice) => Invoice | null;
  deleteInvoice: (id: string) => boolean;
  convertOfferToInvoice: (offer: Offer) => string;
  removeDemo: () => void;
  hasDemo: boolean;
  restoreDatabase: (data: PersistedInput) => void;
  rollbackDatabase: () => boolean;
  exportSnapshot: () => RestoreFile;
};

const C = createContext<Ctx | null>(null);

/** Dernière base en mémoire, pour numéroter et sauver sans relire un état React périmé. */
let memory: Database | null = null;
let persistChain: Promise<unknown> = Promise.resolve();

function enqueuePersist(prev: Database, next: Database) {
  persistChain = persistChain.then(() => persistDiff(prev, next)).catch(() => undefined);
}

function commit(recipe: (d: Database) => Database, setDb: (db: Database) => void): Database {
  const prev = memory;
  if (!prev) throw new Error('Données pas encore chargées');
  const next = recipe(prev);
  memory = next;
  setDb(next);
  enqueuePersist(prev, next);
  return next;
}

function upsert<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some((x) => x.id === row.id) ? rows.map((x) => (x.id === row.id ? row : x)) : [row, ...rows];
}

async function persistDiff(prev: Database, next: Database) {
  await Promise.all(
    PERSIST_KEYS.filter((key) => JSON.stringify(prev[key]) !== JSON.stringify(next[key])).map((key) => saveJSON(key, next[key])),
  );
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [migrationWarning, setMigrationWarning] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    hydrate()
      .then((r) => {
        if (!alive) return;
        memory = r.db;
        setDb(r.db);
        setMigrationWarning(r.warning);
        setLoadError(null);
        setReady(true);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : 'Lecture des données impossible.');
        setReady(false);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const apply = (recipe: (d: Database) => Database): Database => commit(recipe, setDb);

  const setSlice = <K extends 'accounts' | 'offers' | 'invoices' | 'expenses' | 'products' | 'company'>(key: K): Setter<Database[K]> =>
    (next) => {
      apply((prev) => ({ ...prev, [key]: typeof next === 'function' ? (next as (p: Database[K]) => Database[K])(prev[key]) : next }));
    };

  const nextNumber = (kind: DocKind) => {
    const prev = memory;
    if (!prev) return formatNumber(kind, new Date().getFullYear(), 1);
    const year = new Date().getFullYear();
    const list = kind === 'OF' ? prev.offers : prev.invoices;
    const seq = nextSequence(kind, year, list.map((d) => d.number), prev.counters);
    apply((d) => ({ ...d, counters: { ...d.counters, [`${kind}-${year}`]: Math.max(d.counters[`${kind}-${year}`] ?? 0, seq) } }));
    return formatNumber(kind, year, seq);
  };

  const saveInvoice = (inv: Invoice): Invoice => {
    let out = inv;
    apply((prev) => {
      const current = prev.invoices.find((x) => x.id === inv.id);
      if (current && current.status !== 'draft') {
        out = current;
        return prev;
      }
      const created = !current;
      out = inv;
      return {
        ...prev,
        invoices: upsert(prev.invoices, inv),
        audit: created
          ? appendAudit(prev.audit, { id: uid('aud_'), at: new Date().toISOString(), action: 'create', entity: 'invoice', entityId: inv.id, detail: inv.number ? `Brouillon ${inv.number}` : 'Brouillon de facture' })
          : prev.audit,
      };
    });
    return out;
  };

  const issueInvoice = (inv: Invoice): Invoice => {
    let out = inv;
    apply((prev) => {
      const current = prev.invoices.find((x) => x.id === inv.id);
      if (current && current.status !== 'draft') {
        out = current;
        return prev;
      }
      if (inv.status !== 'draft' && !current) return prev;
      const year = new Date().getFullYear();
      const seq = nextSequence('FA', year, prev.invoices.map((i) => i.number), prev.counters);
      const number = inv.number || formatNumber('FA', year, seq);
      const used = sequenceOf('FA', year, number) ?? seq;
      const at = new Date().toISOString();
      out = { ...inv, number, status: 'issued', issuedAt: at };
      return {
        ...prev,
        invoices: upsert(prev.invoices, out),
        counters: { ...prev.counters, [`FA-${year}`]: Math.max(prev.counters[`FA-${year}`] ?? 0, used) },
        audit: appendAudit(prev.audit, { id: uid('aud_'), at, action: 'issue', entity: 'invoice', entityId: out.id, detail: `Émission ${number}` }),
      };
    });
    return out;
  };

  const markInvoiceSent = (inv: Invoice): Invoice => {
    const issued = inv.status === 'draft' ? issueInvoice(inv) : inv;
    if (issued.status !== 'issued') return issued;
    let out = issued;
    apply((prev) => {
      const at = new Date().toISOString();
      out = { ...issued, status: 'sent' };
      return {
        ...prev,
        invoices: upsert(prev.invoices, out),
        audit: appendAudit(prev.audit, { id: uid('aud_'), at, action: 'send', entity: 'invoice', entityId: out.id, detail: `Envoi ${out.number}` }),
      };
    });
    return out;
  };

  const markInvoicePaid = (inv: Invoice): Invoice => {
    if (inv.status !== 'issued' && inv.status !== 'sent' && inv.status !== 'partial') return inv;
    let out = inv;
    apply((prev) => {
      const at = new Date().toISOString();
      out = { ...inv, status: 'paid', paidAt: todayISO() };
      return {
        ...prev,
        invoices: upsert(prev.invoices, out),
        audit: appendAudit(prev.audit, { id: uid('aud_'), at, action: 'payment', entity: 'invoice', entityId: out.id, detail: `Paiement ${out.number}` }),
      };
    });
    return out;
  };

  const createCreditNote = (inv: Invoice): Invoice | null => {
    if (!canCredit(inv)) return null;
    let credit: Invoice | null = null;
    apply((prev) => {
      const current = prev.invoices.find((x) => x.id === inv.id) ?? inv;
      if (!canCredit(current)) return prev;
      const year = new Date().getFullYear();
      const seq = nextSequence('AV', year, prev.invoices.map((i) => i.number), prev.counters);
      const number = formatNumber('AV', year, seq);
      const date = todayISO();
      const built = buildCreditNote(current, uid('av_'), number, date, current.lines.map(() => uid('l')));
      credit = built.credit;
      const at = new Date().toISOString();
      return {
        ...prev,
        invoices: upsert(upsert(prev.invoices, built.original), built.credit),
        counters: { ...prev.counters, [`AV-${year}`]: seq },
        audit: appendAudit(
          appendAudit(prev.audit, { id: uid('aud_'), at, action: 'credit', entity: 'invoice', entityId: built.credit.id, detail: `Avoir ${number} sur ${built.original.number}` }),
          { id: uid('aud_'), at, action: 'cancel', entity: 'invoice', entityId: built.original.id, detail: `Annulée par l'avoir ${number}` },
        ),
      };
    });
    return credit;
  };

  const deleteInvoice = (id: string): boolean => {
    const found = memory?.invoices.find((x) => x.id === id);
    if (!found || !canDeleteInvoice(found)) return false;
    apply((prev) => ({ ...prev, invoices: prev.invoices.filter((x) => x.id !== id) }));
    return true;
  };

  const convertOfferToInvoice = (o: Offer) => {
    if (o.invoiceId) return o.invoiceId;
    const id = uid('fa_');
    const company = memory?.company ?? DEFAULT_COMPANY;
    const inv: Invoice = {
      id,
      number: '',
      accountId: o.accountId,
      date: todayISO(),
      dueDate: addDays(todayISO(), company.paymentDays || 30),
      lines: o.lines.map((l) => ({ ...l, id: uid('l') })),
      vat: { ...o.vat },
      status: 'draft',
      offerId: o.id,
      notes: '',
      demo: o.demo === true ? true : undefined,
    };
    apply((prev) => ({
      ...prev,
      invoices: [inv, ...prev.invoices],
      offers: prev.offers.map((x) => (x.id === o.id ? { ...x, status: 'converted', invoiceId: id } : x)),
      audit: appendAudit(prev.audit, { id: uid('aud_'), at: new Date().toISOString(), action: 'create', entity: 'invoice', entityId: id, detail: `Brouillon depuis l'offre ${o.number}` }),
    }));
    return id;
  };

  const live = db;
  const accounts = live?.accounts ?? [];
  const offers = live?.offers ?? [];
  const invoices = live?.invoices ?? [];
  const expenses = live?.expenses ?? [];
  const hasDemo = [accounts, offers, invoices, expenses].some((l) => l.some((x) => x.demo === true));

  const value: Ctx = {
    ready,
    loadError,
    migrationWarning,
    retry: () => {
      setReady(false);
      setLoadError(null);
      setAttempt((n) => n + 1);
    },
    accounts,
    setAccounts: setSlice('accounts'),
    offers,
    setOffers: setSlice('offers'),
    invoices,
    setInvoices: setSlice('invoices'),
    expenses,
    setExpenses: setSlice('expenses'),
    company: live?.company ?? DEFAULT_COMPANY,
    setCompany: setSlice('company'),
    products: live?.products ?? [],
    setProducts: setSlice('products'),
    audit: live?.audit ?? [],
    migrationBackups: live?.migrationBackups ?? [],
    nextNumber,
    saveInvoice,
    issueInvoice,
    markInvoiceSent,
    markInvoicePaid,
    createCreditNote,
    deleteInvoice,
    convertOfferToInvoice,
    removeDemo: () => {
      apply((prev) => ({
        ...prev,
        accounts: withoutDemo(prev.accounts),
        offers: withoutDemo(prev.offers),
        invoices: withoutDemo(prev.invoices),
        expenses: withoutDemo(prev.expenses),
      }));
    },
    hasDemo,
    restoreDatabase: (data) => {
      apply((prev) => applyRestore(prev, data, new Date().toISOString(), uid('aud_')));
    },
    rollbackDatabase: () => {
      const prev = memory;
      if (!prev) return false;
      const next = rollbackMigration(prev);
      if (!next) return false;
      apply(() => next);
      return true;
    },
    exportSnapshot: () => {
      const current = memory;
      if (!current) throw new Error('Données pas encore chargées');
      return exportRestoreFile(current, new Date().toISOString());
    },
  };

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useData() {
  const v = useContext(C);
  if (!v) throw new Error('DataProvider manquant');
  return v;
}
