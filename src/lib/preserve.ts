import type { Line } from './model';
import { parseDocNumber, sameSerialSlot } from './numbering';

/**
 * Fondation de préservation. Fonctions pures : elles ne lisent pas le système de fichiers
 * de l’appareil, n’envoient rien, et ne réécrivent pas un numéro ou un montant historique.
 * Un test qui passe ici ne prouve pas l’absence de perte sur un iPhone, un iPad ou un Mac.
 */

export const ATTACHMENT_INLINE_MAX_BYTES = 1.5 * 1024 * 1024;

const NON_INVOICE_FAMILIES = new Set(['OF', 'AV', 'CMD', 'DEV']);

export type QuarantineReason = 'json-parse' | 'shape';

export type QuarantineEntry = {
  key: string;
  /** Texte d’origine, non réparé. */
  original: string;
  reason: QuarantineReason;
  /** Empreinte courte, pas un hash de sauvegarde vérifiée. */
  fingerprint: string;
  /** SHA-256 du texte d’origine, ou null si l’API est absente. Ce n’est pas le hash d’une sauvegarde appareil. */
  sha256: string | null;
};

export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export async function sha256Hex(text: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle?.digest) return null;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Garde le texte illisible. N’invente pas d’objet de remplacement. */
export async function quarantineOriginal(key: string, original: string, reason: QuarantineReason): Promise<QuarantineEntry> {
  return { key, original, reason, fingerprint: fnv1a(original), sha256: await sha256Hex(original) };
}

/** `empty` : clé absente. `value` : JSON lu. `keep-original` : ne pas remplacer par une valeur de repli. */
export function storedParseDecision(raw: string | null): 'empty' | 'value' | 'keep-original' {
  if (raw == null) return 'empty';
  try {
    JSON.parse(raw);
    return 'value';
  } catch {
    return 'keep-original';
  }
}

export function isFutureSchema(version: number, known: number): boolean {
  return Number.isFinite(version) && version > known;
}

/** Lecture pas finie, ou schéma plus récent : aucune mutation métier. */
export function canMutateStore(hydrated: boolean, preserveOnly: boolean): boolean {
  return hydrated && !preserveOnly;
}

export type BackupWrite =
  | { ok: true }
  | { ok: false; reason: 'blocked' | 'future' };

/**
 * Restauration ou retour arrière. Un schéma plus récent que celui de l’app n’est pas appliqué :
 * l’original reste en place. Une session déjà gelée ne change pas non plus.
 */
export function backupWriteAllowed(
  current: { hydrated: boolean; preserveOnly: boolean },
  incomingSchema: number,
  known: number,
): BackupWrite {
  if (!canMutateStore(current.hydrated, current.preserveOnly)) return { ok: false, reason: 'blocked' };
  if (isFutureSchema(incomingSchema, known)) return { ok: false, reason: 'future' };
  return { ok: true };
}

/** Le succès d’une suppression n’est vrai que si l’écriture a été acceptée. */
export function deletionReported(deleted: boolean, wrote: boolean): boolean {
  return deleted && wrote;
}

export function keepUnknownFields<T extends object>(prev: T, next: T): T {
  return { ...prev, ...next };
}

/**
 * Pour chaque id déjà présent : conserve les champs absents du nouvel objet, et le numéro d’origine
 * s’il était non vide. N’ajoute pas les lignes retirées. Ne fusionne pas deux numéros ambigus.
 */
export function preserveInvoiceRows<T extends { id: string; number?: string }>(before: T[], after: T[]): T[] {
  const prev = new Map(before.map((row) => [row.id, row]));
  return after.map((row) => {
    const old = prev.get(row.id);
    if (!old) return row;
    const merged = keepUnknownFields(old, row);
    if (old.number && merged.number !== old.number) return { ...merged, number: old.number };
    return merged;
  });
}

export function duplicateExactNumbers(numbers: string[]): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const raw of numbers) {
    const n = raw.trim();
    if (!n) continue;
    if (seen.has(n)) {
      if (!dups.includes(n)) dups.push(n);
    } else seen.add(n);
  }
  return dups;
}

