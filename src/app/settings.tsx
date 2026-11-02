import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SvgXml } from 'react-native-svg';
import { businessCsv, decryptBackup, encryptBackup, isEncryptedBackup, parseRestore, type EncryptedBackup } from '@/lib/backup';
import { BACKEND_URL } from '@/lib/backend';
import { confirmAsk } from '@/lib/confirm';
import { useData } from '@/lib/data';
import { downloadText } from '@/lib/download';
import { chf, todayISO } from '@/lib/format';
import { formatIban, isPlaceholderIban, isQrIban, isValidIban } from '@/lib/iban';
import { GREEN_LOGO_SVG } from '@/lib/logo';
import type { PersistedInput } from '@/lib/migrate';
import { VAT_RATES, type Company } from '@/lib/model';
import { clearAll } from '@/lib/storage';
import { Button, Card, Field, H2, ListItem, Muted, Notice, Row, Screen, Segmented, Spacer, Toggle } from '@/ui/kit';
import { theme as t } from '@/ui/theme';
import { BissabiImportButton } from '@/ui/BissabiImport';

const LANGS: { label: string; value: Company['lang'] }[] = [
  { label: 'FR', value: 'fr' }, { label: 'DE', value: 'de' }, { label: 'IT', value: 'it' }, { label: 'EN', value: 'en' },
];

