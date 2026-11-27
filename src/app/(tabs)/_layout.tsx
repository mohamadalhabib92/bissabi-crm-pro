import { Tabs, useRouter } from 'expo-router';
import { useData } from '@/lib/data';
import { tr } from '@/lib/i18n';
import { useShell } from '@/lib/useShell';
import { haptic, IconButton, Ionicons, type IconName } from '@/ui/kit';
import { alpha, currentScheme, theme as t } from '@/ui/theme';
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
  const shell = useShell();
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
        tabBarStyle: shell.sidebar
          ? { display: 'none', height: 0 }
          : {
          backgroundColor: alpha(t.surface, 0.94),
          borderTopWidth: 1,
          borderTopColor: alpha(t.veil, currentScheme() === 'dark' ? 0.22 : 0.9),
          minHeight: Math.max(64, Math.round(56 * Math.min(fontScale, 1.5))),
          shadowColor: '#000000',
          shadowOpacity: currentScheme() === 'dark' ? 0.45 : 0.14,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -6 },
          elevation: 12,
        },
        tabBarItemStyle: { minHeight: 44 },
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontSize: tabFs(11), fontWeight: '600', letterSpacing: 0.1 },
        headerStyle: { backgroundColor: alpha(t.surface, 0.94) },
        headerShadowVisible: true,
        headerTitleStyle: { color: t.text, fontWeight: '700' },
        headerRight: () => <IconButton icon="settings-outline" label="Réglages société" onPress={() => router.push('/settings')} />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: tr(L, 'dashboard'), tabBarLabel: 'Accueil', headerTitle: tr(L, 'dashboard'), tabBarIcon: icon('stats-chart-outline') }} />
      <Tabs.Screen name="accounts" options={{ title: tr(L, 'accounts'), tabBarIcon: icon('business-outline') }} />
      <Tabs.Screen name="pipeline" options={{ title: tr(L, 'pipeline'), tabBarIcon: icon('git-network-outline') }} />
      <Tabs.Screen name="sales" options={{ title: tr(L, 'sales'), tabBarIcon: icon('document-text-outline') }} />
      <Tabs.Screen name="expenses" options={{ title: tr(L, 'expenses'), tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="telephonie" options={{ title: tr(L, 'telephony'), headerShown: false, tabBarIcon: icon('call-outline') }} />
    </Tabs>
  );
}
