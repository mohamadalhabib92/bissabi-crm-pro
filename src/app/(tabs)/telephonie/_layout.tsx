import { Stack } from 'expo-router';
import { theme as t } from '@/ui/theme';

export default function TelephonieLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: t.primary, headerStyle: { backgroundColor: t.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Retour' }}>
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
