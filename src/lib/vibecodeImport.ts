import { appendAudit } from './audit';
import { norm } from './format';
import { isPlaceholderIban, isValidIban } from './iban';
import { businessSnapshot, pruneBackups, type BackupRecord, type Store } from './migrate';
import { DELIVERY_CANTON, VAT_RATES, type Account, type Expense, type Invoice, type InvoiceStatus, type Line, type Product, type Stage, type VatRate } from './model';
import { nextSerial, raiseCounters } from './numbering';
import { uid } from './uid';

/**
 * Import « Sauvegarde Vibecode (JSON) » — export de la base Bissabi CRM Pro Vibecode (Prisma/SQLite).
 * - Montants source en centimes CHF, dates en millisecondes epoch (converties en date locale Europe/Zurich).
 * - ADDITIF et idempotent : une ligne déjà présente (même id `vc_…`, même clé `ext`, même numéro de facture
 *   ou même compte réel nom+ville) est ignorée. Rien n’est jamais réécrit ni supprimé.
 * - Les fiches DÉMO de Vibecode (source DEMO, externalId demo-*, nom « DÉMO · ») et leurs contacts, tâches et
 *   notes sont exclues. Les fiches démo de l’app restent séparées (jamais utilisées pour une liaison).
 * - Les numéros de facture (FAC-AAAA-NNNN) sont conservés à l’identique ; le compteur est relevé pour que la
 *   prochaine facture continue la série (FAC-AAAA-dernier+1).
 */

type Row = Record<string, unknown>;
export type VibecodeExport = {
  source?: string;
  CompanySettings?: Row[];
  Counter?: Row[];
  Customer?: Row[];
  Contact?: Row[];
  Product?: Row[];
  Order?: Row[];
  OrderItem?: Row[];
  Invoice?: Row[];
  Payment?: Row[];
  Charge?: Row[];
  TaskItem?: Row[];
  Activity?: Row[];
};

export type VibecodeTotals = {
  accounts: number;
  invoices: number;
  invoicesTotal: number;
  paid: number;
  paidTotal: number;
  open: number;
  openTotal: number;
  cancelled: number;
  cancelledTotal: number;
  payments: number;
  paymentsTotal: number;
  expenses: number;
  expensesTotal: number;
  products: number;
  ordersAsInvoiceNotes: number;
  ordersAsAccountNotes: number;
  activityNotes: number;
  demoExcluded: number;
};

export type VibecodeReport = {
  /** Contenu réel du fichier (hors démo), indépendamment de ce qui est déjà dans l’app. */
  file: VibecodeTotals;
  added: { comptes: number; factures: number; depenses: number; produits: number; parametres: number; notes: number };
  skipped: { comptes: number; factures: number; depenses: number; produits: number };
  iban: 'importé' | 'déjà renseigné' | 'invalide' | 'absent';
  nextInvoiceNumber: string;
  messages: string[];
};

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
/** Centimes → CHF (2 décimales exactes). */
export const cents = (v: unknown) => Math.round(n(v)) / 100;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Dernier dimanche d’un mois (UTC), pour l’heure d’été européenne. */
function lastSunday(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month + 1, 0));
  return d.getUTCDate() - d.getUTCDay();
}
/** Date locale Europe/Zurich (AAAA-MM-JJ) d’un instant epoch ms. Sans Intl : identique sur Hermes et Node. */
export function zurichDate(ms: unknown): string {
  const t = n(ms);
  if (!t) return '';
  const y = new Date(t).getUTCFullYear();
  const start = Date.UTC(y, 2, lastSunday(y, 2), 1);
  const end = Date.UTC(y, 9, lastSunday(y, 9), 1);
  const offset = t >= start && t < end ? 2 : 1;
  return new Date(t + offset * 3600_000).toISOString().slice(0, 10);
}
const dateCH = (iso: string) => (iso ? iso.split('-').reverse().join('.') : '');
const chfTxt = (x: number) => 'CHF ' + x.toFixed(2);

