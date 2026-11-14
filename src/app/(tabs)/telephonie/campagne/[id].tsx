import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { CAMPAIGN_TEMPLATE, parseCampaignCsv } from '@/lib/telephonie/csv';
import { importCampaignRows, loadPublishedVersions, saveVariant, setCampaignStatus } from '@/lib/telephonie/api';
import { downloadText } from '@/lib/download';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Button, Card, Field, Muted, Notice, Row, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tel = useTelephony();
  const [csv, setCsv] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weightA, setWeightA] = useState('50');
  const [weightB, setWeightB] = useState('50');
  const [versionA, setVersionA] = useState('');
  const [versionB, setVersionB] = useState('');
  const [versions, setVersions] = useState<{ id: string; version: number }[]>([]);

  useEffect(() => {
    if (!tel.client || !tel.ownerId) return;
    loadPublishedVersions(tel.client, tel.ownerId).then((rows) => setVersions(rows as { id: string; version: number }[])).catch((err: Error) => setError(err.message));
  }, [tel.client, tel.ownerId]);

  const runImport = async (text: string) => {
    if (!tel.client || !tel.ownerId || !id) return;
    const parsed = parseCampaignCsv(text);
    if (parsed.headerError) return setError(parsed.headerError);
    if (parsed.errors.length) setError(parsed.errors.map((e) => `Ligne ${e.line} : ${e.message}`).join('\n'));
    const result = await importCampaignRows(tel.client, tel.ownerId, id, parsed.rows);
    setReport(`${result.inserted} numéro(s) en file. ${result.excluded.length} exclu(s) par la conformité.${result.excluded.slice(0, 8).map((e) => `\n${e.nom} : ${e.reason}`).join('')}`);
  };

  return (
    <TelScreen title="Campagne">
      {error ? <Notice tone="danger" title="Import" text={error} /> : null}
      {report ? <Notice tone="info" title="Contrôle de conformité" text={report} /> : null}
      <Row wrap>
        <Button title={tel.t('resume')} onPress={() => tel.client && id && setCampaignStatus(tel.client, id, 'active').catch((err: Error) => setError(err.message))} />
        <Button variant="secondary" title={tel.t('pause')} onPress={() => tel.client && id && setCampaignStatus(tel.client, id, 'en_pause').catch((err: Error) => setError(err.message))} />
      </Row>
      <Spacer />
      <Muted>CSV « ; » : nom;telephone;secteur;ville;statut;canton. Chaque ligne passe par tel_check_outbound avant d’entrer dans la file.</Muted>
      <Spacer />
      <Row wrap>
        <Button variant="secondary" title="Modèle" onPress={() => downloadText('campagne-telephonie.csv', CAMPAIGN_TEMPLATE)} />
        <Button variant="secondary" title="Fichier" onPress={async () => {
          const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', '*/*'], copyToCacheDirectory: true });
          if (picked.canceled || !picked.assets?.[0]) return;
          const asset = picked.assets[0];
          const text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
          setCsv(text);
        }} />
      </Row>
      <Field label="CSV" value={csv} onChangeText={setCsv} multiline />
      <Button title={tel.t('importCsv')} onPress={() => runImport(csv).catch((err: Error) => setError(err.message))} />
      <Spacer />
      <Card>
        <Text style={{ color: t.text, fontWeight: '700' }}>Test A/B</Text>
        <Muted>Versions publiées : {versions.map((v) => `v${v.version} ${v.id.slice(0, 8)}`).join(' · ') || 'aucune'}</Muted>
        <Field label="Version A (id)" value={versionA} onChangeText={setVersionA} />
        <Field label="Poids A" value={weightA} onChangeText={setWeightA} keyboardType="number-pad" />
        <Field label="Version B (id)" value={versionB} onChangeText={setVersionB} />
        <Field label="Poids B" value={weightB} onChangeText={setWeightB} keyboardType="number-pad" />
        <Button title={tel.t('save')} onPress={async () => {
          if (!tel.client || !tel.ownerId || !id) return;
          try {
            if (versionA) await saveVariant(tel.client, tel.ownerId, id, 'A', versionA.trim(), Number(weightA) || 50);
            if (versionB) await saveVariant(tel.client, tel.ownerId, id, 'B', versionB.trim(), Number(weightB) || 50);
            setReport('Variantes enregistrées.');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'A/B');
          }
        }} />
      </Card>
    </TelScreen>
  );
}
