import { ACCOUNT_HEADERS, importAccounts } from './accountsCsv';
import { parseCSV } from './download';
import { norm, parseAmount, parseDate } from './format';
import { isPlaceholderIban, isValidIban } from './iban';
import type { Account, Company, Expense, Invoice, InvoiceStatus, Product } from './model';
import { uid } from './storage';

/**
 * Import « Données Bissabi » — idempotent.
 * - Embarqué dans l’app (public) : coordonnées publiques de l’entreprise + catalogue produits.
 * - Privé (jamais dans le dépôt / le bundle) : comptes, contacts, factures, dépenses, IBAN →
 *   fichiers CSV choisis par l’utilisateur (sélecteur de fichiers).
 * Chaque ligne importée porte une clé `ext` stable : une ligne déjà présente n’est jamais
 * réécrite (les modifications de l’utilisateur sont conservées) ni dupliquée.
 */

export const BISSABI_PUBLIC_COMPANY: Partial<Company> = {
  email: 'info@bissabi.ch',
  phone: '+41 79 905 48 92',
  website: 'www.bissabi.ch',
};

const P = (ref: string, nom: string, description: string, format: string, prix: number, unite: string, canal: string, source: string): Product => ({
  id: 'prd_' + ref.toLowerCase(), ext: 'prd:' + ref, ref, nom, description, format, prix, unite, canal, tvaTaux: 0, source,
});
export const BISSABI_CATALOG: Product[] = [
  P('BIS-RED-25', 'Bissabi Red 25cl', 'Boisson à l’hibiscus du Sahel, préparée en Suisse, sans alcool, vegan', '25 cl', 2.5, 'bouteille', 'B2B (revendeurs)', 'Factures envoyées (Gmail)'),
  P('BIS-WHITE-25', 'Bissabi White 25cl', 'Boisson à l’hibiscus blanc du Sahel, préparée en Suisse, sans alcool, vegan', '25 cl', 2.5, 'bouteille', 'B2B (revendeurs)', 'Factures envoyées (Gmail)'),
  P('HORECA-ESSAI-12', 'Pack d’essai 12 bouteilles (HORECA Vaud)', 'Dégustation puis pack d’essai, livraison comprise', '12 × 25 cl', 30, 'pack', 'B2B (offre d’essai Vaud)', 'E-mails de prospection (Gmail)'),
  P('WIX-PACK12-ROUGE', 'Pack de 12 bouteilles Bissabi — Rouge', 'Boutique bissabi.ch · livraison Vaud offerte', '12 × 250 ml', 36, 'pack', 'B2C (boutique Wix)', 'Boutique Wix'),
  P('WIX-PACK12-BLANC', 'Pack de 12 bouteilles Bissabi — Blanc', 'Boutique bissabi.ch · livraison Vaud offerte', '12 × 250 ml', 36, 'pack', 'B2C (boutique Wix)', 'Boutique Wix'),
];

export type ImportState = { accounts: Account[]; invoices: Invoice[]; expenses: Expense[]; products: Product[]; company: Company };
export type ImportReport = {
  added: { comptes: number; factures: number; depenses: number; produits: number; parametres: number };
  skipped: { comptes: number; factures: number; depenses: number; produits: number };
  files: { name: string; kind: string }[];
  messages: string[];
};

type Kind = 'comptes' | 'produits' | 'commandes' | 'depenses' | 'parametres' | 'inconnu';
export function detectKind(text: string): Kind {
  const h = (parseCSV(text, ';')[0] ?? []).map((x) => x.trim().toLowerCase()).join(';');
  if (h === ACCOUNT_HEADERS.join(';')) return 'comptes';
  if (h.startsWith('ref;nom')) return 'produits';
  if (h.startsWith('facture;commande;client')) return 'commandes';
  if (h.startsWith('date;categorie;fournisseur')) return 'depenses';
  if (h.startsWith('cle;valeur')) return 'parametres';
  return 'inconnu';
}

function rowsAsObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text, ';').filter((r) => r.some((c) => c.trim()));
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const STATUS: Record<string, InvoiceStatus> = { brouillon: 'draft', envoyee: 'sent', payee: 'paid', annulee: 'cancelled', draft: 'draft', sent: 'sent', paid: 'paid', cancelled: 'cancelled' };
const accKey = (nom: string, ville: string) => 'acc:' + norm(nom) + '|' + norm(ville);

