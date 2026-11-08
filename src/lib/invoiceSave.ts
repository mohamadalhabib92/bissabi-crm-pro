import { appendAudit } from './audit';
import type { Store } from './migrate';
import { coerceInvoiceStatus, type Invoice } from './model';
import { preserveInvoiceRows } from './preserve';

/**
 * Enregistrement d’une facture. Le numéro déjà posé et les lignes d’une facture émise
 * ne sont pas remplacés. N’écrit rien tout seul : l’appelant décide si le store retourné est commis.
 */
export function applyInvoiceSave(
  s: Store,
  rec: Invoice,
  allocate: (state: Store) => { number: string; counters: Store['counters'] },
  today: string,
): { store: Store; saved: Invoice } {
  const prev = s.invoices.find((i) => i.id === rec.id);
  let counters = s.counters;
  let nextRec: Invoice = { ...rec };
  if (prev && prev.status !== 'draft' && rec.status === 'draft') {
    return { store: s, saved: prev };
  }
  if (prev && prev.status !== 'draft') {
    nextRec = { ...prev, status: coerceInvoiceStatus(prev.status, rec.status), paidAt: rec.paidAt ?? prev.paidAt, creditNoteId: rec.creditNoteId ?? prev.creditNoteId };
  } else if (prev) {
    nextRec = { ...prev, ...nextRec };
    if (prev.number) nextRec = { ...nextRec, number: prev.number };
  }
  if (!nextRec.number && nextRec.status !== 'draft') {
    const alloc = allocate({ ...s, counters });
    nextRec = { ...nextRec, number: alloc.number };
    counters = alloc.counters;
  }
  if (nextRec.status !== 'draft' && !nextRec.issuedAt) nextRec = { ...nextRec, issuedAt: today };
  nextRec = { ...nextRec, demo: prev ? (prev.demo === true ? true : undefined) : (nextRec.demo === true ? true : undefined) };
  const merged = prev ? s.invoices.map((i) => (i.id === nextRec.id ? nextRec : i)) : [nextRec, ...s.invoices];
  const invoices = preserveInvoiceRows(s.invoices, merged);
  const saved = invoices.find((i) => i.id === nextRec.id) ?? nextRec;
  let audit = s.audit;
  if (!prev) audit = appendAudit(audit, { action: 'create', entity: 'invoice', entityId: saved.id, number: saved.number || undefined });
  if ((!prev || prev.status === 'draft') && saved.status !== 'draft') audit = appendAudit(audit, { action: 'issue', entity: 'invoice', entityId: saved.id, number: saved.number });
  if (saved.status === 'sent' && prev?.status !== 'sent') audit = appendAudit(audit, { action: 'send', entity: 'invoice', entityId: saved.id, number: saved.number });
  if (saved.status === 'paid' && prev?.status !== 'paid') audit = appendAudit(audit, { action: 'pay', entity: 'invoice', entityId: saved.id, number: saved.number });
  return { store: { ...s, invoices, counters, audit }, saved };
}

/** Un brouillon peut quitter la liste. Une facture émise reste, et le store retourné est le même objet. */
export function applyDraftDeletion(s: Store, id: string): { store: Store; deleted: boolean } {
  const current = s.invoices.find((i) => i.id === id);
  if (!current || current.status !== 'draft') return { store: s, deleted: false };
  return { store: { ...s, invoices: s.invoices.filter((i) => i.id !== id) }, deleted: true };
}
