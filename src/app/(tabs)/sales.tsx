import { useRouter } from 'expo-router';
import { Fragment as Frag, useState } from 'react';
import { Text } from 'react-native';
import { useData } from '@/lib/data';
import { downloadText } from '@/lib/download';
import { chf, dateCH, todayISO } from '@/lib/format';
import { INVOICE_STATUS, OFFER_STATUS, isOpenStatus, totals, type InvoiceStatus, type OfferStatus } from '@/lib/model';
import { vatCSV } from '@/lib/vatExport';
import { Badge, Button, Card, Divider, Empty, H2, ListItem, Row, Screen, Segmented, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

const OT: Record<OfferStatus, 'neutral' | 'info' | 'success' | 'danger'> = { draft: 'neutral', sent: 'info', accepted: 'success', refused: 'danger', converted: 'success' };
const IT: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { draft: 'neutral', issued: 'info', sent: 'info', partial: 'warning', paid: 'success', cancelled: 'danger' };

export default function Sales() {
  const { offers, invoices, accounts, creditNotes } = useData();
  const router = useRouter();
  const [tab, setTab] = useState<'offers' | 'invoices'>('invoices');
  const name = (id: string) => accounts.find((a) => a.id === id)?.nom ?? 'Client supprimé';
  return (
    <Screen>
      <Segmented options={[{ label: `Factures (${invoices.length})`, value: 'invoices' as const }, { label: `Offres (${offers.length})`, value: 'offers' as const }]} value={tab} onChange={setTab} />
      <Row wrap>
        {tab === 'offers' ? (
          <Button small icon="add" title="Nouvelle offre" onPress={() => router.push({ pathname: '/offer/[id]', params: { id: 'new' } })} />
        ) : (
          <>
            <Button small icon="add" title="Nouvelle facture" onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: 'new' } })} />
            <Button small variant="ghost" icon="download-outline" title="CSV TVA" onPress={() => downloadText(`tva-${todayISO()}.csv`, vatCSV(invoices, accounts))} />
          </>
        )}
      </Row>
      <Spacer />
      {tab === 'offers' ? (
        offers.length ? (
          <Card>
            {offers.map((o, i) => (
              <Frag key={o.id}>
                {i ? <Divider /> : null}
                <ListItem title={`${o.number} · ${name(o.accountId)}`} subtitle={`${dateCH(o.date)} · ${chf(totals(o.lines, o.vat).ttc)}${o.demo ? ' · démo' : ''}`} right={<Badge label={OFFER_STATUS[o.status]} tone={OT[o.status]} />} onPress={() => router.push({ pathname: '/offer/[id]', params: { id: o.id } })} />
              </Frag>
            ))}
          </Card>
        ) : (
          <Empty icon="document-outline" title="Aucune offre" text="Créez une offre puis convertissez-la en facture." />
        )
      ) : invoices.length ? (
        <Card>
          {invoices.map((inv, i) => (
            <Frag key={inv.id}>
              {i ? <Divider /> : null}
              <ListItem
                title={`${inv.number} · ${name(inv.accountId)}`}
                subtitle={`${dateCH(inv.date)} · ${chf(totals(inv.lines, inv.vat).ttc)} · ${inv.vat.apply ? `TVA ${inv.vat.rate} %` : 'TVA non applicable'}${inv.demo ? ' · démo' : ''}`}
                right={<Badge label={isOpenStatus(inv.status) && inv.dueDate < todayISO() ? 'En retard' : INVOICE_STATUS[inv.status]} tone={isOpenStatus(inv.status) && inv.dueDate < todayISO() ? 'danger' : IT[inv.status]} />}
                onPress={() => router.push({ pathname: '/invoice/[id]', params: { id: inv.id } })}
              />
            </Frag>
          ))}
        </Card>
      ) : (
        <Empty icon="receipt-outline" title="Aucune facture" />
      )}
      {tab === 'invoices' && creditNotes.length ? (
        <>
          <Spacer />
          <H2>Avoirs</H2>
          <Card>
            {creditNotes.map((c, i) => (
              <Frag key={c.id}>
                {i ? <Divider /> : null}
                <ListItem title={`${c.number} · ${name(c.accountId)}`} subtitle={`Annule ${c.invoiceNumber} · ${dateCH(c.date)}${c.demo ? ' · démo' : ''}`} onPress={() => router.push({ pathname: '/credit/[id]', params: { id: c.id } })} />
              </Frag>
            ))}
          </Card>
        </>
      ) : null}
      <Spacer />
      <Text style={{ color: t.muted, fontSize: 12 }}>Les numéros déjà enregistrés sont conservés. Une nouvelle facture reçoit le suivant à l’émission (FA-AAAA-NNNN, ou AAAA-NNNN si c’est déjà le format de l’année). Un avoir annule une facture émise sans réutiliser son numéro.</Text>
    </Screen>
  );
}
