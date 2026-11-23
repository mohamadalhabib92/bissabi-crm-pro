import { useEffect, useState } from 'react';
import { addDnc, loadDnc, removeDnc } from '@/lib/telephonie/api';
import { toE164 } from '@/lib/telephonie/phone';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Button, Field, ListItem, Muted, Notice } from '@/ui/kit';

export default function DncScreen() {
  const tel = useTelephony();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadDnc>>>([]);
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('Demande manuelle');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    if (!tel.client || !tel.ownerId) return;
    loadDnc(tel.client, tel.ownerId).then(setRows).catch((err: Error) => setError(err.message));
  };
  useEffect(refresh, [tel.client, tel.ownerId]);

  return (
    <TelScreen title={tel.t('dnc')}>
      {error ? <Notice tone="danger" title="Liste" text={error} /> : null}
      <Muted>Un refus de sollicitation y entre tout de suite. Seul un admin peut retirer un numéro.</Muted>
      <Field label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Motif" value={reason} onChangeText={setReason} />
      <Button title={tel.t('add')} onPress={() => {
        if (!tel.client || !tel.ownerId) return;
        const e164 = toE164(phone);
        if (!e164) return setError('Numéro invalide.');
        addDnc(tel.client, tel.ownerId, e164, reason).then(() => { setPhone(''); refresh(); }).catch((err: Error) => setError(err.message));
      }} />
      {rows.map((row) => (
        <ListItem
          key={row.id}
          icon="remove-circle-outline"
          title={row.phone_e164}
          subtitle={`${row.source} · ${row.reason ?? ''}`}
          onPress={() => {
            if (!tel.client) return;
            removeDnc(tel.client, row.id).then(refresh).catch((err: Error) => setError(err.message));
          }}
        />
      ))}
      {!rows.length ? <Muted>{tel.t('empty')}</Muted> : null}
    </TelScreen>
  );
}
