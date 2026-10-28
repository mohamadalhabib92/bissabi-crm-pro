import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { BACKEND_URL } from '@/lib/backend';
import { confirmAsk } from '@/lib/confirm';
import { useData } from '@/lib/data';
import { formatIban, isPlaceholderIban, isQrIban, isValidIban } from '@/lib/iban';
import { GREEN_LOGO_SVG } from '@/lib/logo';
import { VAT_RATES, type Company } from '@/lib/model';
import { clearAll, exportAll } from '@/lib/storage';
import { downloadText } from '@/lib/download';
import { todayISO } from '@/lib/format';
import { Button, Card, Field, H2, ListItem, Muted, Notice, Row, Screen, Segmented, Spacer, Toggle } from '@/ui/kit';
import { theme as t } from '@/ui/theme';
import { BissabiImportButton } from '@/ui/BissabiImport';
import { chf } from '@/lib/format';

const LANGS: { label: string; value: Company['lang'] }[] = [
  { label: 'FR', value: 'fr' }, { label: 'DE', value: 'de' }, { label: 'IT', value: 'it' }, { label: 'EN', value: 'en' },
];

export default function Settings() {
  const { company, setCompany, hasDemo, removeDemo, products } = useData();
  const router = useRouter();
  const [c, setC] = useState<Company>(company);
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<Company>) => { setC((x) => ({ ...x, ...p })); setSaved(false); };
  const ibanState = isPlaceholderIban(c.iban) ? 'placeholder' : isValidIban(c.iban) ? 'ok' : 'invalid';

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
      <H2>Données</H2>
      <Card>
        <ListItem icon="server-outline" title="Backend / configuration" subtitle={BACKEND_URL ? `Synchronisation : ${BACKEND_URL}` : 'Mode local (hors ligne) — aucune clé requise'} onPress={() => router.push('/config')} />
        <ListItem icon="download-outline" title="Exporter toutes les données (JSON)" onPress={async () => downloadText(`bissabi-crm-${todayISO()}.json`, JSON.stringify(await exportAll(), null, 2), 'application/json')} />
        {hasDemo ? <ListItem icon="sparkles-outline" title="Supprimer les données de démonstration" onPress={() => confirmAsk('Supprimer les données démo ?', 'Seuls les éléments marqués « démo » sont supprimés.', removeDemo)} /> : null}
        <ListItem icon="trash-outline" title="Réinitialiser l’application" subtitle="Efface toutes les données locales" onPress={() => confirmAsk('Tout effacer ?', 'Action irréversible. Exportez d’abord vos données.', async () => { await clearAll(); if (typeof window !== 'undefined' && window.location) window.location.reload(); })} />
      </Card>
      <Muted style={{ fontSize: 12, marginTop: 8, color: t.muted }}>Bissabi Drinks - BA · Swiss Premium Botanical Beverage Brand Inspired by the Sahel</Muted>
    </Screen>
  );
}
