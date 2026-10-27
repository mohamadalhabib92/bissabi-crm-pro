import { Tabs, useRouter } from 'expo-router';
import { useData } from '@/lib/data';
import { tr } from '@/lib/i18n';
import { IconButton, Ionicons, type IconName } from '@/ui/kit';
import { theme as t } from '@/ui/theme';

const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: unknown; size: number }) {
    return <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />;
  };

export default function TabsLayout() {
  const { company } = useData();
  const router = useRouter();
  const L = company.lang;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border, minHeight: 60 },
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
