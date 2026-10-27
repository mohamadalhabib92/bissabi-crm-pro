import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { useData } from '@/lib/data';
import { downloadText } from '@/lib/download';
import { chf, dateCH, todayISO } from '@/lib/format';
import { isPlaceholderIban } from '@/lib/iban';
import { stageLabel, totals } from '@/lib/model';
import { inPeriod, PERIODS, type Period } from '@/lib/period';
import { vatCSV } from '@/lib/vatExport';
import { Badge, Button, Card, DemoBanner, Divider, Eyebrow, H1, H2, ListItem, Muted, Notice, Row, Screen, Segmented, Spacer, Stat } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function Dashboard() {
  const { invoices, expenses, accounts, company, hasDemo, removeDemo } = useData();
  const router = useRouter();
  const [p, setP] = useState<Period>('month');
  const k = useMemo(() => {
    const issued = invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled');
    const inP = issued.filter((i) => inPeriod(i.date, p));
    const ca = inP.reduce((s, i) => s + totals(i.lines, i.vat).ht, 0);
    const cash = issued.filter((i) => i.status === 'paid' && inPeriod(i.paidAt, p)).reduce((s, i) => s + totals(i.lines, i.vat).ttc, 0);
    const open = inP.filter((i) => i.status === 'sent').reduce((s, i) => s + totals(i.lines, i.vat).ttc, 0);
    const exp = expenses.filter((e) => inPeriod(e.date, p));
    const expTTC = exp.reduce((s, e) => s + e.amountTTC, 0);
    const expHT = exp.reduce((s, e) => s + e.amountTTC - (e.vatAmount || 0), 0);
    const vat = new Map<number, { base: number; tva: number }>();
    inP.filter((i) => i.vat.apply).forEach((i) => {
      const tt = totals(i.lines, i.vat);
      const cur = vat.get(i.vat.rate) ?? { base: 0, tva: 0 };
      vat.set(i.vat.rate, { base: cur.base + tt.ht, tva: cur.tva + tt.tva });
    });
    const overdue = issued.filter((i) => i.status === 'sent' && i.dueDate < todayISO());
    return { ca, cash, open, expTTC, margin: ca - expHT, vat: [...vat.entries()].sort((a, b) => b[0] - a[0]), overdue, count: inP.length, noVat: inP.filter((i) => !i.vat.apply).length };
  }, [invoices, expenses, p]);
  const actions = accounts.filter((a) => a.prochaine_action && a.prochaine_action_date).sort((a, b) => a.prochaine_action_date.localeCompare(b.prochaine_action_date)).slice(0, 5);

  return (
    <Screen>
      {hasDemo ? (
        <>
          <DemoBanner text="Données d’exemple affichées (marquées « démo »). Elles ne sont pas réelles." />
          <Button small variant="ghost" title="Supprimer les données d’exemple" onPress={removeDemo} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
          <Spacer />
        </>
      ) : null}
      <Eyebrow>{company.name}</Eyebrow>
      <H1>Tableau de bord</H1>
      {isPlaceholderIban(company.iban) ? (
        <Notice tone="warning" title="IBAN non configuré" text="Les QR-factures sont générées en SPÉCIMEN (YOUR_SWISS_IBAN). Renseignez l’IBAN dans Réglages société." icon="qr-code-outline" />
      ) : null}
      <Spacer />
      <Segmented options={PERIODS} value={p} onChange={setP} />
      <Row wrap gap={10}>
        <Stat label="Chiffre d’affaires HT" value={chf(k.ca)} sub={`${k.count} facture(s) émise(s)`} />
        <Stat label="Encaissements" value={chf(k.cash)} sub="Factures payées (TTC)" />
      </Row>
      <Spacer h={10} />
      <Row wrap gap={10}>
        <Stat label="Ouvert" value={chf(k.open)} sub="Envoyé, non payé" />
        <Stat label="Dépenses" value={chf(k.expTTC)} sub="TTC sur la période" />
      </Row>
      <Spacer h={10} />
      <Row wrap gap={10}>
        <Stat label="Marge simple" value={chf(k.margin)} sub="CA HT − dépenses HT" />
      </Row>
      <Spacer h={20} />
      <H2>TVA collectée</H2>
      <Card>
        {k.vat.length ? (
          k.vat.map(([rate, v]) => (
            <Row key={rate} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ color: t.text }}>Taux {rate.toFixed(1)} % · base {chf(v.base)}</Text>
              <Text style={{ color: t.text, fontWeight: '700' }}>{chf(v.tva)}</Text>
            </Row>
          ))
        ) : (
          <Muted>Aucune facture avec TVA sur la période.</Muted>
        )}
        {k.noVat ? <Muted style={{ marginTop: 6 }}>{k.noVat} facture(s) « TVA non applicable ».</Muted> : null}
        <Divider />
        <Button small variant="secondary" icon="download-outline" title="Exporter le CSV TVA" onPress={() => downloadText(`tva-${todayISO()}.csv`, vatCSV(invoices.filter((i) => inPeriod(i.date, p)), accounts))} />
      </Card>
      <Spacer h={20} />
      <H2>À relancer</H2>
      <Card>
        {k.overdue.length ? (
          k.overdue.map((i) => (
            <ListItem key={i.id} icon="alert-circle-outline" title={`${i.number} · ${accounts.find((a) => a.id === i.accountId)?.nom ?? '—'}`} subtitle={`Échue le ${dateCH(i.dueDate)} · ${chf(totals(i.lines, i.vat).ttc)}`} onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: i.id } })} />
          ))
        ) : (
          <Muted>Aucune facture en retard.</Muted>
        )}
      </Card>
      <Spacer h={20} />
      <H2>Prochaines actions commerciales</H2>
      <Card>
        {actions.length ? (
          actions.map((a) => (
            <ListItem key={a.id} icon="calendar-outline" title={`${a.prochaine_action} — ${a.nom}`} subtitle={`${dateCH(a.prochaine_action_date)} · ${stageLabel(a.etape)}`} right={a.prochaine_action_date < todayISO() ? <Badge label="En retard" tone="danger" /> : undefined} onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })} />
          ))
        ) : (
          <Muted>Aucune action planifiée.</Muted>
        )}
      </Card>
    </Screen>
  );
}
