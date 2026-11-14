import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { createCampaign, loadCampaigns } from '@/lib/telephonie/api';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Badge, Button, Field, ListItem, Muted, Notice, Spacer } from '@/ui/kit';

export default function CampaignsScreen() {
  const tel = useTelephony();
  const router = useRouter();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadCampaigns>>>([]);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('RDV dégustation');
  const [secteur, setSecteur] = useState('');
  const [ville, setVille] = useState('');
  const [statut, setStatut] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    if (!tel.client || !tel.ownerId) return;
    loadCampaigns(tel.client, tel.ownerId).then(setRows).catch((err: Error) => setError(err.message));
  };
  useEffect(refresh, [tel.client, tel.ownerId]);

  return (
    <TelScreen title={tel.t('campaigns')}>
      {error ? <Notice tone="danger" title="Campagnes" text={error} /> : null}
      <Field label="Nom" value={name} onChangeText={setName} />
      <Field label="Objectif" value={goal} onChangeText={setGoal} />
      <Field label="Secteur" value={secteur} onChangeText={setSecteur} hint="restaurant, cafe, epicerie… vide = tous" />
      <Field label="Ville" value={ville} onChangeText={setVille} />
      <Field label="Statut pipeline" value={statut} onChangeText={setStatut} hint="prospect, contacte, client_actif…" />
      <Button title={tel.t('create')} onPress={() => {
        if (!tel.client || !tel.ownerId || !name.trim()) return;
        createCampaign(tel.client, tel.ownerId, { name: name.trim(), goal, secteur, ville, statut })
          .then((id) => router.push({ pathname: '/telephonie/campagne/[id]', params: { id } }))
          .catch((err: Error) => setError(err.message));
      }} />
      <Spacer />
      {rows.map((row) => (
        <ListItem
          key={row.id}
          icon="megaphone-outline"
          title={row.name}
          subtitle={row.goal ?? ''}
          right={<Badge label={row.status} tone={row.status === 'active' ? 'success' : 'neutral'} />}
          onPress={() => router.push({ pathname: '/telephonie/campagne/[id]', params: { id: row.id } })}
        />
      ))}
      {!rows.length ? <Muted>{tel.t('empty')}</Muted> : null}
    </TelScreen>
  );
}