export default function Settings() {
  const { company, setCompany, hasDemo, removeDemo, products, accounts, exportSnapshot, restoreDatabase, rollbackDatabase, migrationBackups, audit, migrationWarning } = useData();
  const router = useRouter();
  const [c, setC] = useState<Company>(company);
  const [saved, setSaved] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [dataMsg, setDataMsg] = useState('');
  const [pending, setPending] = useState<PersistedInput | null>(null);
  const [pendingCounts, setPendingCounts] = useState('');
  const [sealed, setSealed] = useState<EncryptedBackup | null>(null);
  const set = (p: Partial<Company>) => { setC((x) => ({ ...x, ...p })); setSaved(false); };
  const ibanState = isPlaceholderIban(c.iban) ? 'placeholder' : isValidIban(c.iban) ? 'ok' : 'invalid';
  const exportCsv = () => {
    const snap = exportSnapshot();
    const data = snap.data;
    downloadText(
      `bissabi-crm-${todayISO()}.csv`,
      businessCsv(
        {
          accounts: data.accounts ?? [],
          offers: data.offers ?? [],
          invoices: data.invoices ?? [],
          expenses: data.expenses ?? [],
          products: data.products ?? [],
          counters: data.counters ?? {},
          company: { ...company, ...(data.company ?? {}) },
          audit: data.audit ?? audit,
          schemaVersion: data.schemaVersion ?? 1,
          migrationBackups: data.migrationBackups ?? migrationBackups,
        },
        (id) => accounts.find((a) => a.id === id)?.nom ?? '',
      ),
    );
  };

  return (
    <Screen>
      <Card>
        <SvgXml xml={GREEN_LOGO_SVG} width={190} height={48} />
        <Muted style={{ fontSize: 12 }}>Logo vert utilisé sur les documents officiels (provisoire : remplacez lib/logo.ts par le logo officiel).</Muted>
      </Card>
      <Spacer />
      <H2>Société</H2>
      <Field label="Raison sociale" value={c.name} onChangeText={(v) => set({ name: v })} />
      <Row>
        <Field label="Rue" value={c.street} onChangeText={(v) => set({ street: v })} style={{ minWidth: 200 }} />
        <Field label="N°" value={c.houseNo} onChangeText={(v) => set({ houseNo: v })} style={{ width: 70 }} />
      </Row>
      <Row>
        <Field label="NPA" value={c.zip} onChangeText={(v) => set({ zip: v })} style={{ width: 90 }} />
        <Field label="Localité" value={c.town} onChangeText={(v) => set({ town: v })} style={{ minWidth: 160 }} />
      </Row>
      <Field label="IDE / UID" value={c.uid} onChangeText={(v) => set({ uid: v })} />
      <Field
        label="Numéro TVA (facultatif)"
        value={c.vatNumber ?? ''}
        onChangeText={(v) => set({ vatNumber: v })}
        autoCapitalize="characters"
        placeholder="YOUR_VAT_NUMBER"
        hint="Laissé vide ou YOUR_VAT_NUMBER : aucun numéro TVA sur les documents."
      />
      <Field label="Signature" value={c.tagline} onChangeText={(v) => set({ tagline: v })} />
      <Field label="E-mail" value={c.email} onChangeText={(v) => set({ email: v })} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Téléphone" value={c.phone} onChangeText={(v) => set({ phone: v })} />
      <Field label="Site web" value={c.website} onChangeText={(v) => set({ website: v })} autoCapitalize="none" />

      <H2>Paiement & QR-facture</H2>
      <Field
        label="IBAN (CH / LI)"
        value={c.iban}
        onChangeText={(v) => set({ iban: v })}
        autoCapitalize="characters"
        error={ibanState === 'invalid' ? 'IBAN invalide (contrôle mod 97)' : null}
        hint={ibanState === 'ok' ? `${formatIban(c.iban)} · ${isQrIban(c.iban) ? 'QR-IBAN → référence QRR' : 'IBAN → référence SCOR (RF)'}` : 'Valeur par défaut : YOUR_SWISS_IBAN (spécimen)'}
      />
      {ibanState !== 'ok' ? <Notice tone="warning" title="QR-factures en mode SPÉCIMEN" text="Saisissez l’IBAN réel de la société. L’app n’invente jamais d’IBAN." /> : null}
      <Field label="Délai de paiement (jours)" value={String(c.paymentDays)} onChangeText={(v) => set({ paymentDays: Math.max(0, Math.min(120, parseInt(v.replace(/\D/g, '') || '0', 10))) })} keyboardType="number-pad" />
      <Toggle label="TVA appliquée par défaut" value={c.vatDefault} onChange={(v) => set({ vatDefault: v })} hint="Modifiable facture par facture (Oui / Non)" />
      <Segmented label="Taux par défaut" options={VAT_RATES.map((r) => ({ label: `${r} %`, value: r }))} value={c.vatRateDefault} onChange={(v) => set({ vatRateDefault: v })} />

      <H2>Langue de l’interface</H2>
      <Segmented options={LANGS} value={c.lang} onChange={(v) => set({ lang: v })} />
      <Muted style={{ fontSize: 12 }}>FR complet. DE / IT / EN : navigation traduite, écrans et documents encore en français.</Muted>
      <Spacer />
      <Button title={saved ? 'Enregistré ✓' : 'Enregistrer'} icon="checkmark" onPress={() => { setCompany(c); setSaved(true); }} />

      <Spacer h={24} />
      <H2>Données Bissabi</H2>
      <Card>
        <BissabiImportButton onCompany={(co) => setC((x) => {
          const keep = Object.fromEntries(Object.entries(x).filter(([k, v]) => String(v ?? '').trim() !== '' && !(k === 'iban' && isPlaceholderIban(String(v)))));
          return { ...co, ...keep } as Company;
        })} />
      </Card>
      {products.length ? (
        <>
          <Spacer h={12} />
          <H2>Catalogue produits</H2>
          <Card>
            {products.map((p) => <ListItem key={p.id} icon="pricetag-outline" title={`${p.nom} — ${chf(p.prix)}`} subtitle={`${p.ref} · ${p.format} · ${p.canal}`} />)}
          </Card>
        </>
      ) : null}

      <Spacer h={24} />
      <H2>Sauvegarde</H2>
      {migrationWarning ? <Notice tone="warning" title="Migration reportée" text={migrationWarning} /> : null}
      {dataMsg ? <Notice tone="info" title={dataMsg} /> : null}
      <Card>
        <ListItem icon="server-outline" title="Backend / configuration" subtitle={BACKEND_URL ? `Synchronisation : ${BACKEND_URL}` : 'Mode local (hors ligne) — aucune clé requise'} onPress={() => router.push('/config')} />
        <ListItem icon="download-outline" title="Exporter la restauration (JSON complet)" subtitle="Comptes, offres, factures, dépenses, justificatifs, journal" onPress={() => downloadText(`bissabi-crm-${todayISO()}.json`, JSON.stringify(exportSnapshot(), null, 2), 'application/json')} />
        <ListItem icon="document-text-outline" title="Exporter le CSV métier (hors démo)" subtitle="Comptes, factures et dépenses — les exemples ne sont pas mélangés" onPress={exportCsv} />
        <Field label="Phrase secrète de la sauvegarde chiffrée" value={passphrase} onChangeText={setPassphrase} secureTextEntry autoCapitalize="none" hint="Elle n’est pas enregistrée. Sans elle, le fichier chiffré ne se relit pas." />
        <Button
          title="Télécharger la sauvegarde chiffrée"
          icon="lock-closed-outline"
          onPress={() => {
            void encryptBackup(JSON.stringify(exportSnapshot()), passphrase)
              .then((file) => downloadText(`bissabi-backup-${todayISO()}.json`, JSON.stringify(file), 'application/json'))
              .then(() => setDataMsg('Sauvegarde chiffrée prête.'))
              .catch((e: unknown) => setDataMsg(e instanceof Error ? e.message : 'Chiffrement impossible.'));
          }}
        />
        <ListItem
          icon="cloud-upload-outline"
          title="Importer une restauration"
          subtitle="JSON complet ou sauvegarde chiffrée. Rien n’est écrasé avant confirmation."
          onPress={() => {
            void (async () => {
              const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
              if (r.canceled || !r.assets?.[0]) return;
              const a = r.assets[0];
              const text = a.file ? await a.file.text() : await (await fetch(a.uri)).text();
              let parsed: unknown;
              try { parsed = JSON.parse(text); } catch { setDataMsg('Ce fichier n’est pas du JSON.'); return; }
              if (isEncryptedBackup(parsed)) { setSealed(parsed); setPending(null); setDataMsg('Fichier chiffré reconnu. Saisissez la phrase secrète puis déverrouillez.'); return; }
              const res = parseRestore(parsed);
              if (!res.ok) { setDataMsg(res.error); return; }
              setSealed(null);
              setPending(res.data);
              setPendingCounts(`${res.counts.accounts} comptes, ${res.counts.invoices} factures, ${res.counts.expenses} dépenses.`);
            })();
          }}
        />
        {sealed ? <Button title="Déchiffrer avec la phrase secrète" variant="secondary" onPress={() => {
          void decryptBackup(sealed, passphrase)
            .then((json) => {
              const res = parseRestore(JSON.parse(json));
              if (!res.ok) { setDataMsg(res.error); return; }
              setPending(res.data);
              setPendingCounts(`${res.counts.accounts} comptes, ${res.counts.invoices} factures, ${res.counts.expenses} dépenses.`);
              setSealed(null);
            })
            .catch((e: unknown) => setDataMsg(e instanceof Error ? e.message : 'Déchiffrement impossible.'));
        }} /> : null}
        {pending ? (
          <>
            <Notice tone="warning" title="Confirmer la restauration" text={`Le fichier contient ${pendingCounts} L’état actuel est conservé dans une sauvegarde de retour arrière. Les données réelles du fichier ne sont pas marquées démo.`} />
            <Button title="Restaurer maintenant" onPress={() => { restoreDatabase(pending); setPending(null); setDataMsg('Restauration effectuée. Un retour arrière reste possible.'); }} />
          </>
        ) : null}
        {migrationBackups.length ? <ListItem icon="arrow-undo-outline" title="Revenir à la sauvegarde précédente" subtitle={migrationBackups[0].at} onPress={() => confirmAsk('Revenir en arrière ?', 'Les comptes, factures et dépenses reviendront à la sauvegarde la plus récente (avant migration ou avant restauration).', () => { if (rollbackDatabase()) setDataMsg('Retour arrière effectué.'); })} /> : null}
        {hasDemo ? <ListItem icon="sparkles-outline" title="Supprimer les données de démonstration" subtitle="Ne touche que ce qui est marqué « démo »" onPress={() => confirmAsk('Supprimer les données démo ?', 'Les comptes, factures et dépenses réels restent en place.', removeDemo)} /> : null}
        <ListItem icon="trash-outline" title="Réinitialiser l’application" subtitle="Efface tout sur cet appareil, y compris les sauvegardes locales" onPress={() => confirmAsk('Tout effacer ?', 'Irréversible sur cet appareil. Exportez le JSON avant. Les fichiers déjà téléchargés ne sont pas touchés.', async () => { await clearAll(); if (typeof window !== 'undefined' && window.location) window.location.reload(); })} />
      </Card>
      {audit.length ? (
        <>
          <Spacer h={12} />
          <H2>Journal (lecture seule)</H2>
          <Card>
            {audit.slice().reverse().slice(0, 12).map((e) => <ListItem key={e.id} icon="time-outline" title={e.detail} subtitle={e.at.slice(0, 16).replace('T', ' ')} />)}
          </Card>
        </>
      ) : null}
      <Muted style={{ fontSize: 12, marginTop: 8, color: t.muted }}>Bissabi Drinks - BA · Swiss Premium Botanical Beverage Brand Inspired by the Sahel</Muted>
    </Screen>
  );
}
