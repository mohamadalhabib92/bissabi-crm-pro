import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { applyBissabiImport, summarize, type ImportReport } from '@/lib/bissabiImport';
import { useData } from '@/lib/data';
import type { Company } from '@/lib/model';
import { Button, Muted, Notice, Spacer } from './kit';

/**
 * Bouton « Importer les données Bissabi » (idempotent, ré-exécutable sans doublon).
 * Catalogue + coordonnées publiques sont embarqués ; clients, factures, dépenses et IBAN
 * viennent de fichiers privés choisis par l’utilisateur (accounts.csv, produits.csv,
 * commandes.csv, depenses.csv, parametres-societe.csv — sélection multiple possible).
 */
export function BissabiImportButton({ onCompany }: { onCompany?: (c: Company) => void }) {
  const d = useData();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState('');

  const run = async () => {
    setBusy(true); setErr('');
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'text/comma-separated-values', '*/*'], multiple: true, copyToCacheDirectory: true,
      });
      const files = r.canceled ? [] : await Promise.all((r.assets ?? []).map(async (a) => ({
        name: a.name, text: a.file ? await a.file.text() : await (await fetch(a.uri)).text(),
      })));
      const { next, report: rep } = applyBissabiImport(
        { accounts: d.accounts, invoices: d.invoices, expenses: d.expenses, products: d.products, company: d.company }, files);
      d.setAccounts(next.accounts); d.setInvoices(next.invoices); d.setExpenses(next.expenses); d.setProducts(next.products); d.setCompany(next.company);
      onCompany?.(next.company);
      setReport(rep);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button title={busy ? 'Import en cours…' : 'Importer les données Bissabi'} icon="cloud-download-outline" onPress={run} disabled={busy} />
      <Muted style={{ fontSize: 12, marginTop: 6 }}>
        Sélectionnez vos fichiers privés (accounts.csv, produits.csv, commandes.csv, depenses.csv, parametres-societe.csv). Ré-exécutable : rien n’est dupliqué, vos modifications sont conservées, les données démo restent séparées.
      </Muted>
      {report ? (
        <>
          <Spacer h={8} />
          <Notice tone={report.messages.length ? 'warning' : 'success'} title="Import Bissabi terminé"
            text={summarize(report) + (report.files.length ? '' : ' (aucun fichier privé sélectionné : catalogue et coordonnées publiques uniquement)') + (report.messages.length ? '\n' + report.messages.slice(0, 8).join('\n') : '')} />
        </>
      ) : null}
      {err ? <Notice tone="danger" title="Import impossible" text={err} /> : null}
    </>
  );
}
