import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider, useData } from '@/lib/data';
import { theme as t } from '@/ui/theme';

function Root() {
  const { ready } = useData();
  // Stockage local uniquement : l'hydratation est quasi immédiate, jamais bloquée par le réseau.
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  return (
    <Stack screenOptions={{ headerTintColor: t.primary, headerStyle: { backgroundColor: t.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Retour' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="account/[id]" options={{ title: 'Compte' }} />
      <Stack.Screen name="offer/[id]" options={{ title: 'Offre' }} />
      <Stack.Screen name="invoice/[id]" options={{ title: 'Facture' }} />
      <Stack.Screen name="expense/[id]" options={{ title: 'Dépense' }} />
      <Stack.Screen name="import" options={{ title: 'Import CSV — comptes' }} />
      <Stack.Screen name="settings" options={{ title: 'Réglages société' }} />
      <Stack.Screen name="config" options={{ title: 'Configuration' }} />
    </Stack>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <DataProvider>
        <Root />
      </DataProvider>
    </SafeAreaProvider>
  );
}
