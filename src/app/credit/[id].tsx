import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useData } from '@/lib/data';
import { creditNoteHtml } from '@/lib/documents';
import { chf, dateCH } from '@/lib/format';
import { totals } from '@/lib/model';
import { printHtml } from '@/lib/print';
import { Button, Card, DemoBanner, H2, Muted, Notice, Row, Screen, Spacer } from '@/ui/kit';

export default function CreditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { creditNotes, invoices, accounts, company } = useData();
  const note = creditNotes.find((c) => c.id === id);
  const nav = useNavigation();
  const router = useRouter();
  useEffect(() => { nav.setOptions({ title: note ? `Avoir ${note.number}` : 'Avoir' }); }, [nav, note]);
  if (!note) return <Screen><Notice tone="warning" title="Avoir introuvable" text="Il est peut-être dans une sauvegarde, pas dans les données ouvertes." /></Screen>;
  const acc = accounts.find((a) => a.id === note.accountId);
  const tot = totals(note.lines, note.vat);
  return (
    <Screen>
      {note.demo ? <DemoBanner text="Avoir d’exemple — non réel." /> : null}
      <H2>{note.number}</H2>
      <Muted>Annule la facture n° {note.invoiceNumber} · {dateCH(note.date)} · {acc?.nom ?? 'Client'}</Muted>
      <Spacer />
      <Card>
        {note.lines.map((l) => (
          <Row key={l.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Muted>{l.description}</Muted>
            <Muted>{chf(l.qty * l.unitPrice)}</Muted>
          </Row>
        ))}
        <Muted style={{ marginTop: 8 }}>{note.vat.apply ? `TVA ${note.vat.rate} % · ${chf(tot.tva)}` : 'TVA non applicable'}</Muted>
        <H2>{chf(tot.ttc)}</H2>
      </Card>
      <Row wrap>
        <Button icon="print-outline" title="PDF de l’avoir" onPress={() => void printHtml(creditNoteHtml(company, acc, note))} />
        <Button variant="secondary" title="Voir la facture" onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: note.invoiceId } })} />
      </Row>
      {!invoices.some((i) => i.id === note.invoiceId) ? <Notice tone="warning" title="Facture d’origine absente de la liste" text="L’avoir conserve son numéro et la référence de la facture." /> : null}
    </Screen>
  );
}
