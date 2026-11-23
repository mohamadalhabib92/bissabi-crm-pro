import type { Invoice, Offer } from './model';

/** Une offre déjà liée à une facture ne se convertit pas une seconde fois. */
export function canConvertOffer(o: Pick<Offer, 'status' | 'invoiceId'>): boolean {
  return o.status !== 'converted' && !o.invoiceId;
}

/**
 * Brouillon neuf copié depuis l’offre. Le numéro reste vide : il n’est attribué qu’à l’émission.
 * L’offre d’origine et toute facture déjà émise ne sont pas modifiées.
 */
export function draftInvoiceFromOffer(
  o: Offer,
  opts: { id: string; date: string; dueDate: string; lineIds: string[] },
): Invoice {
  return {
    id: opts.id,
    number: '',
    accountId: o.accountId,
    date: opts.date,
    dueDate: opts.dueDate,
    lines: o.lines.map((l, i) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, id: opts.lineIds[i] ?? l.id })),
    vat: { apply: o.vat.apply, rate: o.vat.rate },
    status: 'draft',
    offerId: o.id,
    notes: '',
    demo: o.demo === true ? true : undefined,
  };
}
