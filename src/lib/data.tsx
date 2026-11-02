import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { appendAudit } from './audit';
import { decryptBackup, encryptBackup, fullCsv, plainExport } from './backup';
import { addDays, todayISO } from './format';
import {
  applyRestore,
  loadAndMigrate,
  parsePlainBackup,
  rollbackMigration,
  SCHEMA_VERSION,
  STORE_KEYS,
  stripDemo,
  type BackupRecord,
  type Store,
  type StoreKey,
} from './migrate';
import { DEFAULT_COMPANY, isDemo, type Account, type Company, type CreditNote, type Expense, type Invoice, type Offer, type Product } from './model';
import { nextSerial } from './numbering';
import { commitIfHydrated, continueOffline, markStorageHydrated, storageHydrated } from './persistGate';
import { asyncStorageKv } from './storage';
import { uid } from './uid';
import type { AuditEvent } from './audit';

type Setter<T> = (v: T | ((p: T) => T)) => void;

type Ctx = {
  ready: boolean;
  loadError: string | null;
  retry: () => void;
  accounts: Account[];
  setAccounts: Setter<Account[]>;
  offers: Offer[];
  setOffers: Setter<Offer[]>;
  invoices: Invoice[];
  setInvoices: Setter<Invoice[]>;
  expenses: Expense[];
  setExpenses: Setter<Expense[]>;
  company: Company;
  setCompany: Setter<Company>;
  products: Product[];
  setProducts: Setter<Product[]>;
  creditNotes: CreditNote[];
  audit: AuditEvent[];
  backups: BackupRecord[];
  nextNumber: (kind: 'OF' | 'FA' | 'AV') => string;
  convertOfferToInvoice: (offer: Offer) => string;
  saveInvoice: (invoice: Invoice) => Invoice;
  deleteDraftInvoice: (id: string) => boolean;
  cancelInvoiceWithCredit: (id: string) => string | null;
  removeDemo: () => void;
  hasDemo: boolean;
  exportPlain: () => Record<string, unknown>;
  exportCsv: () => string;
  exportEncrypted: (passphrase: string) => Promise<string>;
  restorePlain: (text: string) => { ok: true } | { ok: false; error: string };
  restoreEncrypted: (text: string, passphrase: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  rollbackMigration: () => { ok: true } | { ok: false; error: string };
  resetBusiness: () => void;
};

const EMPTY: Store = {
  accounts: [], offers: [], invoices: [], expenses: [], company: { ...DEFAULT_COMPANY }, products: [],
  counters: {}, creditNotes: [], audit: [], backups: [], schemaVersion: SCHEMA_VERSION,
};

const C = createContext<Ctx | null>(null);

function applySet<T>(current: T, next: T | ((p: T) => T)): T {
  return typeof next === 'function' ? (next as (p: T) => T)(current) : next;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const ref = useRef<Store | null>(null);
  const disk = useRef<Store | null>(null);
  const persisted = useRef(true);
  const queue = useRef(Promise.resolve());

  const flush = useCallback((next: Store) => {
    // Avant une lecture réussie, y compris au premier rendu : aucune écriture.
    if (!storageHydrated()) return;
    const prev = disk.current;
    const keys: StoreKey[] = persisted.current && prev ? diffKeys(prev, next) : [...STORE_KEYS];
    persisted.current = true;
    disk.current = next;
    if (!keys.length) return;
    const entries = keys.map((key) => ({ key, value: JSON.stringify(next[key]) }));
    const kv = asyncStorageKv();
    queue.current = queue.current
      .then(() => commitIfHydrated(kv, entries))
      .then(() => undefined, () => undefined);
  }, []);

  const mutate = useCallback((recipe: (s: Store) => Store): Store | null => {
    const current = ref.current;
    if (!storageHydrated() || !current) return null;
    const next = recipe(current);
    ref.current = next;
    setStore(next);
    flush(next);
    return next;
  }, [flush]);

  useEffect(() => {
    let alive = true;
    setReady(false);
    loadAndMigrate(asyncStorageKv(), new Date().toISOString()).then((res) => {
      if (!alive) return;
      if ('error' in res) {
        setLoadError(res.error);
        if (!storageHydrated()) {
          setStore(null);
          ref.current = null;
        }
      } else {
        markStorageHydrated();
        setLoadError(null);
        setStore(res.store);
        ref.current = res.store;
        disk.current = res.store;
        persisted.current = res.persisted;
      }
      setReady(true);
    }).catch((e: unknown) => {
      if (!alive) return;
      setLoadError(e instanceof Error ? e.message : 'Ouverture impossible.');
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  const retry = useCallback(() => {
    continueOffline();
    setTick((n) => n + 1);
  }, []);

  const setAccounts = useCallback<Setter<Account[]>>((next) => { mutate((s) => ({ ...s, accounts: applySet(s.accounts, next) })); }, [mutate]);
  const setOffers = useCallback<Setter<Offer[]>>((next) => { mutate((s) => ({ ...s, offers: applySet(s.offers, next) })); }, [mutate]);
  const setInvoices = useCallback<Setter<Invoice[]>>((next) => { mutate((s) => ({ ...s, invoices: applySet(s.invoices, next) })); }, [mutate]);
  const setExpenses = useCallback<Setter<Expense[]>>((next) => { mutate((s) => ({ ...s, expenses: applySet(s.expenses, next) })); }, [mutate]);
  const setCompany = useCallback<Setter<Company>>((next) => { mutate((s) => ({ ...s, company: applySet(s.company, next) })); }, [mutate]);
  const setProducts = useCallback<Setter<Product[]>>((next) => { mutate((s) => ({ ...s, products: applySet(s.products, next) })); }, [mutate]);

  const allocate = useCallback((prefix: 'FA' | 'OF' | 'AV', s: Store) => {
    const year = new Date().getFullYear();
    const numbers = prefix === 'FA' ? s.invoices.map((i) => i.number) : prefix === 'AV' ? s.creditNotes.map((c) => c.number) : s.offers.map((o) => o.number);
    return nextSerial({ prefix, year, numbers: numbers.filter(Boolean), counters: s.counters });
  }, []);

  const nextNumber = useCallback((kind: 'OF' | 'FA' | 'AV') => {
    let number = '';
    mutate((s) => {
      const alloc = allocate(kind, s);
      number = alloc.number;
      return { ...s, counters: alloc.counters };
    });
    return number;
  }, [allocate, mutate]);

  const saveInvoice = useCallback((rec: Invoice): Invoice => {
    let saved = rec;
    mutate((s) => {
      const prev = s.invoices.find((i) => i.id === rec.id);
      let counters = s.counters;
      let nextRec: Invoice = { ...rec };
      if (prev && prev.status !== 'draft') {
        nextRec = { ...prev, status: rec.status, paidAt: rec.paidAt ?? prev.paidAt, creditNoteId: rec.creditNoteId ?? prev.creditNoteId };
      }
      if (!nextRec.number && nextRec.status !== 'draft') {
        const alloc = allocate('FA', { ...s, counters });
        nextRec = { ...nextRec, number: alloc.number };
        counters = alloc.counters;
      }
      if (nextRec.status !== 'draft' && !nextRec.issuedAt) nextRec = { ...nextRec, issuedAt: todayISO() };
      nextRec = { ...nextRec, demo: prev ? (prev.demo === true ? true : undefined) : (nextRec.demo === true ? true : undefined) };
      saved = nextRec;
      const invoices = prev ? s.invoices.map((i) => (i.id === nextRec.id ? nextRec : i)) : [nextRec, ...s.invoices];
      let audit = s.audit;
      if (!prev) audit = appendAudit(audit, { action: 'create', entity: 'invoice', entityId: nextRec.id, number: nextRec.number || undefined });
      if ((!prev || prev.status === 'draft') && nextRec.status !== 'draft') audit = appendAudit(audit, { action: 'issue', entity: 'invoice', entityId: nextRec.id, number: nextRec.number });
      if (nextRec.status === 'sent' && prev?.status !== 'sent') audit = appendAudit(audit, { action: 'send', entity: 'invoice', entityId: nextRec.id, number: nextRec.number });
      if (nextRec.status === 'paid' && prev?.status !== 'paid') audit = appendAudit(audit, { action: 'pay', entity: 'invoice', entityId: nextRec.id, number: nextRec.number });
      return { ...s, invoices, counters, audit };
    });
    return saved;
  }, [allocate, mutate]);

  const deleteDraftInvoice = useCallback((id: string) => {
    const current = ref.current?.invoices.find((i) => i.id === id);
    if (!current || current.status !== 'draft') return false;
    mutate((s) => ({ ...s, invoices: s.invoices.filter((i) => i.id !== id) }));
    return true;
  }, [mutate]);

  const cancelInvoiceWithCredit = useCallback((id: string) => {
    let creditId: string | null = null;
    mutate((s) => {
      const inv = s.invoices.find((i) => i.id === id);
      if (!inv || inv.status === 'draft' || inv.status === 'cancelled' || !inv.number) return s;
      if (inv.creditNoteId && s.creditNotes.some((c) => c.id === inv.creditNoteId)) {
        creditId = inv.creditNoteId;
        return s;
      }
      const alloc = allocate('AV', s);
      const note: CreditNote = {
        id: uid('av_'),
        number: alloc.number,
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        accountId: inv.accountId,
        date: todayISO(),
        lines: inv.lines.map((l) => ({ ...l, id: uid('l') })),
        vat: { ...inv.vat },
        notes: `Annule la facture n° ${inv.number}`,
        createdAt: new Date().toISOString(),
        demo: inv.demo === true ? true : undefined,
      };
      creditId = note.id;
      return {
        ...s,
        counters: alloc.counters,
        creditNotes: [note, ...s.creditNotes],
        invoices: s.invoices.map((i) => (i.id === inv.id ? { ...i, status: 'cancelled', creditNoteId: note.id } : i)),
        audit: appendAudit(appendAudit(s.audit, { action: 'credit_note', entity: 'creditNote', entityId: note.id, number: note.number, detail: `Facture ${inv.number}` }), {
          action: 'cancel', entity: 'invoice', entityId: inv.id, number: inv.number, detail: `Avoir ${note.number}`,
        }),
      };
    });
    return creditId;
  }, [allocate, mutate]);

  const convertOfferToInvoice = useCallback((o: Offer) => {
    if (o.invoiceId) return o.invoiceId;
    const id = uid('fa_');
    const inv: Invoice = {
      id, number: '', accountId: o.accountId, date: todayISO(), dueDate: addDays(todayISO(), ref.current?.company.paymentDays || 30),
      lines: o.lines.map((l) => ({ ...l, id: uid('l') })), vat: { ...o.vat }, status: 'draft', offerId: o.id, notes: '',
      demo: o.demo === true ? true : undefined,
    };
    mutate((s) => ({
      ...s,
      invoices: [inv, ...s.invoices],
      offers: s.offers.map((x) => (x.id === o.id ? { ...x, status: 'converted', invoiceId: id } : x)),
      audit: appendAudit(s.audit, { action: 'create', entity: 'invoice', entityId: id, detail: `Depuis l’offre ${o.number}` }),
    }));
    return id;
  }, [mutate]);

  const removeDemo = useCallback(() => { mutate((s) => stripDemo(s)); }, [mutate]);

  const exportPlain = useCallback(() => plainExport(ref.current ?? EMPTY), []);
  const exportCsv = useCallback(() => fullCsv(ref.current ?? EMPTY), []);
  const exportEncrypted = useCallback(async (passphrase: string) => {
    const json = JSON.stringify(plainExport(ref.current ?? EMPTY));
    const file = await encryptBackup(json, passphrase);
    mutate((s) => ({ ...s, audit: appendAudit(s.audit, { action: 'backup', entity: 'store', detail: 'Sauvegarde chiffrée exportée.' }) }));
    return file;
  }, [mutate]);

  const restorePlain = useCallback((text: string) => {
    const parsed = parsePlainBackup(text);
    if (!parsed.ok) return parsed;
    const current = ref.current;
    if (!current) return { ok: false as const, error: 'Données pas encore ouvertes.' };
    const next = applyRestore(current, parsed.data, new Date().toISOString());
    ref.current = next;
    setStore(next);
    flush(next);
    return { ok: true as const };
  }, [flush]);

  const restoreEncrypted = useCallback(async (text: string, passphrase: string) => {
    const clear = await decryptBackup(text, passphrase);
    if (!clear.ok) return clear;
    return restorePlain(clear.json);
  }, [restorePlain]);

  const rollback = useCallback(() => {
    const current = ref.current;
    if (!current) return { ok: false as const, error: 'Données pas encore ouvertes.' };
    const res = rollbackMigration(current, new Date().toISOString());
    if (!res.ok) return res;
    ref.current = res.store;
    setStore(res.store);
    flush(res.store);
    return { ok: true as const };
  }, [flush]);

  const resetBusiness = useCallback(() => {
    mutate((s) => {
      const backup: BackupRecord = {
        id: uid('bak_'), at: new Date().toISOString(), reason: 'pre-reset', fromVersion: s.schemaVersion,
        data: {
          accounts: s.accounts, offers: s.offers, invoices: s.invoices, expenses: s.expenses,
          company: s.company, products: s.products, counters: s.counters, creditNotes: s.creditNotes,
        },
      };
      return {
        ...s,
        accounts: [], offers: [], invoices: [], expenses: [], products: [], creditNotes: [], counters: {},
        company: { ...DEFAULT_COMPANY },
        backups: [...s.backups, backup],
        schemaVersion: SCHEMA_VERSION,
        audit: appendAudit(s.audit, { action: 'backup', entity: 'store', detail: 'Réinitialisation après export.' }),
      };
    });
  }, [mutate]);

  const value: Ctx = store
    ? {
        ready: ready && !loadError,
        loadError,
        retry,
        accounts: store.accounts,
        setAccounts,
        offers: store.offers,
        setOffers,
        invoices: store.invoices,
        setInvoices,
        expenses: store.expenses,
        setExpenses,
        company: { ...DEFAULT_COMPANY, ...store.company },
        setCompany,
        products: store.products,
        setProducts,
        creditNotes: store.creditNotes,
        audit: store.audit,
        backups: store.backups,
        nextNumber,
        convertOfferToInvoice,
        saveInvoice,
        deleteDraftInvoice,
        cancelInvoiceWithCredit,
        removeDemo,
        hasDemo: [store.accounts, store.offers, store.invoices, store.expenses, store.creditNotes].some((list) => list.some((row) => isDemo(row))),
        exportPlain,
        exportCsv,
        exportEncrypted,
        restorePlain,
        restoreEncrypted,
        rollbackMigration: rollback,
        resetBusiness,
      }
    : {
        ready: false, loadError, retry,
        accounts: [], setAccounts, offers: [], setOffers, invoices: [], setInvoices, expenses: [], setExpenses,
        company: { ...DEFAULT_COMPANY }, setCompany, products: [], setProducts, creditNotes: [], audit: [], backups: [],
        nextNumber, convertOfferToInvoice, saveInvoice, deleteDraftInvoice, cancelInvoiceWithCredit, removeDemo,
        hasDemo: false, exportPlain, exportCsv, exportEncrypted, restorePlain, restoreEncrypted, rollbackMigration: rollback, resetBusiness,
      };

  return <C.Provider value={value}>{children}</C.Provider>;
}

function diffKeys(prev: Store, next: Store): StoreKey[] {
  return STORE_KEYS.filter((key) => JSON.stringify(prev[key]) !== JSON.stringify(next[key]));
}

export function useData() {
  const v = useContext(C);
  if (!v) throw new Error('DataProvider manquant');
  return v;
}
