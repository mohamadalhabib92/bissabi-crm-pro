import { addDays, todayISO } from './format';
import type { Account, Expense, Invoice, Offer } from './model';

/** Données d'EXEMPLE (marquées demo:true, bannière visible, suppression en un clic). Aucun client réel. */
const now = new Date().toISOString();
const base = { adresse: '', npa: '', notes: 'Fiche d’exemple — à supprimer.', source: 'Exemple', createdAt: now, demo: true } as const;
export const SEED_ACCOUNTS: Account[] = [
  { ...base, id: 'demo-a1', nom: 'Café Exemple (démo)', type: 'HORECA', etape: 'essai', canton: 'VD', ville: 'Lausanne', adresse: 'Rue Exemple 1', npa: '1003', livraison_ok: true, mode_logistique: 'Livraison Bissabi', contact_nom: 'Contact Démo', contact_role: 'Gérant·e', contact_email: 'demo@example.ch', contact_tel: '', prochaine_action: 'Point après essai', prochaine_action_date: addDays(todayISO(), 3) },
  { ...base, id: 'demo-a2', nom: 'Hôtel Démo', type: 'HORECA', etape: 'rdv_echantillon', canton: 'VD', ville: 'Montreux', livraison_ok: true, mode_logistique: 'Livraison Bissabi', contact_nom: '', contact_role: 'F&B manager', contact_email: '', contact_tel: '', prochaine_action: 'Déposer échantillons', prochaine_action_date: addDays(todayISO(), 7) },
  { ...base, id: 'demo-a3', nom: 'Épicerie Démo', type: 'Épicerie fine', etape: 'prospect', canton: 'GE', ville: 'Genève', livraison_ok: false, mode_logistique: 'À définir', contact_nom: '', contact_role: '', contact_email: '', contact_tel: '', prochaine_action: 'Premier appel', prochaine_action_date: '' },
];
const lines = [{ id: 'l1', description: 'Article d’exemple (prix fictif)', qty: 12, unitPrice: 4.5 }];
export const SEED_OFFERS: Offer[] = [
  { id: 'demo-o1', number: 'OF-DEMO-001', accountId: 'demo-a2', date: todayISO(), validUntil: addDays(todayISO(), 30), lines, vat: { apply: false, rate: 8.1 }, status: 'sent', notes: 'Offre d’exemple.', demo: true },
];
export const SEED_INVOICES: Invoice[] = [
  { id: 'demo-i1', number: 'FA-DEMO-001', accountId: 'demo-a1', date: todayISO(), dueDate: addDays(todayISO(), 30), lines, vat: { apply: true, rate: 2.6 }, status: 'sent', notes: '', demo: true },
];
export const SEED_EXPENSES: Expense[] = [
  { id: 'demo-e1', date: todayISO(), category: 'Emballages & bouteilles', supplier: 'Fournisseur exemple', description: 'Dépense d’exemple', amountTTC: 20, vatAmount: 0, demo: true },
];
