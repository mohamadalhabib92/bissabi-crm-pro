import { toCSV } from './download';
import { totals, type Account, type Invoice } from './model';

/** Export CSV TVA : n° facture, date, client, HT, taux, montant TVA, TTC, TVA Oui/Non (factures non annulées, hors brouillons). */
export function vatCSV(invoices: Invoice[], accounts: Account[]) {
  const name = (id: string) => accounts.find((a) => a.id === id)?.nom ?? '';
  const f = (n: number) => n.toFixed(2);
  return toCSV([
    ['n° facture', 'date', 'client', 'HT', 'taux', 'montant TVA', 'TTC', 'TVA Oui/Non'],
    ...invoices
      .filter((i) => i.status !== 'cancelled' && i.status !== 'draft')
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((i) => {
        const t = totals(i.lines, i.vat);
        return [i.number, i.date, name(i.accountId), f(t.ht), i.vat.apply ? i.vat.rate.toFixed(1) : '', f(t.tva), f(t.ttc), i.vat.apply ? 'Oui' : 'Non'];
      }),
  ]);
}