export function applyBissabiImport(state: ImportState, files: { name: string; text: string }[]): { next: ImportState; report: ImportReport } {
  const next: ImportState = { ...state, accounts: [...state.accounts], invoices: [...state.invoices], expenses: [...state.expenses], products: [...state.products], company: { ...state.company } };
  const report: ImportReport = {
    added: { comptes: 0, factures: 0, depenses: 0, produits: 0, parametres: 0 },
    skipped: { comptes: 0, factures: 0, depenses: 0, produits: 0 },
    files: [], messages: [],
  };

  // 1) Données publiques embarquées : catalogue + coordonnées (seulement si le champ est vide).
  const addProducts = (list: Product[]) => {
    for (const p of list) {
      if (next.products.some((x) => x.ext === p.ext || norm(x.ref) === norm(p.ref))) { report.skipped.produits++; continue; }
      next.products.push(p); report.added.produits++;
    }
  };
  addProducts(BISSABI_CATALOG);
  for (const [k, v] of Object.entries(BISSABI_PUBLIC_COMPANY) as [keyof Company, string][]) {
    if (!String(next.company[k] ?? '').trim()) { (next.company as Record<string, unknown>)[k] = v; report.added.parametres++; }
  }

  // 2) Fichiers privés, dans l’ordre : comptes avant factures (liaison par nom).
  const order: Kind[] = ['parametres', 'produits', 'comptes', 'depenses', 'commandes'];
  const typed = files.map((f) => ({ ...f, kind: detectKind(f.text) })).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const f of typed) {
    report.files.push({ name: f.name, kind: f.kind });
    if (f.kind === 'inconnu') { report.messages.push(`${f.name} : en-têtes non reconnus, fichier ignoré.`); continue; }

    if (f.kind === 'parametres') {
      for (const r of rowsAsObjects(f.text)) {
        const v = r.valeur ?? '';
        if (r.cle === 'iban') {
          if (isPlaceholderIban(next.company.iban) && isValidIban(v)) { next.company.iban = v.replace(/\s/g, ''); report.added.parametres++; }
          else if (!isValidIban(v)) report.messages.push('IBAN du fichier invalide : non appliqué.');
          continue;
        }
        const field = ({ email: 'email', telephone: 'phone', site_web: 'website' } as Record<string, keyof Company>)[r.cle ?? ''];
        if (field && !String(next.company[field] ?? '').trim()) { (next.company as Record<string, unknown>)[field] = v; report.added.parametres++; }
      }
    }

    if (f.kind === 'produits') {
      addProducts(rowsAsObjects(f.text).filter((r) => r.ref && r.nom).map((r) => ({
        id: uid('prd_'), ext: 'prd:' + r.ref, ref: r.ref, nom: r.nom, description: r.description ?? '', format: r.format ?? '',
        prix: parseAmount(r.prix_chf ?? '0'), unite: r.unite ?? '', canal: r.canal ?? '', tvaTaux: parseAmount(r.tva_taux ?? '0'), source: r.source ?? 'import',
      })));
    }

    if (f.kind === 'comptes') {
      const res = importAccounts(f.text, [], () => uid('acc_'));
      if (res.headerError) { report.messages.push(`${f.name} : ${res.headerError}`); continue; }
      res.rejected.forEach((r) => report.messages.push(`${f.name} ligne ${r.line} rejetée : ${r.reasons.join(', ')}`));
      for (const a of res.ok) {
        const ext = accKey(a.nom, a.ville);
        const email = a.contact_email.trim().toLowerCase();
        const exists = next.accounts.some((x) =>
          !x.demo && (x.ext === ext || accKey(x.nom, x.ville) === ext || (!!email && x.contact_email.trim().toLowerCase() === email)));
        if (exists) { report.skipped.comptes++; continue; }
        next.accounts.push({ ...a, ext, demo: undefined }); report.added.comptes++;
      }
    }

    if (f.kind === 'depenses') {
      for (const r of rowsAsObjects(f.text)) {
        const date = parseDate(r.date ?? '');
        if (!date) { report.messages.push(`${f.name} : date invalide « ${r.date} », ligne ignorée.`); continue; }
        const ext = 'exp:' + (r.reference || `${date}|${norm(r.fournisseur ?? '')}|${r.montant_ttc}`);
        if (next.expenses.some((x) => x.ext === ext)) { report.skipped.depenses++; continue; }
        const e: Expense = {
          id: uid('dep_'), ext, date, category: (r.categorie || 'Autre') as Expense['category'], supplier: r.fournisseur ?? '',
          description: [r.description, r.reference && `Réf. ${r.reference}`, r.notes].filter(Boolean).join(' · '),
          amountTTC: parseAmount(r.montant_ttc ?? '0'), vatAmount: parseAmount(r.tva ?? '0'), source: r.source,
        };
        next.expenses.push(e); report.added.depenses++;
      }
    }

    if (f.kind === 'commandes') {
      const groups = new Map<string, Record<string, string>[]>();
      for (const r of rowsAsObjects(f.text)) if (r.facture) groups.set(r.facture, [...(groups.get(r.facture) ?? []), r]);
      for (const [num, rows] of groups) {
        const ext = 'inv:' + num;
        if (next.invoices.some((x) => x.ext === ext || x.number === num)) { report.skipped.factures++; continue; }
        const h = rows[0];
        const acc = next.accounts.find((a) => !a.demo && norm(a.nom) === norm(h.client));
        if (!acc) { report.messages.push(`Facture ${num} : compte « ${h.client} » introuvable — importez d’abord accounts.csv.`); continue; }
        const rate = parseAmount(h.tva_taux ?? '0');
        const date = parseDate(h.date) ?? h.date;
        const inv: Invoice = {
          id: uid('fa_'), ext, number: num, accountId: acc.id, date, dueDate: parseDate(h.echeance) ?? date,
          lines: rows.map((r) => ({ id: uid('l'), description: r.description, qty: parseAmount(r.quantite), unitPrice: parseAmount(r.prix_unitaire) })),
          vat: { apply: rate > 0, rate: (rate > 0 ? rate : 8.1) as Invoice['vat']['rate'] }, status: STATUS[norm(h.statut).replace(/\s/g, '')] ?? 'sent',
          notes: [h.commande && `Commande ${h.commande}`, h.notes].filter(Boolean).join(' · '), source: h.source,
        };
        next.invoices.push(inv); report.added.factures++;
      }
    }
  }
  return { next, report };
}

export function summarize(r: ImportReport): string {
  const a = r.added, s = r.skipped;
  return `Ajoutés : ${a.comptes} comptes, ${a.factures} factures, ${a.depenses} dépenses, ${a.produits} produits, ${a.parametres} paramètres. ` +
    `Déjà présents (inchangés) : ${s.comptes} comptes, ${s.factures} factures, ${s.depenses} dépenses, ${s.produits} produits.`;
}
