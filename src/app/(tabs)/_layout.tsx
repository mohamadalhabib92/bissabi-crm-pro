import { Tabs, useRouter } from 'expo-router';
import { useData } from '@/lib/data';
import { tr } from '@/lib/i18n';
import { haptic, IconButton, Ionicons, type IconName } from '@/ui/kit';
import { theme as t } from '@/ui/theme';
import { useWindowDimensions } from 'react-native';

const icon = (name: IconName) =>
  function TabIcon({ color, size, focused }: { color: unknown; size: number; focused?: boolean }) {
    // Onglet actif : pictogramme plein (convention iOS), inactif : contour.
    const n = (focused ? name.replace(/-outline$/, '') : name) as IconName;
    return <Ionicons name={n} color={typeof color === 'string' ? color : undefined} size={size} />;
  };

export default function TabsLayout() {
  // Libellés d'onglets : suivent la taille de texte du système jusqu'à ×1,4, au-delà la barre déborderait.
  const { fontScale } = useWindowDimensions();
  const tabFs = (n: number) => Math.round(n * Math.min(fontScale, 1.4));
  const { company } = useData();
  const router = useRouter();
  const L = company.lang;
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic('select') }}
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border, minHeight: 60 },
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontSize: tabFs(11), fontWeight: '600', letterSpacing: 0.1 },
        headerStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: t.text, fontWeight: '700' },
        headerRight: () => <IconButton icon="settings-outline" label="Réglages société" onPress={() => router.push('/settings')} />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: tr(L, 'dashboard'), tabBarIcon: icon('stats-chart-outline') }} />
      <Tabs.Screen name="accounts" options={{ title: tr(L, 'accounts'), tabBarIcon: icon('business-outline') }} />
      <Tabs.Screen name="pipeline" options={{ title: tr(L, 'pipeline'), tabBarIcon: icon('git-network-outline') }} />
      <Tabs.Screen name="sales" options={{ title: tr(L, 'sales'), tabBarIcon: icon('document-text-outline') }} />
      <Tabs.Screen name="expenses" options={{ title: tr(L, 'expenses'), tabBarIcon: icon('receipt-outline') }} />
    </Tabs>
  );
}
