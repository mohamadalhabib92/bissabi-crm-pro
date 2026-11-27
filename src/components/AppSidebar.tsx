import { router, usePathname, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { tr } from '@/lib/i18n';
import { isIosAppOnMac } from '@/lib/mac';
import { SIDEBAR_WIDTH } from '@/lib/shell';
import { Ionicons, type IconName } from '@/ui/kit';
import { alpha, theme as t } from '@/ui/theme';
import { useState } from 'react';

const LINKS: { href: Href; icon: IconName; key: 'dashboard' | 'accounts' | 'pipeline' | 'sales' | 'expenses' | 'telephony'; active: (path: string) => boolean }[] = [
  { href: '/', icon: 'stats-chart-outline', key: 'dashboard', active: (path) => path === '/' || path === '/index' },
  { href: '/accounts', icon: 'business-outline', key: 'accounts', active: (path) => path === '/accounts' || path.startsWith('/account/') },
  { href: '/pipeline', icon: 'git-network-outline', key: 'pipeline', active: (path) => path.startsWith('/pipeline') },
  { href: '/sales', icon: 'document-text-outline', key: 'sales', active: (path) => path === '/sales' || path.startsWith('/offer/') || path.startsWith('/invoice/') || path.startsWith('/credit/') },
  { href: '/expenses', icon: 'receipt-outline', key: 'expenses', active: (path) => path === '/expenses' || path.startsWith('/expense/') },
  { href: '/telephonie', icon: 'call-outline', key: 'telephony', active: (path) => path.startsWith('/telephonie') },
];

function SideLink({ href, label, icon, active, hint }: { href: Href; label: string; icon: IconName; active: boolean; hint?: string }) {
  const [hovered, setHovered] = useState(false);
  const go = () => router.push(href);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={go}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        minHeight: 48,
        paddingHorizontal: 14,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: active ? t.primary : hovered ? t.surfaceAlt : 'transparent',
      }}
    >
      <Ionicons name={icon} size={20} color={active ? t.onPrimary : t.text} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: active ? t.onPrimary : t.text, fontWeight: '700', fontSize: 16 }}>{label}</Text>
        {hint ? <Text style={{ color: active ? alpha(t.onPrimary, 0.85) : t.muted, fontSize: 12 }}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Navigation latérale sur iPad large, Mac et fenêtre web large. */
export function AppSidebar() {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { company } = useData();
  const mac = isIosAppOnMac();
  const L = company.lang;
  return (
    <View
      style={{
        width: SIDEBAR_WIDTH,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: t.border,
        backgroundColor: alpha(t.surface, 0.96),
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 16,
        paddingHorizontal: 12,
      }}
    >
      <Text accessibilityRole="header" style={{ color: t.primary, fontSize: 20, fontWeight: '800', paddingHorizontal: 8 }} numberOfLines={2}>
        {company.name || 'Bissabi'}
      </Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 6, paddingTop: 16 }} keyboardShouldPersistTaps="handled">
        {LINKS.map((link) => (
          <SideLink
            key={link.key}
            href={link.href}
            icon={link.icon}
            label={tr(L, link.key)}
            active={link.active(path)}
            hint={link.key === 'telephony' && mac ? 'iPhone / iPad' : undefined}
          />
        ))}
      </ScrollView>
      <SideLink href="/settings" icon="settings-outline" label={tr(L, 'settings')} active={path.startsWith('/settings')} />
    </View>
  );
}
