import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { SvgXml } from 'react-native-svg';
import { BACKEND_URL } from '@/lib/backend';
import { confirmAsk } from '@/lib/confirm';
import { useData } from '@/lib/data';
import { formatIban, isPlaceholderIban, isQrIban, isValidIban } from '@/lib/iban';
import { GREEN_LOGO_SVG } from '@/lib/logo';
import { VAT_RATES, visibleVatNumber, type Company } from '@/lib/model';
import { Button, Card, Field, H2, ListItem, Muted, Notice, Row, Screen, Segmented, Spacer, Toggle } from '@/ui/kit';
import { SafetyPanel } from '@/ui/SafetyPanel';
import { theme as t } from '@/ui/theme';
import { BissabiImportButton } from '@/ui/BissabiImport';
import { useVibrations } from '@/ui/access';
import { chf } from '@/lib/format';

const LANGS: { label: string; value: Company['lang'] }[] = [
  { label: 'FR', value: 'fr' }, { label: 'DE', value: 'de' }, { label: 'IT', value: 'it' }, { label: 'EN', value: 'en' },
];

export default function Settings() {
  const { company, setCompany, hasDemo, removeDemo, products } = useData();
  const router = useRouter();
  const [c, setC] = useState<Company>(company);
  const [saved, setSaved] = useState(false);
  const [vibrations, setVibrations] = useVibrations();
  const set = (p: Partial<Company>) => { setC((x) => ({ ...x, ...p })); setSaved(false); };
  // Un import (Vibecode, Bissabi) peut remplir des champs vides pendant que le formulaire est ouvert :
  // on reprend seulement ces champs encore vides / placeholder, sans toucher aux saisies en cours.
  useEffect(() => {
    setC((x) => {
      const fill = Object.fromEntries(Object.entries(company).filter(([k, v]) => {
        const cur = String((x as Record<string, unknown>)[k] ?? '').trim();
        return String(v ?? '').trim() !== '' && (cur === '' || (k === 'iban' && isPlaceholderIban(cur)));
      }));
      return Object.keys(fill).length ? ({ ...x, ...fill } as Company) : x;
    });
  }, [company]);
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
      <Field
        label="Numéro TVA (masqué sur les documents)"
        value={c.vatNumber}
        onChangeText={(v) => set({ vatNumber: v })}
        autoCapitalize="characters"
        hint={visibleVatNumber(c) ? 'Imprimé sur les documents.' : 'YOUR_VAT_NUMBER — rien n’est imprimé. Assujettissement : à valider.'}
      />
      <Toggle label="TVA appliquée par défaut" value={c.vatDefault} onChange={(v) => set({ vatDefault: v })} hint="Modifiable facture par facture (Oui / Non)" />
      <Segmented label="Taux par défaut" options={VAT_RATES.map((r) => ({ label: `${r} %`, value: r }))} value={c.vatRateDefault} onChange={(v) => set({ vatRateDefault: v })} />

      <H2>Langue de l’interface</H2>
      <Segmented options={LANGS} value={c.lang} onChange={(v) => set({ lang: v })} />
      <Muted style={{ fontSize: 12 }}>FR complet. DE / IT / EN : navigation traduite, écrans et documents encore en français.</Muted>
      <Spacer />
      <Button title={saved ? 'Enregistré ✓' : 'Enregistrer'} icon="checkmark" onPress={() => { setCompany(c); setSaved(true); }} />

      <Spacer h={24} />
      <H2>Confort</H2>
      <Toggle label="Vibrations" value={vibrations} onChange={setVibrations} hint="Petits retours tactiles sur cet appareil. Appliqué tout de suite." />

      <Spacer h={24} />
      <H2>Données Bissabi</H2>
      <Card>
        <BissabiImportButton onCompany={(co) => setC((x) => {
          const keep = Object.fromEntries(Object.entries(x).filter(([k, v]) => String(v ?? '').trim() !== '' && !(k === 'iban' && isPlaceholderIban(String(v)))));
          return { ...co, ...keep } as Company;
        })} />
        <Spacer h={12} />
        <Button variant="secondary" icon="code-download-outline" title="Importer sauvegarde Vibecode (JSON)" onPress={() => router.push('/import-vibecode')} />
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
        {hasDemo ? <ListItem icon="sparkles-outline" title="Supprimer les données de démonstration" onPress={() => confirmAsk('Supprimer les données démo ?', 'Seuls les éléments marqués « démo » sont supprimés. Les données réelles ne sont pas touchées.', removeDemo)} /> : null}
      </Card>
      <Spacer h={8} />
      <SafetyPanel />
      <Muted style={{ fontSize: 12, marginTop: 8, color: t.muted }}>Bissabi Drinks - BA · Swiss Premium Botanical Beverage Brand Inspired by the Sahel</Muted>
    </Screen>
  );
}
