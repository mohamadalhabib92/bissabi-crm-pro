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
import { canCredit, canDeleteInvoice, displayStatus } from '@/lib/invoices';
import { isHoreca, totals, type Invoice } from '@/lib/model';
import { printHtml } from '@/lib/print';
import { buildQrBill } from '@/lib/qrbill';
import { uid } from '@/lib/storage';
import { Badge, Button, Card, DemoBanner, Field, H2, Muted, Notice, Row, Screen, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function InvoiceScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>();
  const { invoices, setInvoices, accounts, company, audit, saveInvoice, issueInvoice, markInvoiceSent, markInvoicePaid, createCreditNote, deleteInvoice } = useData();
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
  const locked = inv.status !== 'draft';
  const credit = inv.kind === 'credit';
  const tt = totals(inv.lines, inv.vat);
  const qb = useMemo(() => buildQrBill(company, acc, { ...inv, number: inv.number || 'BROUILLON' }, tt.ttc), [company, acc, inv, tt.ttc]);

  const persist = (patch: Partial<Invoice> = {}): Invoice | null => {
    if (!inv.accountId) return setErr('Choisissez un client.'), null;
    if (!inv.lines.some((l) => l.description.trim() && l.qty > 0)) return setErr('Ajoutez au moins une ligne avec une désignation.'), null;
    const d = parseDate(dateTxt);
    const due = parseDate(dueTxt);
    if (!d || !due) return setErr('Dates invalides (JJ.MM.AAAA).'), null;
    setErr('');
    const rec: Invoice = { ...inv, ...patch, date: d, dueDate: due, number: inv.number, lines: inv.lines.filter((l) => l.description.trim()) };
    if (locked) return rec;
    const saved = saveInvoice(rec);
    setInv(saved);
    return saved;
  };
  const print = (r: Invoice | null) => r && void printHtml(invoiceHtml(company, acc, r));
  const issue = () => {
    const draft = persist();
    if (!draft) return;
    if (draft.status !== 'draft') {
      setInv(draft);
      return;
    }
    setInv(issueInvoice(draft));
  };
  const send = () => {
    const draft = inv.status === 'draft' ? persist() : inv;
    if (!draft) return;
    const sent = markInvoiceSent(draft);
    setInv(sent);
    print(sent);
    if (acc?.contact_email) void Linking.openURL(mailto(acc.contact_email, `${sent.kind === 'credit' ? 'Avoir' : 'Facture'} ${sent.number} — Bissabi`, thankYou(acc, 'invoice')));
  };
  const markPaid = () => {
    const r = markInvoicePaid(inv);
    setInv(r);
    if (r.status === 'paid') setThanks(thankYou(acc, 'paid'));
  };
  const creditNote = () => {
    confirmAsk('Créer un avoir ?', `La facture ${inv.number} sera annulée et conservée. Un avoir est émis. Pour corriger, dupliquez ensuite en nouvelle facture.`, () => {
      const note = createCreditNote(inv);
      if (note) router.replace({ pathname: '/invoice/[id]', params: { id: note.id } });
    });
  };
  const duplicate = () => {
    const copy: Invoice = {
      ...inv, id: uid('fa_'), number: '', date: todayISO(), dueDate: addDays(todayISO(), company.paymentDays || 30),
      status: 'draft', paidAt: undefined, offerId: undefined, kind: undefined, relatedId: undefined, creditedBy: undefined, issuedAt: undefined,
      demo: inv.demo === true ? true : undefined, lines: inv.lines.map((l) => ({ ...l, id: uid('l') })),
    };
    setInvoices((l) => [copy, ...l]);
    router.replace({ pathname: '/invoice/[id]', params: { id: copy.id } });
  };
  const history = audit.filter((e) => e.entityId === inv.id).slice().reverse();

  return (
    <Screen>
      {inv.demo ? <DemoBanner text="Facture d’exemple — non réelle." /> : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <H2>{inv.number || 'Brouillon'}</H2>
        <Badge label={displayStatus(inv)} tone={inv.status === 'paid' ? 'success' : inv.status === 'cancelled' ? 'danger' : inv.status === 'sent' || inv.status === 'issued' ? 'info' : 'neutral'} />
      </Row>
      {locked ? <Notice tone={inv.status === 'paid' ? 'success' : inv.status === 'cancelled' ? 'danger' : 'info'} title={inv.status === 'paid' ? `Payée le ${dateCH(inv.paidAt)}` : inv.status === 'cancelled' ? 'Facture annulée par avoir' : credit ? 'Avoir émis' : 'Facture émise'} text="Le numéro est figé. Une correction se fait par avoir, puis par une nouvelle facture. Le brouillon seul peut être supprimé." /> : <Muted>Le numéro est attribué à l’émission, à la suite du dernier numéro existant.</Muted>}
      <AccountPicker value={inv.accountId} onChange={(v) => !locked && setInv({ ...inv, accountId: v })} />
      <Spacer />
      <Row>
        <Field label="Date" value={dateTxt} onChangeText={setDateTxt} editable={!locked} style={{ minWidth: 140 }} />
        <Field label="Échéance" value={dueTxt} onChangeText={setDueTxt} editable={!locked} style={{ minWidth: 140 }} />
      </Row>
      <LinesEditor lines={inv.lines} onLines={(lines) => setInv({ ...inv, lines })} vat={inv.vat} onVat={(vat) => setInv({ ...inv, vat })} editable={!locked} />
      <Spacer />
      <Field label="Remarques (imprimées)" value={inv.notes} onChangeText={(v) => setInv({ ...inv, notes: v })} multiline editable={!locked} />

      {credit ? (
        <Notice tone="info" title="Avoir" text="Pas de QR-facture : ce document ne se paie pas." />
      ) : (
        <>
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
            <Muted style={{ fontSize: 12, marginTop: 6 }}>Sur le PDF, le QR mesure 46×46 mm, avec récépissé 62 mm et section paiement 148 mm. Le libellé TWINT est au-dessus de la section.</Muted>
          </Card>
        </>
      )}
      {err ? <Notice tone="danger" title={err} /> : null}
      <Spacer />
      <Row wrap>
        {!locked ? <Button title="Enregistrer" icon="checkmark" onPress={() => persist() && router.back()} /> : null}
        {!locked ? <Button variant="secondary" icon="lock-closed-outline" title="Émettre" onPress={issue} /> : null}
        <Button variant="secondary" icon="print-outline" title="PDF / imprimer" onPress={() => print(locked ? inv : persist())} />
        {!credit ? <Button variant="secondary" icon="paper-plane-outline" title="Envoyer" onPress={send} /> : null}
      </Row>
      <Spacer h={8} />
      <Row wrap>
        {inv.status === 'sent' || inv.status === 'issued' || inv.status === 'partial' ? <Button small icon="checkmark-done-outline" title="Marquer payée" onPress={markPaid} /> : null}
        <Button small variant="ghost" icon="copy-outline" title="Dupliquer" onPress={duplicate} />
        {canCredit(inv) ? <Button small variant="ghost" icon="return-down-back-outline" title="Créer un avoir" onPress={creditNote} /> : null}
        {canDeleteInvoice(inv) && existing ? <Button small variant="danger" icon="trash-outline" title="Supprimer le brouillon" onPress={() => confirmAsk('Supprimer ce brouillon ?', 'Aucune facture émise n’est effacée.', () => { if (deleteInvoice(inv.id)) router.back(); })} /> : null}
      </Row>
      {history.length ? (
        <>
          <Spacer />
          <H2>Journal</H2>
          <Card>
            {history.map((e) => <Muted key={e.id}>{dateCH(e.at)} · {e.detail}</Muted>)}
          </Card>
        </>
      ) : null}
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