export function isVibecodeDemo(c: Row): boolean {
  return s(c.source).toUpperCase() === 'DEMO' || /^demo-/i.test(s(c.externalId)) || /^d[ée]mo\b/i.test(s(c.name));
}

export function looksLikeVibecodeExport(data: unknown): data is VibecodeExport {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.Customer) && Array.isArray(d.Invoice) && Array.isArray(d.Charge);
}

export function parseVibecodeExport(text: string): { ok: true; data: VibecodeExport } | { ok: false; error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Fichier JSON illisible.' }; }
  if (!looksLikeVibecodeExport(raw)) return { ok: false, error: 'Ce fichier n’est pas une sauvegarde Vibecode (tables Customer, Invoice, Charge attendues).' };
  return { ok: true, data: raw };
}

const STAGE: Record<string, Stage> = {
  PROSPECT: 'prospect', CONTACTE: 'contacte', DEGUSTATION: 'rdv_echantillon', ECHANTILLON: 'rdv_echantillon', RDV: 'rdv_echantillon',
  ESSAI: 'essai', PREMIERE_COMMANDE: 'premiere_commande', CLIENT: 'client_actif', CLIENT_ACTIF: 'client_actif',
};
const TYPE: Record<string, string> = {
  RESTAURANT: 'HORECA', CAFE: 'HORECA', BAR: 'HORECA', HOTEL: 'HORECA', HORECA: 'HORECA',
  EPICERIE: 'Épicerie fine', COMMERCE: 'Commerce', ENTREPRISE: 'Entreprise', EVENEMENTIEL: 'Événementiel', PARTICULIER: 'Particulier',
};
const INVOICE_STATUS: Record<string, InvoiceStatus> = {
  BROUILLON: 'draft', OUVERTE: 'issued', EMISE: 'issued', ENVOYEE: 'sent', PARTIELLE: 'partial', PARTIELLEMENT_PAYEE: 'partial',
  PAYEE: 'paid', ANNULEE: 'cancelled',
};
const ORDER_STATUS: Record<string, string> = { LIVREE: 'livrée', CONFIRMEE: 'confirmée', ANNULEE: 'annulée', BROUILLON: 'brouillon', EN_COURS: 'en cours' };
const METHOD: Record<string, string> = { VIREMENT: 'virement', TWINT: 'TWINT', ESPECES: 'espèces', CASH: 'espèces', CARTE: 'carte' };
/** Catégories conservées telles quelles (simple libellé équivalent de l’app, aucun reclassement). */
const CATEGORY: Record<string, string> = {
  MATIERES_PREMIERES: 'Matières premières', EMBALLAGE_ETIQUETTES: 'Emballages & bouteilles', EMBALLAGES: 'Emballages & bouteilles',
  TRANSPORT: 'Transport & livraison', TRANSPORT_LIVRAISON: 'Transport & livraison', MARKETING_CONTENU: 'Marketing & dégustations',
  MARKETING: 'Marketing & dégustations', SALONS_EVENEMENTS: 'Salons & événements', LOGICIELS: 'Logiciels & abonnements',
  ABONNEMENTS: 'Logiciels & abonnements', LOYER: 'Loyer & charges', ASSURANCES: 'Assurances', FRAIS_BANCAIRES: 'Frais bancaires', AUTRE: 'Autre',
};
const label = (map: Record<string, string>, v: unknown) => map[s(v).toUpperCase()] ?? (s(v) || 'Autre');

const accKey = (nom: string, ville: string) => norm(nom) + '|' + norm(ville);

