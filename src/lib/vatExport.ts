import { toCSV } from './csv';
import { bookTotals } from './invoices';
import type { Account, Invoice } from './model';

/**
 * CSV TVA. Un avoir est négatif. Une facture annulée par avoir reste dans son mois
 * (l'avoir la compense). Une annulation ancienne, sans avoir, reste exclue.
 */
export function vatCSV(invoices: Invoice[], accounts: Account[]) {
  const name = (id: string) => accounts.find((a) => a.id === id)?.nom ?? '';
  const f = (n: number) => n.toFixed(2);
  return toCSV([
    ['n° facture', 'date', 'client', 'HT', 'taux', 'montant TVA', 'TTC', 'TVA Oui/Non'],
    ...invoices
      .map((i) => ({ i, t: bookTotals(i) }))
      .filter((x): x is { i: Invoice; t: NonNullable<ReturnType<typeof bookTotals>> } => x.t != null)
      .sort((a, b) => a.i.date.localeCompare(b.i.date))
      .map(({ i, t }) => [i.number, i.date, name(i.accountId), f(t.ht), i.vat.apply ? i.vat.rate.toFixed(1) : '', f(t.tva), f(t.ttc), i.vat.apply ? 'Oui' : 'Non']),
  ]);
}
