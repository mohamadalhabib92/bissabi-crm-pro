import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { appendAudit } from './audit';
import { decryptBackup, encryptBackup, fullCsv, plainExport } from './backup';
import { addDays, todayISO } from './format';
import {
  applyReset,
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
import { applyDraftDeletion, applyInvoiceSave } from './invoiceSave';
import { DEFAULT_COMPANY, isDemo, type Account, type Company, type CreditNote, type Expense, type Invoice, type Offer, type Product } from './model';
import { nextSerial } from './numbering';
import { commitIfHydrated, continueOffline, isPreserveOnly, markPreserveOnly, markStorageHydrated, planDiskWrites, recordWriteOutcome, storageHydrated } from './persistGate';
import { backupWriteAllowed, canMutateStore, deletionReported, preserveInvoiceRows } from './preserve';
import { asyncStorageKv } from './storage';
import { uid } from './uid';
import { applyVibecodeImport, type VibecodeExport, type VibecodeReport } from './vibecodeImport';
import type { AuditEvent } from './audit';

type Setter<T> = (v: T | ((p: T) => T)) => boolean;

type Ctx = {
  ready: boolean;
  loadError: string | null;
  writeError: string | null;
  dismissWriteError: () => void;
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
  convertOfferToInvoice: (offer: Offer) => string | null;
  saveInvoice: (invoice: Invoice) => Invoice | null;
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
  resetBusiness: () => boolean;
  /** Import additif d’une sauvegarde Vibecode (JSON). Atomique : tout ou rien, avec sauvegarde « pre-import ». */
  importVibecode: (data: VibecodeExport) => { ok: true; report: VibecodeReport } | { ok: false; error: string };
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
  const [writeError, setWriteError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const ref = useRef<Store | null>(null);
  const disk = useRef<Store | null>(null);
  const confirmed = useRef<Partial<Record<StoreKey, string>>>({});
  const pending = useRef<Set<StoreKey>>(new Set());
  const queue = useRef(Promise.resolve());
  const WRITE_FAILED = 'L’enregistrement a échoué. Les changements restent à l’écran mais ne sont pas tous sur l’appareil. Libérez de l’espace, puis modifiez à nouveau pour réessayer.';

  const flush = useCallback((next: Store) => {
    // Avant une lecture réussie, y compris au premier rendu : aucune écriture.
    if (!storageHydrated()) return;
    const entries = planDiskWrites(confirmed.current, pending.current, next);
    if (!entries.length) {
      if (pending.current.size === 0) setWriteError(null);
      return;
    }
    const kv = asyncStorageKv();
    queue.current = queue.current.then(async () => {
      const latest = ref.current;
      if (!latest || !storageHydrated()) return;
      const planned = planDiskWrites(confirmed.current, pending.current, latest);
      for (const entry of planned) {
        const fresh = JSON.stringify(latest[entry.key]);
        const attempt = { key: entry.key, value: fresh };
        try {
          const wrote = await commitIfHydrated(kv, [attempt]);
          if (!wrote) {
            recordWriteOutcome(confirmed.current, pending.current, attempt, false);
            continue;
          }
          recordWriteOutcome(confirmed.current, pending.current, attempt, true);
          disk.current = { ...(disk.current ?? EMPTY), [entry.key]: latest[entry.key] };
        } catch {
          recordWriteOutcome(confirmed.current, pending.current, attempt, false);
        }
      }
      setWriteError(pending.current.size > 0 ? WRITE_FAILED : null);
    });
  }, []);

  const mutate = useCallback((recipe: (s: Store) => Store): Store | null => {
    const current = ref.current;
    if (!canMutateStore(storageHydrated(), isPreserveOnly())) {
      if (isPreserveOnly()) setWriteError('Ces données viennent d’une version plus récente. Rien n’est écrit, pour ne pas les modifier.');
      return null;
    }
    if (!current) return null;
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
        markPreserveOnly(res.preserveOnly);
        setLoadError(null);
        setStore(res.store);
        ref.current = res.store;
        pending.current = new Set();
        if (res.persisted) {
          disk.current = res.store;
          confirmed.current = Object.fromEntries(STORE_KEYS.map((key) => [key, JSON.stringify(res.store[key])])) as Partial<Record<StoreKey, string>>;
        } else {
          disk.current = null;
          confirmed.current = {};
        }
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

  const setAccounts = useCallback<Setter<Account[]>>((next) => mutate((s) => ({ ...s, accounts: applySet(s.accounts, next) })) != null, [mutate]);
  const setOffers = useCallback<Setter<Offer[]>>((next) => mutate((s) => ({ ...s, offers: applySet(s.offers, next) })) != null, [mutate]);
  const setInvoices = useCallback<Setter<Invoice[]>>((next) => {
    return mutate((s) => ({ ...s, invoices: preserveInvoiceRows(s.invoices, applySet(s.invoices, next)) })) != null;
  }, [mutate]);
  const setExpenses = useCallback<Setter<Expense[]>>((next) => mutate((s) => ({ ...s, expenses: applySet(s.expenses, next) })) != null, [mutate]);
  const setCompany = useCallback<Setter<Company>>((next) => mutate((s) => ({ ...s, company: applySet(s.company, next) })) != null, [mutate]);
  const setProducts = useCallback<Setter<Product[]>>((next) => mutate((s) => ({ ...s, products: applySet(s.products, next) })) != null, [mutate]);

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

  const saveInvoice = useCallback((rec: Invoice): Invoice | null => {
    let saved: Invoice | null = null;
    const wrote = mutate((s) => {
      const res = applyInvoiceSave(s, rec, (state) => allocate('FA', state), todayISO());
      saved = res.saved;
      return res.store;
    });
    if (!wrote) return null;
    return saved;
  }, [allocate, mutate]);

  const deleteDraftInvoice = useCallback((id: string) => {
    let deleted = false;
    const wrote = mutate((s) => {
      const res = applyDraftDeletion(s, id);
      deleted = res.deleted;
      return res.store;
    });
    return deletionReported(deleted, wrote != null);
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
    const wrote = mutate((s) => ({
      ...s,
      invoices: [inv, ...s.invoices],
      offers: s.offers.map((x) => (x.id === o.id ? { ...x, status: 'converted', invoiceId: id } : x)),
      audit: appendAudit(s.audit, { action: 'create', entity: 'invoice', entityId: id, detail: `Depuis l’offre ${o.number}` }),
    }));
    return wrote ? id : null;
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
    const incomingSchema = typeof parsed.data.schemaVersion === 'number' ? parsed.data.schemaVersion : 0;
    const gate = backupWriteAllowed({ hydrated: storageHydrated(), preserveOnly: isPreserveOnly() }, incomingSchema, SCHEMA_VERSION);
    if (!gate.ok) {
      return { ok: false as const, error: gate.reason === 'future' ? 'Sauvegarde d’une version plus récente. Rien n’a été écrit.' : 'Rien n’a été écrit.' };
    }
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
    if (!canMutateStore(storageHydrated(), isPreserveOnly())) return { ok: false as const, error: 'Rien n’a été écrit.' };
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
    return mutate((s) => applyReset(s, new Date().toISOString())) != null;
  }, [mutate]);

  const importVibecode = useCallback((data: VibecodeExport) => {
    if (!ref.current || !storageHydrated()) return { ok: false as const, error: 'Données pas encore ouvertes.' };
    let report: VibecodeReport | null = null;
    mutate((s) => {
      const res = applyVibecodeImport(s, data, new Date().toISOString());
      report = res.report;
      return res.store;
    });
    if (!report) return { ok: false as const, error: 'Import impossible.' };
    return { ok: true as const, report: report as VibecodeReport };
  }, [mutate]);

  const value: Ctx = store
    ? {
        ready: ready && !loadError,
        loadError,
        writeError,
        dismissWriteError: () => setWriteError(null),
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
        importVibecode,
      }
    : {
        ready: false, loadError, writeError, dismissWriteError: () => setWriteError(null), retry,
        accounts: [], setAccounts, offers: [], setOffers, invoices: [], setInvoices, expenses: [], setExpenses,
        company: { ...DEFAULT_COMPANY }, setCompany, products: [], setProducts, creditNotes: [], audit: [], backups: [],
        nextNumber, convertOfferToInvoice, saveInvoice, deleteDraftInvoice, cancelInvoiceWithCredit, removeDemo,
        hasDemo: false, exportPlain, exportCsv, exportEncrypted, restorePlain, restoreEncrypted, rollbackMigration: rollback, resetBusiness, importVibecode,
      };

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useData() {
  const v = useContext(C);
  if (!v) throw new Error('DataProvider manquant');
  return v;
}