/** Totaux réels du fichier (hors démo). Sert au résumé et aux contrôles. */
export function vibecodeTotals(data: VibecodeExport): VibecodeTotals {
  const customers = data.Customer ?? [];
  const demoIds = new Set(customers.filter(isVibecodeDemo).map((c) => s(c.id)));
  const realInv = (data.Invoice ?? []).filter((i) => !demoIds.has(s(i.customerId)));
  const realIds = new Set(realInv.map((i) => s(i.id)));
  const by = (st: string) => realInv.filter((i) => s(i.status).toUpperCase() === st);
  const sum = (rows: Row[], k: string) => round2(rows.reduce((a, r) => a + cents(r[k]), 0));
  const invoicedOrders = new Set(realInv.map((i) => s(i.orderId)));
  const realOrders = (data.Order ?? []).filter((o) => !demoIds.has(s(o.customerId)));
  const payments = (data.Payment ?? []).filter((p) => realIds.has(s(p.invoiceId)));
  const open = realInv.filter((i) => !['PAYEE', 'ANNULEE', 'BROUILLON'].includes(s(i.status).toUpperCase()));
  return {
    accounts: customers.length - demoIds.size,
    invoices: realInv.length,
    invoicesTotal: sum(realInv, 'total'),
    paid: by('PAYEE').length,
    paidTotal: sum(by('PAYEE'), 'total'),
    open: open.length,
    openTotal: sum(open, 'total'),
    cancelled: by('ANNULEE').length,
    cancelledTotal: sum(by('ANNULEE'), 'total'),
    payments: payments.length,
    paymentsTotal: sum(payments, 'amount'),
    expenses: (data.Charge ?? []).length,
    expensesTotal: sum(data.Charge ?? [], 'amountInclVat'),
    products: (data.Product ?? []).length,
    ordersAsInvoiceNotes: realOrders.filter((o) => invoicedOrders.has(s(o.id))).length,
    ordersAsAccountNotes: realOrders.filter((o) => !invoicedOrders.has(s(o.id))).length,
    activityNotes: (data.Activity ?? []).filter((a) => !demoIds.has(s(a.customerId))).length,
    demoExcluded: demoIds.size,
  };
}

/** Prochaine facture que l’app attribuera (sans rien réserver). */
export function peekNextInvoiceNumber(store: Pick<Store, 'invoices' | 'counters'>, year = new Date().getFullYear()): string {
  return nextSerial({ prefix: 'FA', year, numbers: store.invoices.map((i) => i.number).filter(Boolean), counters: store.counters }).number;
}

/**
 * Applique l’import sur une copie du store. Pure : aucun effet de bord, testable.
 * Une sauvegarde automatique « pre-import » est ajoutée si au moins une ligne est ajoutée.
 */
