import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { loadCall } from '@/lib/telephonie/api';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Badge, Card, H2, Muted, Notice, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function CallDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tel = useTelephony();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCall>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tel.client || !id) return;
    loadCall(tel.client, id).then(setData).catch((err: Error) => setError(err.message));
  }, [tel.client, id]);

  const call = data?.call as { summary?: string; sentiment?: string; outcome?: string; duration_seconds?: number; from_e164?: string; to_e164?: string } | null;
  return (
    <TelScreen title="Appel">
      {error ? <Notice tone="danger" title="Appel introuvable" text={error} /> : null}
      {call ? (
        <Card>
          <Muted>{call.from_e164} → {call.to_e164}</Muted>
          <Spacer h={8} />
          <Badge label={call.outcome ?? '—'} tone="info" />
          <Spacer h={8} />
          <H2>{tel.t('summary')}</H2>
          <Text style={{ color: t.text, lineHeight: 22 }}>{call.summary || '—'}</Text>
          <Spacer />
          <Muted>{tel.t('sentiment')} : {call.sentiment ?? '—'}</Muted>
          <Muted>{tel.t('duration')} : {call.duration_seconds ?? '—'} s</Muted>
        </Card>
      ) : null}
      <H2>{tel.t('transcript')}</H2>
      {(data?.segments ?? []).map((seg) => (
        <Card key={String(seg.seq)}>
          <Muted>{seg.speaker}{seg.interrupted ? ' · coupé' : ''}</Muted>
          <Text style={{ color: t.text, lineHeight: 22 }}>{seg.text}</Text>
        </Card>
      ))}
      {!data?.segments.length ? <Muted>{tel.t('empty')}</Muted> : null}
    </TelScreen>
  );
}
