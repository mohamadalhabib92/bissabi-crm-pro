import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { AccountPicker } from '@/components/AccountPicker';
import { LinesEditor } from '@/components/LinesEditor';
import { QrPreview } from '@/components/QrPreview';
import { confirmAsk } from '@/lib/confirm';
import { useData } from '@/lib/data';
import { invoiceHtml, mailto, thankYou } from '@/lib/documents';
import { addDays, chf, dateCH, parseDate, todayISO } from '@/lib/format';
import { formatIban, isPlaceholderIban } from '@/lib/iban';
import { INVOICE_STATUS, isHoreca, totals, type Invoice } from '@/lib/model';
import { printHtml } from '@/lib/print';
import { buildQrBill } from '@/lib/qrbill';
import { uid } from '@/lib/storage';
import { Badge, Button, Card, DemoBanner, Field, H2, Muted, Notice, Row, Screen, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function InvoiceScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>();
  const { invoices, setInvoices, accounts, company, nextNumber } = useData();
  const router = useRouter();
  const nav = useNavigation();
  const existing = invoices.find((i) => i.id === id);
  const [inv, setInv] = useState<Invoice>(
    existing ?? {
      id: uid('fa_'), number: '', accountId: accountId ?? '', date: todayISO(), dueDate: addDays(todayISO(), company.paymentDays || 30),
      lines: [{ id: uid('l'), description: '', qty: 1, unitPrice: 0 }], vat: { apply: company.vatDefault, rate: company.vatRateDefault }, status: 'draft', notes: '',
    },
  );
  const [dateTxt, setDateTxt] = useState(dateCH(inv.date));
  const [dueTxt, setDueTxt] = useState(dateCH(inv.dueDate));
  const [err, setErr] = useState('');
  const [thanks, setThanks] = useState<string | null>(null);
  useEffect(() => nav.setOptions({ title: inv.number ? `Facture ${inv.number}` : 'Nouvelle facture' }), [nav, inv.number]);
  const acc = accounts.find((a) => a.id === inv.accountId);
  const locked = inv.status === 'paid' || inv.status === 'cancelled';
  const tt = totals(inv.lines, inv.vat);
  const qb = useMemo(() => buildQrBill(company, acc, { ...inv, number: inv.number || 'BROUILLON' }, tt.ttc), [company, acc, inv, tt.ttc]);

  const persist = (patch: Partial<Invoice> = {}): Invoice | null => {
    if (!inv.accountId) return setErr('Choisissez un client.'), null;
    if (!inv.lines.some((l) => l.description.trim() && l.qty > 0)) return setErr('Ajoutez au moins une ligne avec une désignation.'), null;
    const d = parseDate(dateTxt);
    const due = parseDate(dueTxt);
    if (!d || !due) return setErr('Dates invalides (JJ.MM.AAAA).'), null;
    setErr('');
    const rec: Invoice = { ...inv, ...patch, date: d, dueDate: due, number: inv.number || nextNumber('FA'), lines: inv.lines.filter((l) => l.description.trim()) };
    setInvoices((l) => (l.some((x) => x.id === rec.id) ? l.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...l]));
    setInv(rec);
    return rec;
  };
  const print = (r: Invoice | null) => r && void printHtml(invoiceHtml(company, acc, r));
  const send = () => {
    const r = persist({ status: inv.status === 'draft' ? 'sent' : inv.status });
    if (!r) return;
    print(r);
    if (acc?.contact_email) void Linking.openURL(mailto(acc.contact_email, `Facture ${r.number} — Bissabi`, thankYou(acc, 'invoice')));
  };
  const markPaid = () => {
    const r = persist({ status: 'paid', paidAt: todayISO() });
    if (r) setThanks(thankYou(acc, 'paid'));
  };
  const duplicate = () => {
    const copy: Invoice = { ...inv, id: uid('fa_'), number: nextNumber('FA'), date: todayISO(), dueDate: addDays(todayISO(), company.paymentDays || 30), status: 'draft', paidAt: undefined, offerId: undefined, demo: undefined, lines: inv.lines.map((l) => ({ ...l, id: uid('l') })) };
    setInvoices((l) => [copy, ...l]);
    router.replace({ pathname: '/invoice/[id]', params: { id: copy.id } });
  };

  return (
    <Screen>
      {inv.demo ? <DemoBanner text="Facture d’exemple — non réelle." /> : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <H2>{inv.number || 'Brouillon'}</H2>
        <Badge label={INVOICE_STATUS[inv.status]} tone={inv.status === 'paid' ? 'success' : inv.status === 'cancelled' ? 'danger' : inv.status === 'sent' ? 'info' : 'neutral'} />
      </Row>
      {locked ? <Notice tone={inv.status === 'paid' ? 'success' : 'danger'} title={inv.status === 'paid' ? `Payée le ${dateCH(inv.paidAt)}` : 'Facture annulée'} text="Document verrouillé. Dupliquez-la pour en créer une nouvelle." /> : null}
      <AccountPicker value={inv.accountId} onChange={(v) => !locked && setInv({ ...inv, accountId: v })} />
      <Spacer />
      <Row>
        <Field label="Date" value={dateTxt} onChangeText={setDateTxt} editable={!locked} style={{ minWidth: 140 }} />
        <Field label="Échéance" value={dueTxt} onChangeText={setDueTxt} editable={!locked} style={{ minWidth: 140 }} />
      </Row>
      <LinesEditor lines={inv.lines} onLines={(lines) => setInv({ ...inv, lines })} vat={inv.vat} onVat={(vat) => setInv({ ...inv, vat })} editable={!locked} />
      <Spacer />
      <Field label="Remarques (imprimées)" value={inv.notes} onChangeText={(v) => setInv({ ...inv, notes: v })} multiline editable={!locked} />

      <H2>QR-facture suisse</H2>
      <Card>
        <Row style={{ alignItems: 'flex-start', gap: 16 }} wrap>
          <QrPreview payload={qb.payload} specimen={qb.ibanStatus !== 'ok'} size={150} />
          <View style={{ flex: 1, minWidth: 170 }}>
            <Text style={{ color: t.primary, fontWeight: '800' }}>Scannez pour payer (TWINT / e-banking)</Text>
            <Muted style={{ marginTop: 6 }}>Compte : {isPlaceholderIban(company.iban) ? 'YOUR_SWISS_IBAN' : formatIban(company.iban)}</Muted>
            <Muted>Bénéficiaire : {company.name}, {company.street} {company.houseNo}, {company.zip} {company.town}</Muted>
            <Muted>Montant : {chf(tt.ttc)} · Devise CHF</Muted>
            <Muted>Référence ({qb.referenceType}) : {qb.reference}</Muted>
          </View>
        </Row>
        {qb.ibanStatus !== 'ok' ? (
          <Notice tone="warning" title={qb.ibanStatus === 'placeholder' ? 'SPÉCIMEN — IBAN non configuré' : 'SPÉCIMEN — IBAN invalide'} text="Renseignez l’IBAN réel de Bissabi dans Réglages société. Aucun IBAN n’est inventé par l’app." />
        ) : null}
        <Muted style={{ fontSize: 12, marginTop: 6 }}>Sur le PDF, le QR mesure ≈ 3,5 cm, avec récépissé et section paiement.</Muted>
      </Card>
      {err ? <Notice tone="danger" title={err} /> : null}
      <Spacer />
      <Row wrap>
        {!locked ? <Button title="Enregistrer" icon="checkmark" onPress={() => persist() && router.back()} /> : null}
        <Button variant="secondary" icon="print-outline" title="PDF / imprimer" onPress={() => print(locked ? inv : persist())} />
        {!locked ? <Button variant="secondary" icon="paper-plane-outline" title="Envoyer" onPress={send} /> : null}
      </Row>
      <Spacer h={8} />
      <Row wrap>
        {inv.status === 'sent' ? <Button small icon="checkmark-done-outline" title="Marquer payée" onPress={markPaid} /> : null}
        {inv.number ? <Button small variant="ghost" icon="copy-outline" title="Dupliquer" onPress={duplicate} /> : null}
        {inv.status === 'sent' ? <Button small variant="ghost" icon="close-circle-outline" title="Annuler la facture" onPress={() => confirmAsk('Annuler la facture ?', 'Elle restera visible avec le statut « Annulée ».', () => persist({ status: 'cancelled' }))} /> : null}
        {inv.status === 'draft' && existing ? <Button small variant="danger" icon="trash-outline" title="Supprimer le brouillon" onPress={() => confirmAsk('Supprimer ce brouillon ?', inv.number, () => { setInvoices((l) => l.filter((x) => x.id !== inv.id)); router.back(); })} /> : null}
      </Row>
      {thanks || inv.status === 'paid' ? (
        <>
          <Spacer />
          <Card>
            <Text style={{ color: t.primary, fontWeight: '800', marginBottom: 6 }}>Message de remerciement · {acc && isHoreca(acc.type) ? 'HORECA' : 'client'}</Text>
            <Text style={{ color: t.text, lineHeight: 21 }}>{thanks ?? thankYou(acc, 'paid')}</Text>
            {acc?.contact_email ? <Button small variant="secondary" icon="mail-outline" title="Ouvrir dans ma messagerie" style={{ marginTop: 10 }} onPress={() => void Linking.openURL(mailto(acc.contact_email, 'Merci — Bissabi', thanks ?? thankYou(acc, 'paid')))} /> : <Muted style={{ marginTop: 6 }}>Ajoutez un e-mail au compte pour l’envoyer depuis votre messagerie.</Muted>}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
