import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { confirmAsk } from '@/lib/confirm';
import { useData } from '@/lib/data';
import { chf, dateCH, parseDate } from '@/lib/format';
import { ACCOUNT_TYPES, CANTONS, DELIVERY_CANTON, INVOICE_STATUS, LOGISTICS, OFFER_STATUS, OUT_OF_ZONE, STAGES, totals, type Account } from '@/lib/model';
import { uid } from '@/lib/storage';
import { Badge, Button, Card, Chip, DemoBanner, Divider, Field, H2, ListItem, Muted, Notice, Row, Screen, Spacer, Toggle } from '@/ui/kit';

const EMPTY: Omit<Account, 'id' | 'createdAt'> = {
  nom: '', type: 'HORECA', etape: 'prospect', canton: 'VD', ville: '', adresse: '', npa: '', livraison_ok: true, mode_logistique: 'Livraison Bissabi',
  contact_nom: '', contact_role: '', contact_email: '', contact_tel: '', prochaine_action: '', prochaine_action_date: '', notes: '', source: '',
};

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, setAccounts, offers, invoices } = useData();
  const router = useRouter();
  const nav = useNavigation();
  const existing = accounts.find((a) => a.id === id);
  const [f, setF] = useState<Account>(existing ?? { ...EMPTY, id: uid('acc_'), createdAt: new Date().toISOString() });
  const [dateTxt, setDateTxt] = useState(f.prochaine_action_date ? dateCH(f.prochaine_action_date) : '');
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => nav.setOptions({ title: existing ? existing.nom : 'Nouveau compte' }), [nav, existing]);
  const set = (p: Partial<Account>) => setF((x) => ({ ...x, ...p }));
  const outOfZone = f.canton !== DELIVERY_CANTON;

  const save = () => {
    const e: Record<string, string> = {};
    if (!f.nom.trim()) e.nom = 'Nom obligatoire';
    if (f.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contact_email)) e.email = 'E-mail invalide';
    const d = dateTxt.trim() ? parseDate(dateTxt) : '';
    if (dateTxt.trim() && !d) e.date = 'Date invalide (JJ.MM.AAAA)';
    setErr(e);
    if (Object.keys(e).length) return;
    const rec = { ...f, nom: f.nom.trim(), prochaine_action_date: d || '' };
    setAccounts((l) => (l.some((a) => a.id === rec.id) ? l.map((a) => (a.id === rec.id ? rec : a)) : [rec, ...l]));
    router.back();
  };

  const hist = [
    ...offers.filter((o) => o.accountId === f.id).map((o) => ({ k: o.id, title: `Offre ${o.number}`, sub: `${dateCH(o.date)} · ${chf(totals(o.lines, o.vat).ttc)} · ${OFFER_STATUS[o.status]}`, go: () => router.push({ pathname: '/offer/[id]', params: { id: o.id } }) })),
    ...invoices.filter((i) => i.accountId === f.id).map((i) => ({ k: i.id, title: `Facture ${i.number}`, sub: `${dateCH(i.date)} · ${chf(totals(i.lines, i.vat).ttc)} · ${INVOICE_STATUS[i.status]}`, go: () => router.push({ pathname: '/invoice/[id]', params: { id: i.id } }) })),
  ];

  return (
    <Screen>
      {f.demo ? <DemoBanner text="Compte d’exemple — non réel." /> : null}
      <H2>Entreprise</H2>
      <Field label="Nom *" value={f.nom} onChangeText={(v) => set({ nom: v })} error={err.nom} />
      <Muted>Type</Muted>
      <Row wrap style={{ marginVertical: 6 }}>
        {ACCOUNT_TYPES.map((t) => (
          <Chip key={t} label={t} active={f.type === t} onPress={() => set({ type: t })} />
        ))}
      </Row>
      <Field label="Adresse (rue et n°)" value={f.adresse} onChangeText={(v) => set({ adresse: v })} hint="Utilisée comme « Payable par » sur la QR-facture" />
      <Row>
        <Field label="NPA" value={f.npa} onChangeText={(v) => set({ npa: v })} style={{ width: 100 }} keyboardType="number-pad" />
        <Field label="Ville" value={f.ville} onChangeText={(v) => set({ ville: v })} style={{ minWidth: 180 }} />
      </Row>
      <Muted>Canton</Muted>
      <Row wrap style={{ marginVertical: 6 }}>
        {CANTONS.map((c) => (
          <Chip key={c.code} label={c.code} active={f.canton === c.code} onPress={() => set({ canton: c.code, livraison_ok: c.code === DELIVERY_CANTON ? f.livraison_ok : false })} />
        ))}
      </Row>
      {outOfZone ? <Notice tone="warning" title="Hors zone livraison actuelle" text={`${OUT_OF_ZONE}. La prospection reste possible ; livraison désactivée par défaut.`} /> : null}
      <Toggle label="Livraison possible" value={f.livraison_ok} onChange={(v) => set({ livraison_ok: v })} hint={outOfZone && f.livraison_ok ? '⚠ Activé manuellement hors Vaud' : 'Livraison offerte dès CHF 36 (Vaud)'} />
      <Muted>Mode logistique</Muted>
      <Row wrap style={{ marginVertical: 6 }}>
        {LOGISTICS.map((m) => (
          <Chip key={m} label={m} active={f.mode_logistique === m} onPress={() => set({ mode_logistique: m })} />
        ))}
      </Row>
      <Spacer />
      <H2>Pipeline</H2>
      <Row wrap>
        {STAGES.map((s, i) => (
          <Chip key={s.key} label={`${i + 1}. ${s.label}`} active={f.etape === s.key} onPress={() => set({ etape: s.key })} />
        ))}
      </Row>
      <Spacer />
      <Field label="Prochaine action" value={f.prochaine_action} onChangeText={(v) => set({ prochaine_action: v })} />
      <Field label="Date prochaine action" value={dateTxt} onChangeText={setDateTxt} placeholder="JJ.MM.AAAA" error={err.date} />
      <Spacer />
      <H2>Contact</H2>
      <Field label="Nom du contact" value={f.contact_nom} onChangeText={(v) => set({ contact_nom: v })} />
      <Field label="Rôle" value={f.contact_role} onChangeText={(v) => set({ contact_role: v })} />
      <Field label="E-mail" value={f.contact_email} onChangeText={(v) => set({ contact_email: v })} keyboardType="email-address" autoCapitalize="none" error={err.email} />
      <Field label="Téléphone" value={f.contact_tel} onChangeText={(v) => set({ contact_tel: v })} keyboardType="phone-pad" />
      <Field label="Source" value={f.source} onChangeText={(v) => set({ source: v })} placeholder="Salon, recommandation, Instagram…" />
      <Field label="Notes" value={f.notes} onChangeText={(v) => set({ notes: v })} multiline />
      <Button title="Enregistrer" icon="checkmark" onPress={save} />
      {existing ? (
        <>
          <Spacer />
          <Row wrap>
            <Button small variant="secondary" icon="document-outline" title="Nouvelle offre" onPress={() => router.push({ pathname: '/offer/[id]', params: { id: 'new', accountId: f.id } })} />
            <Button small variant="secondary" icon="receipt-outline" title="Nouvelle facture" onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: 'new', accountId: f.id } })} />
          </Row>
          <Spacer h={20} />
          <H2>Historique offres / factures</H2>
          <Card>
            {hist.length ? hist.map((h, i) => (
              <Fragment key={h.k}>
                {i ? <Divider /> : null}
                <ListItem title={h.title} subtitle={h.sub} onPress={h.go} />
              </Fragment>
            )) : <Muted>Aucun document.</Muted>}
          </Card>
          <Spacer h={20} />
          <Button
            variant="danger"
            icon="trash-outline"
            title="Supprimer le compte"
            onPress={() => confirmAsk('Supprimer ce compte ?', 'Les documents liés sont conservés.', () => { setAccounts((l) => l.filter((a) => a.id !== f.id)); router.back(); })}
          />
        </>
      ) : null}
      {existing && outOfZone ? <Badge label="Hors zone" tone="warning" /> : null}
    </Screen>
  );
}
