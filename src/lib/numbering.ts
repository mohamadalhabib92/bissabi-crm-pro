/**
 * Numérotation continue. Les numéros déjà stockés ne sont jamais réécrits.
 * Le suivant est max(dernier numéro de l'année, compteur) + 1 — aucun réemploi.
 * Format des NOUVEAUX documents : FA-2026-0004 (4 chiffres). FA-2026-003 déjà en base reste tel quel.
 */

export type DocKind = 'FA' | 'OF' | 'AV';

export function sequenceOf(kind: DocKind, year: number, number: string): number | null {
  const m = new RegExp(`^${kind}-${year}-(\\d+)$`).exec((number ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

export function nextSequence(kind: DocKind, year: number, numbers: string[], counters: Record<string, number>): number {
  const fromDocs = numbers.reduce((max, n) => Math.max(max, sequenceOf(kind, year, n) ?? 0), 0);
  const fromCounter = counters[`${kind}-${year}`] ?? 0;
  return Math.max(fromDocs, fromCounter, 0) + 1;
}

export function formatNumber(kind: DocKind, year: number, seq: number): string {
  return `${kind}-${year}-${String(seq).padStart(4, '0')}`;
}
