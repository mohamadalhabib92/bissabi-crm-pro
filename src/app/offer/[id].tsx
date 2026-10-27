import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { AccountPicker } from '@/components/AccountPicker';
import { LinesEditor } from '@/components/LinesEditor';
import { confirmAsk } from '@/lib/confirm';
import { useData } from '@/lib/data';
import { mailto, offerHtml } from '@/lib/documents';
import { addDays, chf, parseDate, dateCH, todayISO } from '@/lib/format';
import { OFFER_STATUS, totals, type Offer } from '@/lib/model';
import { printHtml } from '@/lib/print';
import { uid } from '@/lib/storage';
import { Badge, Button, DemoBanner, Field, H2, Muted, Notice, Row, Screen, Spacer } from '@/ui/kit';

export default function OfferScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>();
  const { offers, setOffers, accounts, company, nextNumber, convertOfferToInvoice } = useData();
  const router = useRouter();
  const nav = useNavigation();
  const existing = offers.find((o) => o.id === id);
  const [o, setO] = useState<Offer>(
    existing ?? {
      id: uid('of_'), number: '', accountId: accountId ?? '', date: todayISO(), validUntil: addDays(todayISO(), 30),
      lines: [{ id: uid('l'), description: '', qty: 1, unitPrice: 0 }], vat: { apply: company.vatDefault, rate: company.vatRateDefault }, status: 'draft', notes: '',
    },
  );
  const [validTxt, setValidTxt] = useState(dateCH(o.validUntil));
  const [err, setErr] = useState('');
  useEffect(() => nav.setOptions({ title: o.number ? `Offre ${o.number}` : 'Nouvelle offre' }), [nav, o.number]);
  const locked = o.status === 'converted';
  const acc = accounts.find((a) => a.id === o.accountId);

  const persist = (patch: Partial<Offer> = {}): Offer | null => {
    if (!o.accountId) return setErr('Choisissez un client.'), null;
    if (!o.lines.some((l) => l.description.trim() && l.qty > 0)) return setErr('Ajoutez au moins une ligne avec une désignation.'), null;
    const v = parseDate(validTxt);
    if (!v) return setErr('Date de validité invalide (JJ.MM.AAAA).'), null;
    setErr('');
    const rec: Offer = { ...o, ...patch, validUntil: v, number: o.number || nextNumber('OF'), lines: o.lines.filter((l) => l.description.trim()) };
    setOffers((l) => (l.some((x) => x.id === rec.id) ? l.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...l]));
    setO(rec);
    return rec;
  };

  const send = () => {
    const rec = persist({ status: o.status === 'draft' ? 'sent' : o.status });
    if (!rec) return;
    void printHtml(offerHtml(company, acc, rec));
    if (acc?.contact_email) void Linking.openURL(mailto(acc.contact_email, `Offre ${rec.number} — Bissabi`, `Bonjour${acc.contact_nom ? ' ' + acc.contact_nom : ''},\n\nVeuillez trouver ci-joint notre offre ${rec.number} d’un montant de ${chf(totals(rec.lines, rec.vat).ttc)}, valable jusqu’au ${dateCH(rec.validUntil)}.\n\nAu plaisir de vous faire découvrir nos boissons botaniques.\n\nBien cordialement,\nBissabi`));
  };

  const duplicate = () => {
    const copy: Offer = { ...o, id: uid('of_'), number: nextNumber('OF'), date: todayISO(), validUntil: addDays(todayISO(), 30), status: 'draft', invoiceId: undefined, demo: undefined, lines: o.lines.map((l) => ({ ...l, id: uid('l') })) };
    setOffers((l) => [copy, ...l]);
    router.replace({ pathname: '/offer/[id]', params: { id: copy.id } });
  };

  return (
    <Screen>
      {o.demo ? <DemoBanner text="Offre d’exemple — non réelle." /> : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <H2>{o.number || 'Brouillon'}</H2>
        <Badge label={OFFER_STATUS[o.status]} tone={o.status === 'refused' ? 'danger' : o.status === 'draft' ? 'neutral' : 'success'} />
      </Row>
      {locked ? <Notice tone="success" title="Offre convertie en facture" text="Les montants sont figés. Dupliquez l’offre pour la modifier." /> : null}
      <AccountPicker value={o.accountId} onChange={(v) => !locked && setO({ ...o, accountId: v })} />
      <Spacer />
      <Field label="Valable jusqu’au" value={validTxt} onChangeText={setValidTxt} editable={!locked} />
      <LinesEditor lines={o.lines} onLines={(lines) => setO({ ...o, lines })} vat={o.vat} onVat={(vat) => setO({ ...o, vat })} editable={!locked} />
      <Spacer />
      <Field label="Remarques (imprimées)" value={o.notes} onChangeText={(v) => setO({ ...o, notes: v })} multiline editable={!locked} />
      {err ? <Notice tone="danger" title={err} /> : null}
      <Row wrap>
        {!locked ? <Button title="Enregistrer" icon="checkmark" onPress={() => persist() && router.back()} /> : null}
        <Button variant="secondary" icon="paper-plane-outline" title="Envoyer (PDF + e-mail)" onPress={send} />
        <Button variant="ghost" icon="print-outline" title="Aperçu PDF" onPress={() => { const r = persist(); if (r) void printHtml(offerHtml(company, acc, r)); }} />
      </Row>
      <Muted style={{ fontSize: 12, marginTop: 6 }}>« Envoyer » ouvre le PDF (à enregistrer) et votre messagerie avec un brouillon : rien n’est envoyé automatiquement.</Muted>
      <Spacer />
      <Row wrap>
        {o.status === 'sent' ? (
          <>
            <Button small variant="secondary" icon="thumbs-up-outline" title="Acceptée" onPress={() => persist({ status: 'accepted' })} />
            <Button small variant="ghost" icon="thumbs-down-outline" title="Refusée" onPress={() => persist({ status: 'refused' })} />
          </>
        ) : null}
        {o.number && !locked ? (
          <Button small icon="swap-horizontal" title="Convertir en facture" onPress={() => { const r = persist(); if (r) { const inv = convertOfferToInvoice(r); router.replace({ pathname: '/invoice/[id]', params: { id: inv } }); } }} />
        ) : null}
        {o.invoiceId ? <Button small variant="secondary" icon="receipt-outline" title="Voir la facture" onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: o.invoiceId! } })} /> : null}
        {o.number ? <Button small variant="ghost" icon="copy-outline" title="Dupliquer" onPress={duplicate} /> : null}
        {existing && !locked ? <Button small variant="danger" icon="trash-outline" title="Supprimer" onPress={() => confirmAsk('Supprimer l’offre ?', o.number, () => { setOffers((l) => l.filter((x) => x.id !== o.id)); router.back(); })} /> : null}
      </Row>
    </Screen>
  );
}
