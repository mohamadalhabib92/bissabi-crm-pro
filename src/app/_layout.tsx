import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider, useData } from '@/lib/data';
import { Button } from '@/ui/kit';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { theme as t } from '@/ui/theme';

function BootFallback({ title, text, onRetry }: { title: string; text: string; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 24 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: t.muted, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 22 }}>{text}</Text>
      <Button title="Réessayer" icon="refresh" onPress={onRetry} />
    </View>
  );
}

function Root() {
  const { ready, loadError, retry } = useData();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(timer);
  }, [ready, loadError]);

  if (loadError) {
    return <BootFallback title="Lecture des données interrompue" text={loadError} onRetry={retry} />;
  }
  if (!ready && slow) {
    return (
      <BootFallback
        title="Le chargement dépasse 3 secondes"
        text="Aucun appel réseau n’est nécessaire. Vos données restent sur l’appareil. Réessayez."
        onRetry={retry}
      />
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }} accessibilityLabel="Chargement">
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }
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
      <ErrorBoundary>
        <DataProvider>
          <Root />
        </DataProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
