import { norm, parseDate } from './format';
import { CANTONS, DELIVERY_CANTON, OUT_OF_ZONE, STAGES, type Account, type Stage } from './model';
import { parseCSV, toCSV } from './download';

/** En-têtes EXACTS imposés (séparateur « ; »). */
export const ACCOUNT_HEADERS = [
  'nom', 'type', 'etape', 'canton', 'ville', 'livraison_ok', 'mode_logistique', 'contact_nom', 'contact_role',
  'contact_email', 'contact_tel', 'prochaine_action', 'prochaine_action_date', 'notes', 'source',
] as const;

export type ImportResult = {
  ok: Account[];
  rejected: { line: number; raw: string[]; reasons: string[] }[];
  warnings: { line: number; nom: string; message: string }[];
  headerError?: string;
};

/** Mapping strict des étapes : libellé exact (insensible à la casse/accents) ou clé technique. */
export function mapStage(v: string): Stage | null {
  const n = norm(v);
  const hit = STAGES.find((s) => norm(s.label) === n || s.key === n || norm(s.label.replace('/', ' / ')) === n);
  return hit ? hit.key : null;
}
export function mapCanton(v: string): string | null {
  const n = norm(v);
  const hit = CANTONS.find((c) => norm(c.code) === n || norm(c.name) === n);
  return hit ? hit.code : null;
}
function mapBool(v: string): boolean | null {
  const n = norm(v);
  if (['true', 'oui', 'yes', '1', 'vrai', 'ja'].includes(n)) return true;
  if (['false', 'non', 'no', '0', 'faux', 'nein', ''].includes(n)) return false;
  return null;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function importAccounts(text: string, existing: Account[], makeId: () => string): ImportResult {
  const rows = parseCSV(text, ';');
  const res: ImportResult = { ok: [], rejected: [], warnings: [] };
  if (!rows.length) return { ...res, headerError: 'Fichier vide.' };
  const header = rows[0].map((h) => h.trim());
  if (header.join(';') !== ACCOUNT_HEADERS.join(';')) {
    const missing = ACCOUNT_HEADERS.filter((h) => !header.includes(h));
    const extra = header.filter((h) => !(ACCOUNT_HEADERS as readonly string[]).includes(h));
    return {
      ...res,
      headerError: `En-têtes non conformes. Attendu exactement : ${ACCOUNT_HEADERS.join(';')}${missing.length ? ` — manquants : ${missing.join(', ')}` : ''}${extra.length ? ` — inconnus : ${extra.join(', ')}` : ''}${!missing.length && !extra.length ? ' — ordre différent' : ''}.`,
    };
  }
  const seen = new Set(existing.map((a) => norm(a.nom) + '|' + norm(a.ville)));
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const reasons: string[] = [];
    if (r.length !== ACCOUNT_HEADERS.length) reasons.push(`${r.length} colonnes au lieu de ${ACCOUNT_HEADERS.length}`);
    const g = (k: (typeof ACCOUNT_HEADERS)[number]) => (r[ACCOUNT_HEADERS.indexOf(k)] ?? '').trim();
    const nom = g('nom');
    if (!nom) reasons.push('nom manquant');
    const etape = mapStage(g('etape'));
    if (!etape) reasons.push(`étape « ${g('etape')} » hors pipeline (${STAGES.map((s) => s.label).join(' / ')})`);
    const canton = mapCanton(g('canton'));
    if (!canton) reasons.push(`canton « ${g('canton')} » inconnu (code à 2 lettres, ex. VD)`);
    let livraison = mapBool(g('livraison_ok'));
    if (livraison === null) reasons.push(`livraison_ok « ${g('livraison_ok')} » invalide (true/false, oui/non)`);
    const email = g('contact_email');
    if (email && !EMAIL.test(email)) reasons.push(`e-mail « ${email} » invalide`);
    const dRaw = g('prochaine_action_date');
    const d = dRaw ? parseDate(dRaw) : '';
    if (dRaw && !d) reasons.push(`date « ${dRaw} » invalide (AAAA-MM-JJ ou JJ.MM.AAAA)`);
    const key = norm(nom) + '|' + norm(g('ville'));
    if (nom && seen.has(key)) reasons.push('doublon (même nom et ville déjà présents)');
    if (reasons.length) return void res.rejected.push({ line, raw: r, reasons });
    seen.add(key);
    if (canton !== DELIVERY_CANTON) {
      if (livraison) res.warnings.push({ line, nom, message: `livraison_ok forcé à false — ${OUT_OF_ZONE}` });
      else res.warnings.push({ line, nom, message: OUT_OF_ZONE });
      livraison = false;
    }
    res.ok.push({
      id: makeId(), nom, type: g('type') || 'Autre', etape: etape!, canton: canton!, ville: g('ville'), livraison_ok: !!livraison,
      mode_logistique: g('mode_logistique') || 'À définir', contact_nom: g('contact_nom'), contact_role: g('contact_role'), contact_email: email,
      contact_tel: g('contact_tel'), prochaine_action: g('prochaine_action'), prochaine_action_date: d || '', notes: g('notes'), source: g('source') || 'Import CSV',
      createdAt: new Date().toISOString(),
    });
  });
  return res;
}

export function accountsToCSV(list: Account[]) {
  return toCSV([
    [...ACCOUNT_HEADERS],
    ...list.map((a) => [a.nom, a.type, STAGES.find((s) => s.key === a.etape)?.label, a.canton, a.ville, a.livraison_ok ? 'true' : 'false', a.mode_logistique, a.contact_nom, a.contact_role, a.contact_email, a.contact_tel, a.prochaine_action, a.prochaine_action_date, a.notes, a.source]),
  ]);
}
export const TEMPLATE_CSV = toCSV([[...ACCOUNT_HEADERS], ['Exemple Café SA', 'HORECA', 'Prospect', 'VD', 'Lausanne', 'true', 'Livraison Bissabi', 'Prénom Nom', 'Gérant·e', 'contact@example.ch', '', 'Déposer échantillons', '2026-11-05', 'Ligne d’exemple à remplacer', 'Salon']]);
