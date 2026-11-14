import type { Company } from './model';

/** Libellés de navigation. FR prioritaire et complet ; DE / IT / EN amorcés (repli FR). Documents PDF : FR. */
type Keys = 'dashboard' | 'accounts' | 'pipeline' | 'sales' | 'expenses' | 'settings' | 'offers' | 'invoices' | 'telephony';
const FR: Record<Keys, string> = { dashboard: 'Tableau de bord', accounts: 'Comptes', pipeline: 'Pipeline', sales: 'Ventes', expenses: 'Dépenses', settings: 'Réglages', offers: 'Offres', invoices: 'Factures', telephony: 'Tél. IA' };
const DICTS: Record<Company['lang'], Partial<Record<Keys, string>>> = {
  fr: FR,
  de: { dashboard: 'Übersicht', accounts: 'Konten', pipeline: 'Pipeline', sales: 'Verkauf', expenses: 'Ausgaben', settings: 'Einstellungen', offers: 'Offerten', invoices: 'Rechnungen', telephony: 'KI-Tel.' },
  it: { dashboard: 'Panoramica', accounts: 'Clienti', pipeline: 'Pipeline', sales: 'Vendite', expenses: 'Spese', settings: 'Impostazioni', offers: 'Offerte', invoices: 'Fatture', telephony: 'Tel. IA' },
  en: { dashboard: 'Dashboard', accounts: 'Accounts', pipeline: 'Pipeline', sales: 'Sales', expenses: 'Expenses', settings: 'Settings', offers: 'Quotes', invoices: 'Invoices', telephony: 'AI calls' },
};
export function tr(lang: Company['lang'], k: Keys) {
  return DICTS[lang]?.[k] ?? FR[k];
}