export type WidthAmbiguity = { slot: string; variants: string[] };

/** Variantes de largeur (3 et 4 chiffres, etc.). Le rapport ne choisit pas de gagnant et ne réécrit rien. */
export function invoiceNumberAmbiguities(numbers: string[]): WidthAmbiguity[] {
  const groups = new Map<string, string[]>();
  for (const raw of numbers) {
    const parsed = parseDocNumber(raw);
    if (!parsed || NON_INVOICE_FAMILIES.has(parsed.family)) continue;
    const slot = `${parsed.family}|${parsed.year}|${parsed.serial}`;
    const list = groups.get(slot) ?? [];
    if (!list.includes(parsed.raw)) list.push(parsed.raw);
    groups.set(slot, list);
  }
  return [...groups.entries()].filter(([, variants]) => variants.length > 1).map(([slot, variants]) => ({ slot, variants }));
}

export type ReservationConflict = 'exact' | 'width';

/** Réservation logique. Il n’y a pas de file d’envoi réseau. Un conflit refuse le candidat, sans toucher aux numéros déjà stockés. */
export function reservationConflicts(candidate: string, existing: string[]): ReservationConflict | null {
  const wanted = candidate.trim();
  if (!wanted) return 'exact';
  if (existing.some((raw) => raw.trim() === wanted)) return 'exact';
  if (existing.some((raw) => sameSerialSlot(raw, wanted) && raw.trim() !== wanted)) return 'width';
  return null;
}

export function concurrentNumberConflict(current: string, incoming: string): boolean {
  return current.trim() !== '' && incoming.trim() !== '' && current !== incoming;
}

