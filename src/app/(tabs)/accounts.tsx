import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { accountsToCSV } from '@/lib/accountsCsv';
import { useData } from '@/lib/data';
import { downloadText } from '@/lib/download';
import { todayISO } from '@/lib/format';
import { ACCOUNT_TYPES, DELIVERY_CANTON, STAGES, stageLabel, type Stage } from '@/lib/model';
import { Badge, Button, Card, Chip, Divider, Empty, Field, ListItem, Muted, Row, Screen, Spacer } from '@/ui/kit';

export default function Accounts() {
  const { accounts } = useData();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [canton, setCanton] = useState<'all' | 'VD' | 'other'>('all');
  const [type, setType] = useState<string>('all');
  const [stage, setStage] = useState<Stage | 'all'>('all');
  const list = useMemo(
    () =>
      accounts
        .filter((a) => !q || `${a.nom} ${a.ville} ${a.contact_nom}`.toLowerCase().includes(q.toLowerCase()))
        .filter((a) => canton === 'all' || (canton === 'VD' ? a.canton === DELIVERY_CANTON : a.canton !== DELIVERY_CANTON))
        .filter((a) => type === 'all' || (type === 'HORECA' ? a.type === 'HORECA' : a.type !== 'HORECA'))
        .filter((a) => stage === 'all' || a.etape === stage)
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    [accounts, q, canton, type, stage],
  );
  return (
    <Screen>
      <Row wrap>
        <Button small icon="add" title="Nouveau compte" onPress={() => router.push({ pathname: '/account/[id]', params: { id: 'new' } })} />
        <Button small variant="secondary" icon="cloud-upload-outline" title="Importer CSV" onPress={() => router.push('/import')} />
        <Button small variant="ghost" icon="download-outline" title="Exporter" onPress={() => downloadText(`comptes-${todayISO()}.csv`, accountsToCSV(list))} />
      </Row>
      <Spacer />
      <Field label="Rechercher" value={q} onChangeText={setQ} placeholder="Nom, ville, contact…" />
      <Muted>Canton</Muted>
      <Row wrap style={{ marginVertical: 6 }}>
        <Chip label="Tous" active={canton === 'all'} onPress={() => setCanton('all')} />
        <Chip label="Vaud (zone livraison)" active={canton === 'VD'} onPress={() => setCanton('VD')} />
        <Chip label="Hors Vaud" active={canton === 'other'} onPress={() => setCanton('other')} />
      </Row>
      <Muted>Type</Muted>
      <Row wrap style={{ marginVertical: 6 }}>
        <Chip label="Tous" active={type === 'all'} onPress={() => setType('all')} />
        <Chip label="HORECA" active={type === 'HORECA'} onPress={() => setType('HORECA')} />
        <Chip label="Autres" active={type === 'other'} onPress={() => setType('other')} />
      </Row>
      <Muted>Étape</Muted>
      <Row wrap style={{ marginVertical: 6 }}>
        <Chip label="Toutes" active={stage === 'all'} onPress={() => setStage('all')} />
        {STAGES.map((s) => (
          <Chip key={s.key} label={s.label} active={stage === s.key} onPress={() => setStage(s.key)} />
        ))}
      </Row>
      <Spacer />
      <Muted>{list.length} compte(s) · types disponibles : {ACCOUNT_TYPES.join(', ')}</Muted>
      <Spacer h={8} />
      {list.length ? (
        <Card>
          {list.map((a, i) => (
            <ListItemWrap key={a.id} first={i === 0}>
              <ListItem
                icon={a.type === 'HORECA' ? 'restaurant-outline' : 'storefront-outline'}
                title={a.nom}
                subtitle={`${a.ville || '—'} (${a.canton}) · ${a.type} · ${stageLabel(a.etape)}`}
                right={a.demo ? <Badge label="démo" tone="warning" /> : a.canton !== DELIVERY_CANTON ? <Badge label="Hors zone" tone="warning" /> : undefined}
                onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}
              />
            </ListItemWrap>
          ))}
        </Card>
      ) : (
        <Empty icon="business-outline" title="Aucun compte" text="Ajustez les filtres ou créez un compte." />
      )}
    </Screen>
  );
}
function ListItemWrap({ first, children }: { first: boolean; children: ReactNode }) {
  return (
    <>
      {first ? null : <Divider />}
      {children}
    </>
  );
}
