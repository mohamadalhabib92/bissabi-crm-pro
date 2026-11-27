import { Stack } from 'expo-router';
import { isIosAppOnMac } from '@/lib/mac';
import { macLimitMessage } from '@/lib/macLimits';
import { H1, Notice, Screen } from '@/ui/kit';
import { useReducedMotion } from '@/ui/motion';
import { alpha, theme as t } from '@/ui/theme';

export default function TelephonieLayout() {
  const reduceMotion = useReducedMotion();
  if (isIosAppOnMac()) {
    return (
      <Screen>
        <H1>Téléphonie</H1>
        <Notice tone="info" title="Appels indisponibles sur Mac" text={macLimitMessage('telephony') ?? ''} />
      </Screen>
    );
  }
  return (
    <Stack screenOptions={{ headerTintColor: t.primary, headerStyle: { backgroundColor: alpha(t.surface, 0.94) }, headerShadowVisible: true, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Retour', headerTitleStyle: { color: t.text, fontWeight: '700' }, animation: reduceMotion ? 'none' : 'default' }}>
      <Stack.Screen name="index" options={{ title: 'Téléphonie IA' }} />
      <Stack.Screen name="journal" options={{ title: 'Journal des appels' }} />
      <Stack.Screen name="appel/[id]" options={{ title: 'Appel' }} />
      <Stack.Screen name="scripts" options={{ title: 'Scripts et voix' }} />
      <Stack.Screen name="script/[id]" options={{ title: 'Script' }} />
      <Stack.Screen name="campagnes" options={{ title: 'Campagnes' }} />
      <Stack.Screen name="campagne/[id]" options={{ title: 'Campagne' }} />
      <Stack.Screen name="dnc" options={{ title: 'Ne pas appeler' }} />
      <Stack.Screen name="connaissances" options={{ title: 'Base de connaissances' }} />
    </Stack>
  );
}
