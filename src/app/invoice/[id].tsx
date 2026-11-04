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
import { INVOICE_STATUS, isHoreca, isOpenStatus, totals, type Invoice } from '@/lib/model';
import { printHtml } from '@/lib/print';
import { buildQrBill } from '@/lib/qrbill';
import { uid } from '@/lib/storage';
import { Badge, Button, Card, DemoBanner, Field, H2, Muted, Notice, Row, Screen, Spacer, useFeedback } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function InvoiceScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>();
  const { invoices, accounts, company, saveInvoice, deleteDraftInvoice, cancelInvoiceWithCredit, creditNotes } = useData();
  const router = useRouter();
  const nav = useNavigation();
  const fb = useFeedback();
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
  const locked = inv.status !== 'draft';
  const credit = creditNotes.find((c) => c.id === inv.creditNoteId);
  const tt = totals(inv.lines, inv.vat);
  const qb = useMemo(() => buildQrBill(company, acc, { ...inv, number: inv.number || 'BROUILLON' }, tt.ttc), [company, acc, inv, tt.ttc]);

  const persist = (patch: Partial<Invoice> = {}): Invoice | null => {
    if (!inv.accountId) return setErr('Choisissez un client.'), null;
    if (!inv.lines.some((l) => l.description.trim() && l.qty > 0)) return setErr('Ajoutez au moins une ligne avec une désignation.'), null;
    const d = parseDate(dateTxt);
    const due = parseDate(dueTxt);
    if (!d || !due) return setErr('Dates invalides (JJ.MM.AAAA).'), null;
    setErr('');
    const rec: Invoice = { ...inv, ...patch, date: d, dueDate: due, lines: inv.lines.filter((l) => l.description.trim()) };
    const saved = saveInvoice(rec);
    setInv(saved);
    return saved;
  };
  const print = (r: Invoice | null) => r && void printHtml(invoiceHtml(company, acc, r));
  const send = () => {
    const r = persist({ status: inv.status === 'draft' || inv.status === 'issued' ? 'sent' : inv.status });
    if (!r) return;
    print(r);
    if (acc?.contact_email) void Linking.openURL(mailto(acc.contact_email, `Facture ${r.number} — Bissabi`, thankYou(acc, 'invoice')));
  };
  const markPaid = () => {
    const r = persist({ status: 'paid', paidAt: todayISO() });
    if (!r) return;
    setThanks(thankYou(acc, 'paid'));
    fb.celebrate({ title: 'Facture payée', subtitle: `${r.number} · ${chf(tt.ttc)}`, icon: 'checkmark-done', tone: 'gold' });
  };
  const duplicate = () => {
    const copy: Invoice = {
      ...inv, id: uid('fa_'), number: '', date: todayISO(), dueDate: addDays(todayISO(), company.paymentDays || 30),
      status: 'draft', paidAt: undefined, issuedAt: undefined, creditNoteId: undefined, offerId: undefined,
      demo: inv.demo === true ? true : undefined, lines: inv.lines.map((l) => ({ ...l, id: uid('l') })),
    };
    saveInvoice(copy);
    router.replace({ pathname: '/invoice/[id]', params: { id: copy.id } });
  };
  const cancel = () => confirmAsk('Annuler par un avoir ?', 'La facture reste conservée, avec le statut « Annulée ». Un avoir est créé. Le numéro n’est pas réutilisé.', () => {
    const creditId = cancelInvoiceWithCredit(inv.id);
    if (!creditId) return;
    setInv((prev) => ({ ...prev, status: 'cancelled', creditNoteId: creditId }));
    router.push({ pathname: '/credit/[id]', params: { id: creditId } });
  });

  return (
    <Screen>
      {inv.demo ? <DemoBanner text="Facture d’exemple — non réelle." /> : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <H2>{inv.number || 'Brouillon'}</H2>
        <Badge label={isOpenStatus(inv.status) && inv.dueDate < todayISO() ? 'En retard' : INVOICE_STATUS[inv.status]} tone={inv.status === 'paid' ? 'success' : inv.status === 'cancelled' ? 'danger' : inv.status === 'partial' ? 'warning' : isOpenStatus(inv.status) ? 'info' : 'neutral'} />
      </Row>
      {locked ? <Notice tone={inv.status === 'paid' ? 'success' : inv.status === 'cancelled' ? 'danger' : 'info'} title={inv.status === 'paid' ? `Payée le ${dateCH(inv.paidAt)}` : inv.status === 'cancelled' ? `Annulée${credit ? ` · avoir ${credit.number}` : ''}` : 'Facture émise'} text="Le numéro et le contenu sont figés. Une correction passe par un avoir, puis une nouvelle facture." /> : null}
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
        <Muted style={{ fontSize: 12, marginTop: 6 }}>Sur le PDF, le QR mesure 46 × 46 mm (croix 7 × 7 mm), avec récépissé 62 mm et section paiement 148 mm. L’aperçu écran est plus petit.</Muted>
      </Card>
      {err ? <Notice tone="danger" title={err} /> : null}
      <Spacer />
      <Row wrap>
        {!locked ? <Button title="Enregistrer le brouillon" icon="checkmark" onPress={() => {
              if (!persist()) return;
              fb.toast('Brouillon enregistré');
              router.back();
            }} /> : null}
        {!locked ? <Button variant="secondary" icon="checkmark-circle-outline" title="Émettre" onPress={() => { const r = persist({ status: 'issued' }); if (r) setInv(r); }} /> : null}
        <Button variant="secondary" icon="print-outline" title="PDF / imprimer" onPress={() => print(locked ? inv : persist())} />
        {!locked ? <Button variant="secondary" icon="paper-plane-outline" title="Envoyer" onPress={send} /> : null}
      </Row>
      <Spacer h={8} />
      <Row wrap>
        {isOpenStatus(inv.status) ? <Button small icon="checkmark-done-outline" title="Marquer payée" onPress={markPaid} /> : null}
        <Button small variant="ghost" icon="copy-outline" title="Dupliquer" onPress={duplicate} />
        {inv.status !== 'draft' && inv.status !== 'cancelled' ? <Button small variant="ghost" icon="close-circle-outline" title="Annuler par un avoir" onPress={cancel} /> : null}
        {credit ? <Button small variant="secondary" icon="receipt-outline" title={`Avoir ${credit.number}`} onPress={() => router.push({ pathname: '/credit/[id]', params: { id: credit.id } })} /> : null}
        {inv.status === 'draft' && existing ? <Button small variant="danger" icon="trash-outline" title="Supprimer le brouillon" onPress={() => confirmAsk('Supprimer ce brouillon ?', inv.number ? `${inv.number} — ce numéro ne sera pas réutilisé.` : 'Brouillon sans numéro.', () => { if (deleteDraftInvoice(inv.id)) router.back(); })} /> : null}
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