export function applyVibecodeImport(store: Store, data: VibecodeExport, now = new Date().toISOString()): { store: Store; report: VibecodeReport } {
  const next: Store = {
    ...store,
    accounts: [...store.accounts], invoices: [...store.invoices], expenses: [...store.expenses], products: [...store.products],
    company: { ...store.company }, counters: { ...store.counters },
  };
  const report: VibecodeReport = {
    file: vibecodeTotals(data),
    added: { comptes: 0, factures: 0, depenses: 0, produits: 0, parametres: 0, notes: 0 },
    skipped: { comptes: 0, factures: 0, depenses: 0, produits: 0 },
    iban: 'absent', nextInvoiceNumber: '', messages: [],
  };

  const customers = data.Customer ?? [];
  const demoIds = new Set(customers.filter(isVibecodeDemo).map((c) => s(c.id)));
  const products = data.Product ?? [];
  const productName = new Map(products.map((p) => [s(p.id), s(p.name) || s(p.sku) || 'Article']));
  const itemsByOrder = new Map<string, Row[]>();
  for (const it of data.OrderItem ?? []) itemsByOrder.set(s(it.orderId), [...(itemsByOrder.get(s(it.orderId)) ?? []), it]);
  const orderById = new Map((data.Order ?? []).map((o) => [s(o.id), o]));
  const invoicedOrders = new Set((data.Invoice ?? []).map((i) => s(i.orderId)));

  const orderSummary = (o: Row) => {
    const items = itemsByOrder.get(s(o.id)) ?? [];
    const total = round2(items.reduce((a, it) => a + n(it.quantity) * cents(it.unitPrice), 0));
    const detail = items.map((it) => `${n(it.quantity)} × ${productName.get(s(it.productId)) ?? 'Article'} à ${chfTxt(cents(it.unitPrice))}`).join(', ');
    return `Commande ${s(o.number)} du ${dateCH(zurichDate(o.orderDate))} (${label(ORDER_STATUS, o.status)})${detail ? ' : ' + detail : ''} = ${chfTxt(total)}${s(o.notes) ? ' · ' + s(o.notes) : ''}`;
  };

  // 1) Produits (le catalogue Bissabi déjà présent est conservé : même réf. ou même nom → ignoré).
  for (const p of products) {
    const id = 'vc_' + s(p.id);
    const ref = s(p.sku);
    if (next.products.some((x) => x.id === id || x.ext === 'vc:prd:' + s(p.id) || (ref && norm(x.ref) === norm(ref)) || norm(x.nom) === norm(s(p.name)))) {
      report.skipped.produits++; continue;
    }
    const prod: Product = {
      id, ext: 'vc:prd:' + s(p.id), ref, nom: s(p.name), description: s(p.description), format: s(p.unit), prix: cents(p.unitPrice),
      unite: 'bouteille', canal: 'B2B (revendeurs)', tvaTaux: n(p.vatRate), source: 'Vibecode CRM',
    };
    next.products.push(prod); report.added.produits++;
  }

  // 2) Comptes. Map id Vibecode → id local (nouveau ou existant) pour lier factures et notes.
  const accountFor = new Map<string, string>();
  const newAccounts = new Map<string, Account>();
  for (const c of customers) {
    if (demoIds.has(s(c.id))) continue;
    const id = 'vc_' + s(c.id);
    const ext = 'vc:cust:' + s(c.id);
    const nom = s(c.name);
    const ville = s(c.city);
    const existing = next.accounts.find((x) => x.id === id || x.ext === ext)
      ?? next.accounts.find((x) => x.demo !== true && accKey(x.nom, x.ville) === accKey(nom, ville));
    if (existing) { accountFor.set(s(c.id), existing.id); report.skipped.comptes++; continue; }
    const canton = s(c.canton).toUpperCase() || DELIVERY_CANTON;
    const contacts = (data.Contact ?? []).filter((k) => s(k.customerId) === s(c.id));
    const first = contacts[0];
    const notes: string[] = [];
    if (s(c.notes)) notes.push(s(c.notes));
    if (n(c.billingSameAsDelivery) === 0 && (s(c.billingName) || s(c.billingAddress) || s(c.billingCity))) {
      notes.push(`Facturation : ${[s(c.billingName), s(c.billingAddress), [s(c.billingPostalCode), s(c.billingCity)].filter(Boolean).join(' '), s(c.billingCountry)].filter(Boolean).join(', ')}`);
    }
    if (s(c.uid)) notes.push(`IDE : ${s(c.uid)}`);
    for (const k of contacts.slice(first && !s(c.contactName) ? 1 : 0)) {
      notes.push(`Contact : ${[s(k.name), s(k.role), s(k.email), s(k.phone)].filter(Boolean).join(' · ')}`);
    }
    const acc: Account = {
      id, ext, nom, type: TYPE[s(c.type).toUpperCase()] ?? 'Autre', etape: STAGE[s(c.stage).toUpperCase()] ?? 'prospect',
      canton, ville, adresse: s(c.address) || undefined, npa: s(c.postalCode) || undefined, livraison_ok: canton === DELIVERY_CANTON,
      mode_logistique: 'À définir',
      contact_nom: s(c.contactName) || s(first?.name), contact_role: s(c.contactName) ? '' : s(first?.role),
      contact_email: s(c.email) || (s(c.contactName) ? '' : s(first?.email)), contact_tel: s(c.phone) || (s(c.contactName) ? '' : s(first?.phone)),
      prochaine_action: '', prochaine_action_date: '', notes: '', source: 'Vibecode CRM',
      createdAt: n(c.createdAt) ? new Date(n(c.createdAt)).toISOString() : now,
    };
    acc.notes = notes.join('\n');
    next.accounts.push(acc); newAccounts.set(s(c.id), acc); accountFor.set(s(c.id), id); report.added.comptes++;
  }
  const addAccountNote = (customerId: string, text: string) => {
    const acc = newAccounts.get(customerId);
    if (!acc) return; // compte déjà présent : jamais réécrit
    acc.notes = acc.notes ? acc.notes + '\n' + text : text;
    report.added.notes++;
  };

  // 3) Tâches ouvertes et notes de visite (hors démo) → notes du compte nouvellement créé.
  for (const t of data.TaskItem ?? []) {
    if (demoIds.has(s(t.customerId))) continue;
    addAccountNote(s(t.customerId), `Tâche${n(t.done) ? ' (faite)' : ''} : ${s(t.title)}${n(t.dueDate) ? ` — échéance ${dateCH(zurichDate(t.dueDate))}` : ''}`);
  }
  for (const a of data.Activity ?? []) {
    if (demoIds.has(s(a.customerId))) continue;
    const kind = s(a.type).toUpperCase() === 'VISITE' ? 'Visite' : s(a.type) ? s(a.type).charAt(0) + s(a.type).slice(1).toLowerCase() : 'Note';
    addAccountNote(s(a.customerId), `${kind} du ${dateCH(zurichDate(a.date))} : ${s(a.content)}`);
  }
  // 4) Commandes sans facture → note sur le compte (aucune facture créée).
  for (const o of data.Order ?? []) {
    if (demoIds.has(s(o.customerId)) || invoicedOrders.has(s(o.id))) continue;
    addAccountNote(s(o.customerId), `${orderSummary(o)} — non facturée dans Vibecode.`);
  }

  // 5) Factures : numéro conservé à l’identique, lignes de la commande, paiements dans la note.
  const takenNumbers = new Set(next.invoices.map((i) => i.number.trim()).filter(Boolean));
  for (const i of data.Invoice ?? []) {
    if (demoIds.has(s(i.customerId))) continue;
    const id = 'vc_' + s(i.id);
    const ext = 'vc:inv:' + s(i.id);
    const number = s(i.number);
    if (next.invoices.some((x) => x.id === id || x.ext === ext || x.ext === 'inv:' + number) || takenNumbers.has(number)) { report.skipped.factures++; continue; }
    const accountId = accountFor.get(s(i.customerId));
    if (!accountId) { report.messages.push(`Facture ${number} : client introuvable dans le fichier, ignorée.`); continue; }
    const order = orderById.get(s(i.orderId));
    const items = order ? itemsByOrder.get(s(order.id)) ?? [] : [];
    const lines: Line[] = items.map((it) => ({ id: uid('l'), description: productName.get(s(it.productId)) ?? 'Article', qty: n(it.quantity), unitPrice: cents(it.unitPrice) }));
    const ht = cents(i.subtotal) || cents(i.total);
    const linesHt = round2(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
    if (Math.abs(linesHt - ht) >= 0.005) {
      lines.push({ id: uid('l'), description: lines.length ? 'Ajustement (montant facturé dans Vibecode)' : 'Montant facturé (Vibecode)', qty: 1, unitPrice: round2(ht - linesHt) });
    }
    const rate = n(i.vatRate);
    const vatOn = n(i.vatEnabled) === 1 && rate > 0;
    const vatRate = ((VAT_RATES as readonly number[]).includes(rate) ? rate : 8.1) as VatRate;
    let status = INVOICE_STATUS[s(i.status).toUpperCase()] ?? 'issued';
    if (status === 'issued' && n(i.sentAt)) status = 'sent';
    const pays = (data.Payment ?? []).filter((p) => s(p.invoiceId) === s(i.id)).sort((a, b) => n(a.date) - n(b.date));
    const notes: string[] = [];
    if (order) notes.push(orderSummary(order));
    for (const p of pays) notes.push(`Encaissement ${chfTxt(cents(p.amount))} le ${dateCH(zurichDate(p.date))} (${label(METHOD, p.method)}${s(p.reference) ? ', réf. ' + s(p.reference) : ''})${s(p.note) ? ' · ' + s(p.note) : ''}`);
    if (status === 'cancelled') notes.push('Annulée dans Vibecode.');
    if (s(i.notes)) notes.push(s(i.notes));
    const paidMs = n(i.paidAt) || (pays.length ? n(pays[pays.length - 1].date) : 0);
    const date = zurichDate(i.issueDate);
    const inv: Invoice = {
      id, ext, number, accountId, date, dueDate: zurichDate(i.dueDate) || date, lines, vat: { apply: vatOn, rate: vatRate }, status,
      paidAt: status === 'paid' && paidMs ? zurichDate(paidMs) : undefined, issuedAt: date, notes: notes.join('\n'), source: 'Vibecode CRM',
    };
    next.invoices.push(inv); takenNumbers.add(number); report.added.factures++;
  }

  // 6) Dépenses : date, fournisseur, montants exacts, catégorie d’origine.
  for (const c of data.Charge ?? []) {
    const id = 'vc_' + s(c.id);
    const ext = 'vc:exp:' + s(c.id);
    if (next.expenses.some((x) => x.id === id || x.ext === ext)) { report.skipped.depenses++; continue; }
    const desc = [s(c.notes), `Paiement : ${label(METHOD, c.paymentMethod)}`, s(c.receiptFilename) && `Justificatif Vibecode : ${s(c.receiptFilename)}`].filter(Boolean).join(' · ');
    const e: Expense = {
      id, ext, date: zurichDate(c.date), category: label(CATEGORY, c.category), supplier: s(c.supplier), description: desc,
      amountTTC: cents(c.amountInclVat), vatAmount: cents(c.vatAmount), source: 'Vibecode CRM',
    };
    next.expenses.push(e); report.added.depenses++;
  }

  // 7) Paramètres société : uniquement les champs vides ; IBAN seulement si valide et actuel = placeholder/vide.
  const cs = (data.CompanySettings ?? [])[0];
  if (cs) {
    const fill = (k: 'email' | 'phone' | 'website', v: string) => {
      if (v && !s(next.company[k])) { next.company[k] = v; report.added.parametres++; }
    };
    fill('email', s(cs.email)); fill('phone', s(cs.phone)); fill('website', s(cs.website));
    const iban = s(cs.iban).replace(/\s/g, '').toUpperCase();
    if (!iban) report.iban = 'absent';
    else if (!isValidIban(iban)) report.iban = 'invalide';
    else if (!isPlaceholderIban(next.company.iban)) report.iban = 'déjà renseigné';
    else { next.company.iban = iban; report.iban = 'importé'; report.added.parametres++; }
  }

  // 8) Compteurs : ne baissent jamais, relevés au plus haut numéro importé et au compteur Vibecode.
  const incoming: Record<string, number> = {};
  for (const k of data.Counter ?? []) if (/^FAC-\d{4}$/.test(s(k.id))) incoming[s(k.id)] = n(k.value);
  for (const [k, v] of Object.entries(incoming)) next.counters[k] = Math.max(next.counters[k] ?? 0, v);
  next.counters = raiseCounters({
    invoices: next.invoices.map((i) => i.number), offers: next.offers.map((o) => o.number),
    creditNotes: next.creditNotes.map((c) => c.number), counters: next.counters,
  });

  const added = report.added.comptes + report.added.factures + report.added.depenses + report.added.produits + report.added.parametres;
  if (added === 0) {
    // Rien de neuf : le store est rendu inchangé (ré-exécution sans effet).
    return { store, report: { ...report, nextInvoiceNumber: peekNextInvoiceNumber(store) } };
  }
  const backup: BackupRecord = { id: uid('bak_'), at: now, reason: 'pre-import', fromVersion: store.schemaVersion, data: businessSnapshot(store) };
  next.backups = pruneBackups([...store.backups, backup]);
  next.audit = appendAudit(store.audit, {
    action: 'import', entity: 'store', at: now,
    detail: `Import Vibecode : +${report.added.comptes} comptes, +${report.added.factures} factures, +${report.added.depenses} dépenses, +${report.added.produits} produits.`,
  });
  report.nextInvoiceNumber = peekNextInvoiceNumber(next);
  return { store: next, report };
}
