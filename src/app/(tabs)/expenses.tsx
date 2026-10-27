import { useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { Text } from 'react-native';
import { useData } from '@/lib/data';
import { downloadText, toCSV } from '@/lib/download';
import { chf, dateCH, todayISO } from '@/lib/format';
import { EXPENSE_CATEGORIES } from '@/lib/model';
import { inPeriod, PERIODS, type Period } from '@/lib/period';
import { Badge, Button, Card, Chip, Divider, Empty, ListItem, Muted, Row, Screen, Segmented, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function Expenses() {
  const { expenses } = useData();
  const router = useRouter();
  const [p, setP] = useState<Period>('month');
  const [cat, setCat] = useState<string>('all');
  const list = expenses.filter((e) => inPeriod(e.date, p) && (cat === 'all' || e.category === cat)).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, e) => s + e.amountTTC, 0);
  const vat = list.reduce((s, e) => s + (e.vatAmount || 0), 0);
  const exportCsv = () =>
    downloadText(
      `depenses-${todayISO()}.csv`,
      toCSV([['date', 'catégorie', 'fournisseur', 'description', 'montant TTC', 'TVA', 'montant HT', 'pièce jointe'], ...list.map((e) => [e.date, e.category, e.supplier, e.description, e.amountTTC.toFixed(2), (e.vatAmount || 0).toFixed(2), (e.amountTTC - (e.vatAmount || 0)).toFixed(2), e.attachment?.name ?? ''])]),
    );
  return (
    <Screen>
      <Row wrap>
        <Button small icon="add" title="Nouvelle dépense" onPress={() => router.push({ pathname: '/expense/[id]', params: { id: 'new' } })} />
        <Button small variant="ghost" icon="download-outline" title="Exporter CSV" onPress={exportCsv} />
      </Row>
      <Spacer />
      <Segmented options={PERIODS} value={p} onChange={setP} />
      <Row wrap>
        <Chip label="Toutes" active={cat === 'all'} onPress={() => setCat('all')} />
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />
        ))}
      </Row>
      <Spacer />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Total TTC · {list.length} dépense(s)</Muted>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: 18 }}>{chf(total)}</Text>
        </Row>
        <Muted style={{ fontSize: 13 }}>dont TVA déductible saisie : {chf(vat)}</Muted>
      </Card>
      <Spacer />
      {list.length ? (
        <Card>
          {list.map((e, i) => (
            <Fragment key={e.id}>
              {i ? <Divider /> : null}
              <ListItem
                icon={e.attachment ? 'attach-outline' : 'receipt-outline'}
                title={`${e.supplier || e.category} · ${chf(e.amountTTC)}`}
                subtitle={`${dateCH(e.date)} · ${e.category}${e.description ? ' · ' + e.description : ''}`}
                right={e.demo ? <Badge label="démo" tone="warning" /> : undefined}
                onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}
              />
            </Fragment>
          ))}
        </Card>
      ) : (
        <Empty icon="receipt-outline" title="Aucune dépense sur la période" />
      )}
    </Screen>
  );
}
