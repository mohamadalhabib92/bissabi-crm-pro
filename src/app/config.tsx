import { Text } from 'react-native';
import { BACKEND_URL, SERVER_ENV } from '@/lib/backend';
import { Card, H2, Muted, Notice, Screen, Spacer } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

export default function Config() {
  return (
    <Screen>
      <Notice
        tone={BACKEND_URL ? 'success' : 'info'}
        title={BACKEND_URL ? 'Backend configuré' : 'Mode local — aucune configuration requise'}
        text={BACKEND_URL ? BACKEND_URL : 'Toutes les fonctions (comptes, pipeline, offres, factures QR, dépenses, exports) fonctionnent hors ligne, données stockées sur l’appareil. Aucun appel payant, pas de chargement bloquant.'}
      />
      <Spacer />
      <H2>Variables côté client</H2>
      <Card>
        <Text style={{ color: t.text, fontFamily: 'monospace' }}>EXPO_PUBLIC_BACKEND_URL = {BACKEND_URL || 'YOUR_BACKEND_URL (non défini)'}</Text>
      </Card>
      <Spacer />
      <H2>Variables serveur (jamais dans l’app)</H2>
      <Card>
        {SERVER_ENV.map((k) => (
          <Text key={k} style={{ color: t.text, fontFamily: 'monospace', marginBottom: 4 }}>{k} = YOUR_{k}</Text>
        ))}
      </Card>
      <Muted style={{ marginTop: 8, fontSize: 13 }}>À définir sur votre hébergeur backend uniquement. Voir .env.example et README.</Muted>
    </Screen>
  );
}
