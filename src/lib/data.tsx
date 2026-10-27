import { createContext, useContext, type ReactNode } from 'react';
import { usePersistentState, uid } from './storage';
import { DEFAULT_COMPANY, type Account, type Company, type Expense, type Invoice, type Offer } from './model';
import { SEED_ACCOUNTS, SEED_EXPENSES, SEED_INVOICES, SEED_OFFERS } from './seed';
import { addDays, todayISO } from './format';

type Setter<T> = (v: T | ((p: T) => T)) => void;
type Ctx = {
  ready: boolean;
  accounts: Account[]; setAccounts: Setter<Account[]>;
  offers: Offer[]; setOffers: Setter<Offer[]>;
  invoices: Invoice[]; setInvoices: Setter<Invoice[]>;
  expenses: Expense[]; setExpenses: Setter<Expense[]>;
  company: Company; setCompany: Setter<Company>;
  nextNumber: (kind: 'OF' | 'FA') => string;
  convertOfferToInvoice: (offer: Offer) => string;
  removeDemo: () => void;
  hasDemo: boolean;
};
const C = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts, r1] = usePersistentState<Account[]>('accounts', SEED_ACCOUNTS);
  const [offers, setOffers, r2] = usePersistentState<Offer[]>('offers', SEED_OFFERS);
  const [invoices, setInvoices, r3] = usePersistentState<Invoice[]>('invoices', SEED_INVOICES);
  const [expenses, setExpenses, r4] = usePersistentState<Expense[]>('expenses', SEED_EXPENSES);
  const [company, setCompany, r5] = usePersistentState<Company>('company', DEFAULT_COMPANY);
  const [counters, setCounters, r6] = usePersistentState<Record<string, number>>('counters', {});

  const nextNumber = (kind: 'OF' | 'FA') => {
    const y = new Date().getFullYear();
    const key = `${kind}-${y}`;
    const list = kind === 'OF' ? offers : invoices;
    const used = list.filter((d) => d.number.startsWith(key + '-')).map((d) => Number(d.number.split('-')[2]) || 0);
    const n = Math.max(counters[key] ?? 0, ...used, 0) + 1;
    setCounters((c) => ({ ...c, [key]: n }));
    return `${key}-${String(n).padStart(3, '0')}`;
  };

  const convertOfferToInvoice = (o: Offer) => {
    if (o.invoiceId) return o.invoiceId;
    const offerId = o.id;
    const id = uid('fa_');
    const inv: Invoice = {
      id, number: nextNumber('FA'), accountId: o.accountId, date: todayISO(), dueDate: addDays(todayISO(), company.paymentDays || 30),
      lines: o.lines.map((l) => ({ ...l, id: uid('l') })), vat: { ...o.vat }, status: 'draft', offerId: o.id, notes: '', demo: o.demo,
    };
    setInvoices((l) => [inv, ...l]);
    setOffers((l) => l.map((x) => (x.id === offerId ? { ...x, status: 'converted', invoiceId: id } : x)));
    return id;
  };

  const hasDemo = [accounts, offers, invoices, expenses].some((l) => (l as { demo?: boolean }[]).some((x) => x.demo));
  const removeDemo = () => {
    setAccounts((l) => l.filter((x) => !x.demo));
    setOffers((l) => l.filter((x) => !x.demo));
    setInvoices((l) => l.filter((x) => !x.demo));
    setExpenses((l) => l.filter((x) => !x.demo));
  };

  return (
    <C.Provider
      value={{
        ready: r1 && r2 && r3 && r4 && r5 && r6,
        accounts, setAccounts, offers, setOffers, invoices, setInvoices, expenses, setExpenses,
        company: { ...DEFAULT_COMPANY, ...company }, setCompany, nextNumber, convertOfferToInvoice, removeDemo, hasDemo,
      }}
    >
      {children}
    </C.Provider>
  );
}
export function useData() {
  const v = useContext(C);
  if (!v) throw new Error('DataProvider manquant');
  return v;
}
