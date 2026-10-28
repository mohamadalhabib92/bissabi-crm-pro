/** Modèle de données Bissabi CRM Pro (stockage local, synchronisable plus tard). */

export const STAGES = [
  { key: 'prospect', label: 'Prospect' },
  { key: 'contacte', label: 'Contacté' },
  { key: 'rdv_echantillon', label: 'RDV/échantillon' },
  { key: 'essai', label: 'Essai' },
  { key: 'premiere_commande', label: 'Première commande' },
  { key: 'client_actif', label: 'Client actif' },
] as const;
export type Stage = (typeof STAGES)[number]['key'];
export const stageLabel = (s: Stage) => STAGES.find((x) => x.key === s)?.label ?? s;
export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.key === s);

export const ACCOUNT_TYPES = ['HORECA', 'Épicerie fine', 'Commerce', 'Entreprise', 'Événementiel', 'Particulier', 'Autre'] as const;
export const isHoreca = (type: string) => /horeca|restaurant|hotel|hôtel|cafe|café|bar/i.test(type);

export const LOGISTICS = ['Livraison Bissabi', 'Retrait Prilly', 'Transporteur', 'À définir'] as const;

export const CANTONS: { code: string; name: string }[] = [
  ['VD', 'Vaud'], ['GE', 'Genève'], ['FR', 'Fribourg'], ['NE', 'Neuchâtel'], ['VS', 'Valais'], ['JU', 'Jura'], ['BE', 'Berne'],
  ['ZH', 'Zurich'], ['BS', 'Bâle-Ville'], ['BL', 'Bâle-Campagne'], ['SO', 'Soleure'], ['AG', 'Argovie'], ['LU', 'Lucerne'], ['ZG', 'Zoug'],
  ['SZ', 'Schwytz'], ['OW', 'Obwald'], ['NW', 'Nidwald'], ['UR', 'Uri'], ['GL', 'Glaris'], ['SG', 'Saint-Gall'], ['AR', 'Appenzell Rh.-Ext.'],
  ['AI', 'Appenzell Rh.-Int.'], ['TG', 'Thurgovie'], ['SH', 'Schaffhouse'], ['GR', 'Grisons'], ['TI', 'Tessin'],
].map(([code, name]) => ({ code, name }));
export const DELIVERY_CANTON = 'VD';
export const OUT_OF_ZONE = 'Hors zone livraison actuelle (livraison boissons : Vaud uniquement)';

export type Account = {
  id: string;
  nom: string;
  type: string;
  etape: Stage;
  canton: string;
  ville: string;
  adresse?: string;
  npa?: string;
  livraison_ok: boolean;
  mode_logistique: string;
  contact_nom: string;
  contact_role: string;
  contact_email: string;
  contact_tel: string;
  prochaine_action: string;
  prochaine_action_date: string;
  notes: string;
  source: string;
  createdAt: string;
  demo?: boolean;
  /** Clé externe stable (import Bissabi) : garantit l’idempotence, jamais modifiée par l’utilisateur. */
  ext?: string;
};

export type Line = { id: string; description: string; qty: number; unitPrice: number };

export const VAT_RATES = [8.1, 2.6, 3.8, 0] as const;
export type VatRate = (typeof VAT_RATES)[number];
export type Vat = { apply: boolean; rate: VatRate };

export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'converted';
export const OFFER_STATUS: Record<OfferStatus, string> = { draft: 'Brouillon', sent: 'Envoyée', accepted: 'Acceptée', refused: 'Refusée', converted: 'Convertie en facture' };
export type Offer = {
  id: string; number: string; accountId: string; date: string; validUntil: string; lines: Line[]; vat: Vat;
  status: OfferStatus; notes: string; invoiceId?: string; demo?: boolean;
};

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';
export const INVOICE_STATUS: Record<InvoiceStatus, string> = { draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', cancelled: 'Annulée' };
export type Invoice = {
  id: string; number: string; accountId: string; date: string; dueDate: string; lines: Line[]; vat: Vat;
  status: InvoiceStatus; paidAt?: string; offerId?: string; notes: string; demo?: boolean; ext?: string; source?: string;
};

export const EXPENSE_CATEGORIES = [
  'Matières premières', 'Emballages & bouteilles', 'Transport & livraison', 'Marketing & dégustations', 'Salons & événements',
  'Logiciels & abonnements', 'Loyer & charges', 'Assurances', 'Frais bancaires', 'Autre',
] as const;
export type Attachment = { name: string; uri: string; mime?: string; persisted: boolean };
export type Expense = {
  id: string; date: string; category: string; supplier: string; description: string; amountTTC: number; vatAmount: number;
  attachment?: Attachment; demo?: boolean; ext?: string; source?: string;
};

export type Product = {
  id: string; ref: string; nom: string; description: string; format: string; prix: number; unite: string; canal: string;
  tvaTaux: number; source: string; ext?: string;
};

export type Company = {
  name: string; street: string; houseNo: string; zip: string; town: string; country: string; uid: string;
  email: string; phone: string; website: string; iban: string; tagline: string; paymentDays: number; vatDefault: boolean; vatRateDefault: VatRate;
  lang: 'fr' | 'de' | 'it' | 'en';
};

export const DEFAULT_COMPANY: Company = {
  name: 'Bissabi Drinks - BA',
  street: 'Chemin de la Suettaz',
  houseNo: '17',
  zip: '1008',
  town: 'Prilly',
  country: 'CH',
  uid: 'CHE-332.255.936',
  email: '',
  phone: '',
  website: '',
  iban: 'YOUR_SWISS_IBAN',
  tagline: 'Swiss Premium Botanical Beverage Brand Inspired by the Sahel',
  paymentDays: 30,
  vatDefault: false,
  vatRateDefault: 8.1,
  lang: 'fr',
};

/** Totaux : prix saisis HT. TVA Non → aucune ligne TVA, mention « TVA non applicable ». */
export function totals(lines: Line[], vat: Vat) {
  const ht = Math.round(lines.reduce((s, l) => s + (l.qty || 0) * (l.unitPrice || 0), 0) * 100) / 100;
  const tva = vat.apply ? Math.round(ht * vat.rate) / 100 : 0;
  return { ht, tva, ttc: Math.round((ht + tva) * 100) / 100 };
}
