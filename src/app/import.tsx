import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { ACCOUNT_HEADERS, importAccounts, TEMPLATE_CSV, type ImportResult } from '@/lib/accountsCsv';
import { useData } from '@/lib/data';
import { downloadText, toCSV } from '@/lib/download';
import { uid } from '@/lib/storage';
import { Button, Card, Field, H2, Muted, Notice, Row, Screen, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';
import { BissabiImportButton } from '@/ui/BissabiImport';

export default function ImportScreen() {
  const { accounts, setAccounts } = useData();
  const router = useRouter();
  const [text, setText] = useState('');
  const [res, setRes] = useState<ImportResult | null>(null);
  const [done, setDone] = useState(0);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/plain', 'text/comma-separated-values', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const content = a.file ? await a.file.text() : await (await fetch(a.uri)).text();
    setText(content);
    setRes(importAccounts(content, accounts, () => uid('acc_')));
    setDone(0);
  };
  const analyse = () => { setRes(importAccounts(text, accounts, () => uid('acc_'))); setDone(0); };
  const confirm = () => {
    if (!res?.ok.length) return;
    setAccounts((l) => [...res.ok, ...l]);
    setDone(res.ok.length);
  };

  return (
    <Screen>
      <H2>Import complet Bissabi</H2>
      <Card style={{ marginBottom: 16 }}>
        <BissabiImportButton />
      </Card>
      <H2>Import de comptes (CSV)</H2>
      <Muted>Séparateur « ; », première ligne = en-têtes exacts :</Muted>
      <Card style={{ marginVertical: 8 }}>
        <Text selectable style={{ color: t.text, fontFamily: 'monospace', fontSize: 12 }}>{ACCOUNT_HEADERS.join(';')}</Text>
      </Card>
      <Muted style={{ fontSize: 13 }}>
        Étapes acceptées (mapping strict) : Prospect · Contacté · RDV/échantillon · Essai · Première commande · Client actif. Les lignes hors Vaud sont importées avec livraison_ok=false et l’avertissement « hors zone livraison actuelle ».
      </Muted>
      <Spacer />
      <Row wrap>
        <Button icon="document-attach-outline" title="Choisir un fichier CSV" onPress={pick} />
        <Button variant="ghost" icon="download-outline" title="Modèle CSV" onPress={() => downloadText('modele-comptes-bissabi.csv', TEMPLATE_CSV)} />
      </Row>
      <Spacer />
      <Field label="…ou collez le contenu CSV" value={text} onChangeText={setText} multiline style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 12 }} />
      <Button variant="secondary" icon="search-outline" title="Analyser" onPress={analyse} disabled={!text.trim()} />
      {res ? (
        <>
          <Spacer />
          <H2>Rapport</H2>
          {res.headerError ? (
            <Notice tone="danger" title="En-têtes invalides" text={res.headerError} />
          ) : (
            <>
              <Notice tone={res.ok.length ? 'success' : 'warning'} title={`${res.ok.length} ligne(s) valide(s) · ${res.rejected.length} rejetée(s) · ${res.warnings.length} avertissement(s)`} />
              {res.warnings.length ? (
                <Card>
                  {res.warnings.map((w, i) => (
                    <Muted key={i} style={{ fontSize: 13 }}>Ligne {w.line} · {w.nom} : {w.message}</Muted>
                  ))}
                </Card>
              ) : null}
              {res.rejected.length ? (
                <>
                  <Spacer h={8} />
                  <Card>
                    {res.rejected.map((r) => (
                      <Text key={r.line} style={{ color: t.danger, fontSize: 13, marginBottom: 4 }}>Ligne {r.line} : {r.reasons.join(' ; ')}</Text>
                    ))}
                  </Card>
                  <Button small variant="ghost" icon="download-outline" title="Télécharger les lignes rejetées" onPress={() => downloadText('lignes-rejetees.csv', toCSV([[...ACCOUNT_HEADERS, 'motif_rejet'], ...res.rejected.map((r) => [...r.raw, r.reasons.join(' | ')])]))} />
                </>
              ) : null}
              <Spacer />
              {done ? (
                <>
                  <Notice tone="success" title={`${done} compte(s) importé(s).`} />
                  <Button title="Voir les comptes" onPress={() => router.back()} />
                </>
              ) : (
                <Button icon="cloud-upload-outline" title={`Importer ${res.ok.length} compte(s)`} onPress={confirm} disabled={!res.ok.length} />
              )}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