export function moneyLinesEqual(a: Pick<Line, 'qty' | 'unitPrice'>[], b: Pick<Line, 'qty' | 'unitPrice'>[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((line, i) => line.qty === b[i].qty && line.unitPrice === b[i].unitPrice);
}

export function historicMoneyUntouched<T extends { id: string; lines?: Pick<Line, 'qty' | 'unitPrice'>[] }>(before: T[], after: T[]): boolean {
  const next = new Map(after.map((row) => [row.id, row]));
  return before.every((row) => {
    const other = next.get(row.id);
    if (!other) return false;
    return moneyLinesEqual(row.lines ?? [], other.lines ?? []);
  });
}

/** Observation. N’arrondit pas les montants stockés. Le pas facture est 0,01 CHF, pas le pas cash 0,05. */
export function observeMoney(n: number): { finite: boolean; centimes: number | null; cashCentimes: number | null } {
  if (!Number.isFinite(n)) return { finite: false, centimes: null, cashCentimes: null };
  const centimes = Math.round(n * 100);
  return { finite: true, centimes, cashCentimes: Math.round(centimes / 5) * 5 };
}

export const MONEY_ASSUMPTIONS = {
  currency: 'CHF',
  invoiceStepCentimes: 1,
  cashStepCentimes: 5,
  cashRoundingApplied: false,
  qrDecimals: 2,
  historicAmountsRewritten: false,
} as const;

export type AttachmentKind = 'embedded' | 'cache' | 'document' | 'temporary' | 'unknown';

export function classifyAttachmentUri(uri: string): AttachmentKind {
  if (uri.startsWith('data:')) return 'embedded';
  const u = uri.toLowerCase();
  if (u.startsWith('blob:') || u.startsWith('http:') || u.startsWith('https:') || u.startsWith('content:') || u.startsWith('ph:') || u.startsWith('assets-library:')) return 'temporary';
  if (u.includes('/cache/') || u.includes('/caches/') || u.includes('/tmp/')) return 'cache';
  if (u.includes('/documents/') || u.includes('/document/')) return 'document';
  return 'unknown';
}

/** Seul un data URL est traité comme copie dans les données. Le reste n’a pas été inspecté sur l’appareil. */
export function attachmentLossRisk(att: { uri: string }): 'low' | 'high' | 'unknown' {
  const kind = classifyAttachmentUri(att.uri);
  if (kind === 'embedded') return 'low';
  if (kind === 'cache' || kind === 'temporary') return 'high';
  return 'unknown';
}

export function cacheOnlyDurableClaim(att: { uri: string; persisted?: boolean }): boolean {
  return att.persisted === true && classifyAttachmentUri(att.uri) === 'cache';
}

export function shouldTryInline(size: number | undefined | null): boolean {
  if (size == null) return true;
  return size <= ATTACHMENT_INLINE_MAX_BYTES;
}

export function decideAttachment(input: {
  name: string;
  uri: string;
  mime?: string;
  inlinedDataUrl?: string | null;
  extra?: Record<string, unknown>;
}): { name: string; uri: string; mime?: string; persisted: boolean } & Record<string, unknown> {
  const extra = input.extra ?? {};
  if (input.inlinedDataUrl?.startsWith('data:') && input.inlinedDataUrl.length > 'data:'.length) {
    return { ...extra, name: input.name, mime: input.mime, uri: input.inlinedDataUrl, persisted: true };
  }
  return { ...extra, name: input.name, mime: input.mime, uri: input.uri, persisted: false };
}

export function attachmentSubtitle(att: { uri: string; persisted?: boolean }): string {
  const kind = classifyAttachmentUri(att.uri);
  if (kind === 'embedded') return 'Justificatif copié dans les données';
  if (kind === 'cache') return 'Lien vers le cache : le fichier peut disparaître. L’app ne l’a pas effacé.';
  if (kind === 'document') return 'Lien vers un fichier de l’appareil. Copie non vérifiée : le système de fichiers n’a pas été inspecté.';
  if (kind === 'temporary') return 'Lien temporaire. Il peut cesser de fonctionner après rechargement.';
  return att.persisted
    ? 'Lien marqué enregistré, mais l’emplacement n’est pas vérifié.'
    : 'Lien non embarqué. L’app ne l’a pas effacé.';
}

export type CrashLogDecision = { action: 'write'; value: string } | { action: 'keep' };

/** Un journal de crash illisible n’est pas remplacé par une liste vide. */
export function nextCrashLog(raw: string | null, entry: { at: string; message: string }): CrashLogDecision {
  if (raw != null && storedParseDecision(raw) === 'keep-original') return { action: 'keep' };
  let prev: unknown[] = [];
  if (raw != null) {
    const parsed = JSON.parse(raw) as unknown;
    prev = Array.isArray(parsed) ? parsed : [];
  }
  return { action: 'write', value: JSON.stringify([...prev, entry].slice(-30)) };
}

export type CutoverGate = { id: string; satisfied: false; requirement: string };

/**
 * Porte de bascule. Toutes les cases sont fausses : les tests de ce dépôt ne les remplissent pas.
 * Les cocher exigerait une sauvegarde chiffrée vérifiée, une restauration isolée, des comptages,
 * des hash de référence, et une checklist de retour arrière, sur une copie dont le système de fichiers a été inspecté.
 */
export function cutoverGates(): CutoverGate[] {
  return [
    { id: 'encrypted-backup-verified', satisfied: false, requirement: 'Sauvegarde chiffrée produite sur l’appareil, puis déchiffrée sur une copie isolée, sans écrire sur l’original.' },
    { id: 'isolated-restore', satisfied: false, requirement: 'Restauration exercée hors de l’appareil d’origine, puis comparaison avec la source.' },
    { id: 'counts', satisfied: false, requirement: 'Comptages comptes, factures, avoirs, dépenses, justificatifs, avant et après, égaux à la source.' },
    { id: 'hash-references', satisfied: false, requirement: 'Hash cryptographiques des originaux et de la copie restaurée, pas seulement une empreinte de test.' },
    { id: 'rollback-checklist', satisfied: false, requirement: 'Checklist de retour arrière exécutée, avec la copie d’avant écriture encore lisible.' },
    { id: 'device-filesystem', satisfied: false, requirement: 'Système de fichiers de l’appareil inspecté. Ce n’est pas le cas dans ce dépôt.' },
  ];
}

/** Toujours faux. Aucun argument ne rend la bascule autorisée. */
export function cutoverAllowed(): false {
  return false;
}
