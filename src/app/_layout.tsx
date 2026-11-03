import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider, useData } from '@/lib/data';
import { AppErrorBoundary, BootFallback } from '@/ui/AppGuard';
import { theme as t } from '@/ui/theme';

function Root() {
  const { ready, loadError, writeError, dismissWriteError, retry } = useData();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (ready || loadError) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(id);
  }, [ready, loadError]);
  // Stockage local uniquement : aucun appel réseau au démarrage. Le repli évite un indicateur infini.
  if (loadError) return <BootFallback title="Ouverture impossible" text={loadError} onRetry={retry} />;
  if (!ready) {
    return (
      <BootFallback
        title="Ouverture des données locales…"
        text={slow ? 'Le chargement dépasse 3 secondes. Réessayer relit l’appareil : rien n’est enregistré, les données déjà présentes ne sont pas remplacées.' : 'Lecture de la mémoire de l’appareil.'}
        onRetry={slow ? retry : undefined}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {writeError ? (
        <View style={{ backgroundColor: t.dangerBg, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ color: t.danger, fontWeight: '700' }}>Enregistrement impossible</Text>
          <Text style={{ color: t.text, marginTop: 4, lineHeight: 20 }}>{writeError}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Masquer l’alerte d’enregistrement" onPress={dismissWriteError} style={{ marginTop: 8, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: t.primary, fontWeight: '700' }}>Masquer</Text>
          </Pressable>
        </View>
      ) : null}
    <Stack screenOptions={{ headerTintColor: t.primary, headerStyle: { backgroundColor: t.bg }, headerShadowVisible: false, contentStyle: { backgroundColor: t.bg }, headerBackTitle: 'Retour' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="account/[id]" options={{ title: 'Compte' }} />
      <Stack.Screen name="offer/[id]" options={{ title: 'Offre' }} />
      <Stack.Screen name="invoice/[id]" options={{ title: 'Facture' }} />
      <Stack.Screen name="credit/[id]" options={{ title: 'Avoir' }} />
      <Stack.Screen name="expense/[id]" options={{ title: 'Dépense' }} />
      <Stack.Screen name="import" options={{ title: 'Import CSV — comptes' }} />
      <Stack.Screen name="import-vibecode" options={{ title: 'Import Vibecode (JSON)' }} />
      <Stack.Screen name="settings" options={{ title: 'Réglages société' }} />
      <Stack.Screen name="config" options={{ title: 'Configuration' }} />
    </Stack>
    </View>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppErrorBoundary>
        <DataProvider>
          <Root />
        </DataProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
