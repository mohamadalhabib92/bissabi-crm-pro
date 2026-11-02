import { Text } from 'react-native';
import { BACKEND_URL, SERVER_ENV, SUPABASE_CONFIGURED, SUPABASE_URL } from '@/lib/backend';
import { sentryEnv } from '@/lib/sentry';
import { Card, H2, Muted, Notice, Screen, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function Config() {
  return (
    <Screen>
      <Notice
        tone={BACKEND_URL ? 'success' : 'info'}
        title={BACKEND_URL ? 'Backend configuré' : 'Mode local — aucune configuration requise'}
        text={BACKEND_URL ? 'Une URL de backend est définie. Elle n’est pas appelée au démarrage.' : 'Comptes, pipeline, offres, factures QR, dépenses et exports fonctionnent hors ligne. Aucun appel réseau, aucun écran de chargement bloquant, pas d’erreur 402.'}
      />
      <Spacer />
      <H2>Variables côté client</H2>
      <Card>
        <Text style={{ color: t.text, fontFamily: 'monospace', marginBottom: 6 }}>EXPO_PUBLIC_BACKEND_URL = {BACKEND_URL || 'YOUR_BACKEND_URL (non défini)'}</Text>
        <Text style={{ color: t.text, fontFamily: 'monospace', marginBottom: 6 }}>EXPO_PUBLIC_SUPABASE_URL = {SUPABASE_URL || 'YOUR_SUPABASE_URL (non défini)'}</Text>
        <Text style={{ color: t.text, fontFamily: 'monospace', marginBottom: 6 }}>EXPO_PUBLIC_SUPABASE_ANON_KEY = {SUPABASE_CONFIGURED ? 'configurée (non affichée)' : 'YOUR_SUPABASE_ANON_KEY (non définie)'}</Text>
        <Text style={{ color: t.text, fontFamily: 'monospace' }}>EXPO_PUBLIC_SENTRY_DSN = {sentryEnv.configured ? 'configurée (envoi seulement après un crash)' : 'YOUR_SENTRY_DSN (désactivée)'}</Text>
      </Card>
      <Muted style={{ marginTop: 8, fontSize: 13 }}>EXPO_PUBLIC_EXAMPLE_ENV_VAR a été retirée et ne doit pas revenir. IBAN, numéro TVA et logo se saisissent dans Réglages, pas dans le bundle.</Muted>
      <Spacer />
      <H2>Variables obsolètes ou serveur</H2>
      <Card>
        <Muted style={{ marginBottom: 8 }}>Aucun backend dans ce dépôt. BETTER_AUTH_SECRET et DATABASE_URL sont conservées comme placeholders obsolètes : elles ne sont pas lues par l’app. Wix et l’envoi d’e-mail serveur restent une phase ultérieure.</Muted>
        {SERVER_ENV.map((k) => (
          <Text key={k} style={{ color: t.text, fontFamily: 'monospace', marginBottom: 4 }}>{k} = YOUR_{k}</Text>
        ))}
      </Card>
    </Screen>
  );
}
