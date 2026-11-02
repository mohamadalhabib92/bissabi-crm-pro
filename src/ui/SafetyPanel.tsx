import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { useData } from '@/lib/data';
import { confirmAsk } from '@/lib/confirm';
import { downloadText } from '@/lib/download';
import { dateCH, todayISO } from '@/lib/format';
import { AUDIT_LABEL } from '@/lib/audit';
import { Button, Card, Field, H2, ListItem, Muted, Notice, Spacer } from './kit';

async function readAsset(asset: { file?: File; uri: string }): Promise<string> {
  if (asset.file) return asset.file.text();
  return (await fetch(asset.uri)).text();
}

/** Export, restauration et journal. La phrase secrète n’est jamais enregistrée. */
export function SafetyPanel() {
  const data = useData();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warning'; title: string; text?: string } | null>(null);
  const pre = [...data.backups].reverse().find((b) => b.reason === 'pre-migration');

  const plain = async () => {
    const ok = await downloadText(`bissabi-crm-${todayISO()}.json`, JSON.stringify(data.exportPlain(), null, 2), 'application/json');
    if (!ok) setMsg({ tone: 'warning', title: 'Export annulé' });
  };
  const csv = async () => {
    const ok = await downloadText(`bissabi-crm-${todayISO()}.csv`, data.exportCsv());
    if (!ok) setMsg({ tone: 'warning', title: 'Export annulé' });
  };
  const encrypted = async () => {
    if (pass !== pass2) return setMsg({ tone: 'danger', title: 'Les deux phrases ne correspondent pas' });
    try {
      const file = await data.exportEncrypted(pass);
      const ok = await downloadText(`bissabi-crm-${todayISO()}.bissabi.json`, file, 'application/json');
      if (ok) {
        setPass('');
        setPass2('');
        setMsg({ tone: 'success', title: 'Sauvegarde chiffrée téléchargée', text: 'La phrase secrète n’est pas conservée dans l’app.' });
      }
    } catch (e) {
      setMsg({ tone: 'danger', title: 'Chiffrement impossible', text: e instanceof Error ? e.message : String(e) });
    }
  };
  const pick = async (mode: 'plain' | 'encrypted') => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    try {
      const text = await readAsset(r.assets[0]);
      const res = mode === 'plain' ? data.restorePlain(text) : await data.restoreEncrypted(text, restorePass);
      setMsg(res.ok ? { tone: 'success', title: 'Restauration terminée', text: 'Une copie de l’état précédent a été gardée.' } : { tone: 'danger', title: 'Restauration annulée', text: res.error });
    } catch (e) {
      setMsg({ tone: 'danger', title: 'Fichier illisible', text: e instanceof Error ? e.message : String(e) });
    }
  };
  const reset = () => confirmAsk('Réinitialiser les données métier ?', 'Un fichier JSON est d’abord téléchargé. Le journal et les sauvegardes internes sont conservés. Les exemples ne sont pas réinjectés.', () => {
    void (async () => {
      const ok = await downloadText(`bissabi-crm-avant-reset-${todayISO()}.json`, JSON.stringify(data.exportPlain(), null, 2), 'application/json');
      if (!ok) return setMsg({ tone: 'warning', title: 'Réinitialisation annulée', text: 'L’export n’a pas été confirmé.' });
      data.resetBusiness();
      setMsg({ tone: 'success', title: 'Données métier effacées', text: 'La sauvegarde interne d’avant reset est conservée.' });
    })();
  });

  return (
    <>
      <H2>Sauvegarde</H2>
      <Card>
        <ListItem icon="download-outline" title="Exporter toutes les données (JSON)" subtitle="Complet, y compris les éléments marqués démo" onPress={() => void plain()} />
        <ListItem icon="document-text-outline" title="Exporter le CSV (hors démo)" subtitle="Comptes, offres, factures, avoirs, dépenses" onPress={() => void csv()} />
        <Spacer h={8} />
        <Field label="Phrase secrète de la sauvegarde chiffrée" value={pass} onChangeText={setPass} secureTextEntry autoCapitalize="none" />
        <Field label="Confirmation" value={pass2} onChangeText={setPass2} secureTextEntry autoCapitalize="none" />
        <Button icon="lock-closed-outline" title="Télécharger la sauvegarde chiffrée" onPress={() => void encrypted()} />
        <Muted style={{ fontSize: 12, marginTop: 8 }}>AES-GCM, phrase secrète choisie par vous. Aucune clé n’est écrite dans l’app.</Muted>
      </Card>
      <Spacer />
      <H2>Restauration</H2>
      <Card>
        <Button variant="secondary" icon="cloud-upload-outline" title="Restaurer un JSON" onPress={() => void pick('plain')} />
        <Spacer h={8} />
        <Field label="Phrase secrète du fichier chiffré" value={restorePass} onChangeText={setRestorePass} secureTextEntry autoCapitalize="none" />
        <Button variant="secondary" icon="lock-open-outline" title="Restaurer une sauvegarde chiffrée" onPress={() => void pick('encrypted')} />
        {pre ? (
          <>
            <Spacer h={8} />
            <ListItem icon="archive-outline" title="Télécharger la sauvegarde d’avant migration" subtitle={dateCH(pre.at.slice(0, 10))} onPress={() => void downloadText(`bissabi-avant-migration-${todayISO()}.json`, JSON.stringify(pre.data, null, 2), 'application/json')} />
            <Button variant="ghost" title="Revenir aux données d’avant migration" onPress={() => confirmAsk('Revenir au snapshot d’avant migration ?', 'Les numéros et pièces de ce snapshot remplacent les données actuelles. Le journal n’est pas effacé.', () => {
              const res = data.rollbackMigration();
              setMsg(res.ok ? { tone: 'success', title: 'Snapshot restauré' } : { tone: 'danger', title: res.error });
            })} />
          </>
        ) : null}
      </Card>
      {msg ? <Notice tone={msg.tone} title={msg.title} text={msg.text} /> : null}
      <Spacer />
      <H2>Journal</H2>
      <Card>
        {data.audit.length ? [...data.audit].reverse().slice(0, 30).map((e) => (
          <ListItem key={e.id} icon="time-outline" title={`${AUDIT_LABEL[e.action]}${e.number ? ` · ${e.number}` : ''}`} subtitle={`${e.at.replace('T', ' ').slice(0, 16)}${e.detail ? ` · ${e.detail}` : ''}`} />
        )) : <Muted>Aucune entrée. Le journal est append-only.</Muted>}
      </Card>
      <Spacer />
      <H2>Zone sensible</H2>
      <Card>
        <ListItem icon="trash-outline" title="Réinitialiser les données métier" subtitle="Export JSON obligatoire avant effacement. Le journal reste." onPress={reset} />
      </Card>
    </>
  );
}
