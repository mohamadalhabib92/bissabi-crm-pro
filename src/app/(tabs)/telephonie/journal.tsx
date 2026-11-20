import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { loadCalls } from '@/lib/telephonie/api';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Badge, ListItem, Muted, Notice } from '@/ui/kit';

export default function JournalScreen() {
  const tel = useTelephony();
  const router = useRouter();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadCalls>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tel.client || !tel.ownerId) return;
    const client = tel.client;
    const ownerId = tel.ownerId;
    let alive = true;
    const pull = () => loadCalls(client, ownerId).then((data) => { if (alive) setRows(data); }).catch((err: Error) => { if (alive) setError(err.message); });
    pull();
    const channel = client.channel('tel-calls').on('postgres_changes', { event: '*', schema: 'public', table: 'tel_calls', filter: `owner_id=eq.${ownerId}` }, pull).subscribe();
    return () => { alive = false; client.removeChannel(channel); };
  }, [tel.client, tel.ownerId]);

  return (
    <TelScreen title={tel.t('journal')}>
      {error ? <Notice tone="danger" title="Journal indisponible" text={error} /> : null}
      {!rows.length && !error ? <Muted>{tel.t('empty')}</Muted> : null}
      {rows.map((row) => (
        <ListItem
          key={row.id}
          icon={row.direction === 'inbound' ? 'call-outline' : 'arrow-redo-outline'}
          title={`${row.direction === 'inbound' ? row.from_e164 : row.to_e164}`}
          subtitle={[row.outcome, row.sentiment, row.summary].filter(Boolean).join(' · ') || row.status}
          right={row.is_sandbox ? <Badge label={tel.t('sandbox')} tone="warning" /> : undefined}
          onPress={() => router.push({ pathname: '/telephonie/appel/[id]', params: { id: row.id } })}
        />
      ))}
    </TelScreen>
  );
}
