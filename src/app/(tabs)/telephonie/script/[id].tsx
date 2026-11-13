import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { loadScriptBundle, publishScript, saveScriptDraft } from '@/lib/telephonie/api';
import { INBOUND_PROMPT, OUTBOUND_PROMPT } from '@/lib/telephonie/templates';
import { TelScreen, useTelephony } from '@/components/TeleShell';
import { Button, Field, Muted, Notice, Row, Segmented, Spacer } from '@/ui/kit';

export default function ScriptEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tel = useTelephony();
  const creating = id === 'nouveau';
  const [scriptId, setScriptId] = useState(creating ? undefined : id);
  const [name, setName] = useState('Prospection boissons');
  const [kind, setKind] = useState<'outbound' | 'inbound' | 'voicemail'>('outbound');
  const [prompt, setPrompt] = useState('');
  const [opening, setOpening] = useState("Bonjour, je suis l'assistante IA de Bissabi.");
  const [voicemail, setVoicemail] = useState("Bonjour, je suis l'assistante IA de Bissabi. Je vous appelais au sujet de nos boissons à l'hibiscus, préparées en Suisse. Vous pouvez nous rappeler sur ce numéro. Bonne journée.");
  const [versions, setVersions] = useState<{ version: number; status: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!tel.client || creating || !id) return;
    loadScriptBundle(tel.client, id).then((bundle) => {
      const script = bundle.script as { name?: string; kind?: 'outbound' | 'inbound' | 'voicemail' } | null;
      const latest = bundle.versions[0] as { system_prompt?: string; opening_line?: string; voicemail_message?: string; version: number; status: string } | undefined;
      if (script?.name) setName(script.name);
      if (script?.kind) setKind(script.kind);
      if (latest) {
        setPrompt(latest.system_prompt ?? '');
        setOpening(latest.opening_line ?? '');
        setVoicemail(latest.voicemail_message ?? '');
      }
      setVersions(bundle.versions as { version: number; status: string }[]);
    }).catch((err: Error) => setError(err.message));
  }, [tel.client, id, creating]);

  const save = async (publish: boolean) => {
    if (!tel.client || !tel.ownerId) return;
    setError(null);
    try {
      const saved = await saveScriptDraft(tel.client, tel.ownerId, {
        scriptId, name, kind, personaId: null, systemPrompt: prompt, opening, voicemail,
      });
      setScriptId(saved);
      if (publish) await publishScript(tel.client, saved);
      setInfo(publish ? 'Version publiée. Elle ne se modifie plus : créez-en une nouvelle.' : 'Brouillon enregistré.');
      const bundle = await loadScriptBundle(tel.client, saved);
      setVersions(bundle.versions as { version: number; status: string }[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'enregistrement');
    }
  };

  return (
    <TelScreen title={name || 'Script'}>
      {error ? <Notice tone="danger" title="Script" text={error} /> : null}
      {info ? <Notice tone="success" title={info} /> : null}
      <Field label="Nom" value={name} onChangeText={setName} />
      <Segmented label="Type" value={kind} onChange={setKind} options={[{ label: 'Sortant', value: 'outbound' }, { label: 'Entrant', value: 'inbound' }, { label: 'Répondeur', value: 'voicemail' }]} />
      <Row wrap>
        <Button small variant="secondary" title="Modèle sortant" onPress={() => { setKind('outbound'); setPrompt(OUTBOUND_PROMPT); }} />
        <Button small variant="secondary" title="Modèle entrant" onPress={() => { setKind('inbound'); setPrompt(INBOUND_PROMPT); }} />
      </Row>
      <Spacer />
      <Field label="Phrase d’ouverture" value={opening} onChangeText={setOpening} multiline hint="La première phrase doit contenir « assistante IA de Bissabi »." />
      <Field label="Prompt système" value={prompt} onChangeText={setPrompt} multiline />
      <Field label="Message répondeur" value={voicemail} onChangeText={setVoicemail} multiline />
      <Row wrap>
        <Button title={tel.t('save')} onPress={() => save(false)} />
        <Button variant="secondary" title={tel.t('publish')} onPress={() => save(true)} />
      </Row>
      <Spacer />
      {versions.map((v) => <Muted key={v.version}>v{v.version} · {v.status}</Muted>)}
    </TelScreen>
  );
}
