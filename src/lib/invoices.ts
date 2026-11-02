import { todayISO } from './format';
import { INVOICE_STATUS, totals, type Invoice } from './model';

/** Signe comptable : avoir = −1, brouillon ou annulation sans avoir = 0, facture émise = +1. */
export function turnoverSign(inv: Invoice): -1 | 0 | 1 {
  if (inv.status === 'draft') return 0;
  if (inv.kind === 'credit') return -1;
  if (inv.status === 'cancelled' && !inv.creditedBy) return 0;
  return 1;
}

export function bookTotals(inv: Invoice): { ht: number; tva: number; ttc: number } | null {
  const sign = turnoverSign(inv);
  if (sign === 0) return null;
  const t = totals(inv.lines, inv.vat);
  return { ht: sign * t.ht, tva: sign * t.tva, ttc: sign * t.ttc };
}

export function isCredit(inv: Invoice): boolean {
  return inv.kind === 'credit';
}

export function isDraft(inv: Invoice): boolean {
  return inv.status === 'draft';
}

/** Une facture émise ne se supprime pas (conservation). Seul un brouillon peut disparaître. */
export function canDeleteInvoice(inv: Invoice): boolean {
  return inv.status === 'draft';
}

export function canCredit(inv: Invoice): boolean {
  return inv.kind !== 'credit' && inv.status !== 'draft' && inv.status !== 'cancelled' && !inv.creditedBy && !!inv.number;
}

export function displayStatus(inv: Invoice, today = todayISO()): string {
  if (inv.kind === 'credit') return 'Avoir';
  if ((inv.status === 'sent' || inv.status === 'issued') && inv.dueDate < today) return 'En retard';
  return INVOICE_STATUS[inv.status];
}

export function buildCreditNote(
  original: Invoice,
  id: string,
  number: string,
  date: string,
  lineIds: string[],
): { credit: Invoice; original: Invoice } {
  const credit: Invoice = {
    id,
    number,
    accountId: original.accountId,
    date,
    dueDate: date,
    lines: original.lines.map((l, i) => ({ ...l, id: lineIds[i] ?? l.id })),
    vat: { ...original.vat },
    status: 'issued',
    notes: `Avoir sur la facture ${original.number}.`,
    kind: 'credit',
    relatedId: original.id,
    issuedAt: date,
    demo: original.demo === true ? true : undefined,
  };
  return { credit, original: { ...original, status: 'cancelled', creditedBy: id, number: original.number } };
}
