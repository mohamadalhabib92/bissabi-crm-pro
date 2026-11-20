import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { loadPersonas, loadScripts, savePersona } from '@/lib/telephonie/api';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Button, Card, Field, ListItem, Muted, Notice, Spacer } from '@/ui/kit';

const VOICES = ['ara', 'eve', 'leo', 'rex', 'sal'];

export default function ScriptsScreen() {
  const tel = useTelephony();
  const router = useRouter();
  const [scripts, setScripts] = useState<Awaited<ReturnType<typeof loadScripts>>>([]);
  const [personas, setPersonas] = useState<Awaited<ReturnType<typeof loadPersonas>>>([]);
  const [name, setName] = useState('Awa');
  const [provider, setProvider] = useState('grok');
  const [voice, setVoice] = useState('ara');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    if (!tel.client || !tel.ownerId) return;
    Promise.all([loadScripts(tel.client, tel.ownerId), loadPersonas(tel.client, tel.ownerId)])
      .then(([s, p]) => { setScripts(s); setPersonas(p); })
      .catch((err: Error) => setError(err.message));
  };
  useEffect(refresh, [tel.client, tel.ownerId]);

  return (
    <TelScreen title={tel.t('scripts')}>
      {error ? <Notice tone="danger" title="Scripts" text={error} /> : null}
      <Card>
        <Field label="Persona" value={name} onChangeText={setName} />
        <Field label={tel.t('provider')} value={provider} onChangeText={setProvider} hint="grok ou eu_pipeline" />
        <Field label={tel.t('voice')} value={voice} onChangeText={setVoice} hint={VOICES.join(', ') + ' — ou un voice id personnalisé'} />
        <Button title={tel.t('save')} onPress={() => {
          if (!tel.client || !tel.ownerId) return;
          savePersona(tel.client, tel.ownerId, { name, voice_provider: provider, voice_id: voice }).then(refresh).catch((err: Error) => setError(err.message));
        }} />
      </Card>
      {personas.map((p) => (
        <Muted key={p.id}>{p.name} · {p.voice_provider} · {p.voice_id}</Muted>
      ))}
      <Spacer />
      <Button title={tel.t('create')} icon="add-outline" onPress={() => router.push({ pathname: '/telephonie/script/[id]', params: { id: 'nouveau' } })} />
      <Spacer />
      {scripts.map((s) => (
        <ListItem key={s.id} icon="document-text-outline" title={s.name} subtitle={s.kind} onPress={() => router.push({ pathname: '/telephonie/script/[id]', params: { id: s.id } })} />
      ))}
      {!scripts.length ? <Muted>{tel.t('empty')}</Muted> : null}
    </TelScreen>
  );
}
