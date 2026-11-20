import { parseCSV } from '../csv';
import { mapStage } from '../accountsCsv';
import { toE164 } from './phone';

export const CAMPAIGN_HEADERS = ['nom', 'telephone', 'secteur', 'ville', 'statut', 'canton'] as const;
export const CAMPAIGN_TEMPLATE = `${CAMPAIGN_HEADERS.join(';')}\nCafé Exemple;021 000 00 00;cafe;Lausanne;Prospect;VD\n`;

export type CampaignCsvRow = {
  line: number;
  nom: string;
  phone: string;
  secteur: string;
  ville: string;
  statut: string;
  canton: string;
};

export function parseCampaignCsv(text: string): { rows: CampaignCsvRow[]; errors: { line: number; message: string }[]; headerError?: string } {
  const table = parseCSV(text, ';');
  if (!table.length) return { rows: [], errors: [], headerError: 'Fichier vide.' };
  const header = table[0].map((h) => h.trim());
  if (header.join(';') !== CAMPAIGN_HEADERS.join(';')) {
    return { rows: [], errors: [], headerError: `En-têtes attendus : ${CAMPAIGN_HEADERS.join(';')}` };
  }
  const rows: CampaignCsvRow[] = [];
  const errors: { line: number; message: string }[] = [];
  table.slice(1).forEach((cells, index) => {
    if (cells.every((c) => !c.trim())) return;
    const line = index + 2;
    const get = (name: (typeof CAMPAIGN_HEADERS)[number]) => (cells[CAMPAIGN_HEADERS.indexOf(name)] ?? '').trim();
    const nom = get('nom');
    const phone = toE164(get('telephone'));
    const statut = mapStage(get('statut'));
    const reasons: string[] = [];
    if (!nom) reasons.push('nom manquant');
    if (!phone) reasons.push(`téléphone « ${get('telephone')} » invalide`);
    if (!statut) reasons.push(`statut « ${get('statut')} » hors pipeline`);
    if (reasons.length || !phone || !statut) return void errors.push({ line, message: reasons.join(' · ') });
    rows.push({ line, nom, phone, secteur: get('secteur') || 'autre', ville: get('ville'), statut, canton: get('canton').toUpperCase() });
  });
  return { rows, errors };
}
