import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { chf } from '@/lib/format';
import { parseVibecodeExport, peekNextInvoiceNumber, vibecodeTotals, type VibecodeExport, type VibecodeReport, type VibecodeTotals } from '@/lib/vibecodeImport';
import { Button, Card, H2, ListItem, Muted, Notice, Spacer, Screen } from '@/ui/kit';

function TotalsCard({ t }: { t: VibecodeTotals }) {
  return (
    <Card>
      <ListItem icon="business-outline" title={`${t.accounts} comptes`} subtitle={`${t.demoExcluded} fiche(s) DÉMO exclue(s)`} />
      <ListItem icon="document-text-outline" title={`${t.invoices} factures — ${chf(t.invoicesTotal)}`} subtitle={`${t.paid} payée(s) ${chf(t.paidTotal)} · ${t.open} ouverte(s) ${chf(t.openTotal)} · ${t.cancelled} annulée(s) ${chf(t.cancelledTotal)}`} />
      <ListItem icon="cash-outline" title={`${t.payments} encaissement(s) — ${chf(t.paymentsTotal)}`} subtitle="Repris dans la note et la date de paiement de chaque facture" />
      <ListItem icon="receipt-outline" title={`${t.expenses} dépenses — ${chf(t.expensesTotal)}`} subtitle="Dates, montants et catégories d’origine" />
      <ListItem icon="pricetag-outline" title={`${t.products} produit(s)`} subtitle={`${t.ordersAsInvoiceNotes} commande(s) en note de facture · ${t.ordersAsAccountNotes} sans facture en note de compte · ${t.activityNotes} note(s) de visite`} />
    </Card>
  );
}

export default function ImportVibecodeScreen() {
  const d = useData();
  const router = useRouter();
  const [file, setFile] = useState<{ name: string; data: VibecodeExport } | null>(null);
  const [report, setReport] = useState<VibecodeReport | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setErr(''); setReport(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      const text = a.file ? await a.file.text() : await (await fetch(a.uri)).text();
      const parsed = parseVibecodeExport(text);
      if (!parsed.ok) { setFile(null); setErr(parsed.error); return; }
      setFile({ name: a.name, data: parsed.data });
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
  };

  const run = () => {
    if (!file) return;
    setBusy(true); setErr('');
    const res = d.importVibecode(file.data);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setReport(res.report);
  };

  const a = report?.added;
  const sk = report?.skipped;
  const nothingNew = a ? a.comptes + a.factures + a.depenses + a.produits + a.parametres === 0 : false;

  return (
    <Screen>
      <H2>Importer sauvegarde Vibecode (JSON)</H2>
      <Muted>
        Ajoute les données de l’ancien CRM Vibecode sans rien effacer ni remplacer : ce qui existe déjà est ignoré, les numéros de facture sont conservés et la numérotation continue la série. Ré-exécutable sans doublon. Les fiches DÉMO sont exclues. Une sauvegarde automatique est faite avant l’import.
      </Muted>
      <Spacer />
      <Notice tone="info" title="Conseil" text="Avant l’import, téléchargez une sauvegarde chiffrée (Réglages société → Sauvegarde)." />
      <Spacer />
      <Button icon="document-attach-outline" title={file ? 'Choisir un autre fichier' : 'Choisir le fichier JSON'} onPress={() => void pick()} />
      {err ? (<><Spacer h={8} /><Notice tone="danger" title="Import impossible" text={err} /></>) : null}
      {file && !report ? (
        <>
          <Spacer />
          <H2>Contenu du fichier</H2>
          <Muted style={{ fontSize: 12 }}>{file.name}</Muted>
          <Spacer h={6} />
          <TotalsCard t={vibecodeTotals(file.data)} />
          <Spacer />
          <Button icon="cloud-download-outline" title={busy ? 'Import en cours…' : 'Importer ces données'} onPress={run} disabled={busy} />
        </>
      ) : null}
      {report && a && sk ? (
        <>
          <Spacer />
          <H2>Résumé de l’import</H2>
          <Notice
            tone={report.messages.length ? 'warning' : 'success'}
            title={nothingNew ? 'Déjà importé : rien n’a été ajouté' : 'Import Vibecode terminé'}
            text={`Ajoutés : ${a.comptes} comptes, ${a.factures} factures, ${a.depenses} dépenses, ${a.produits} produits, ${a.parametres} paramètres, ${a.notes} notes.\n` +
              `Déjà présents (inchangés) : ${sk.comptes} comptes, ${sk.factures} factures, ${sk.depenses} dépenses, ${sk.produits} produits.\n` +
              `IBAN : ${report.iban}. Prochaine facture : ${report.nextInvoiceNumber || peekNextInvoiceNumber({ invoices: d.invoices, counters: {} })}.` +
              (report.messages.length ? '\n' + report.messages.slice(0, 8).join('\n') : '')}
          />
          <Spacer h={8} />
          <Muted>Totaux du fichier (hors démo) :</Muted>
          <Spacer h={6} />
          <TotalsCard t={report.file} />
          <Spacer />
          <Button variant="secondary" title="Terminé" icon="checkmark" onPress={() => router.back()} />
        </>
      ) : null}
    </Screen>
  );
}
