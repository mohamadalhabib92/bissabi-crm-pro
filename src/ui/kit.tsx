import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme as t } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export { Ionicons };

/** Conteneur d'écran défilant, largeur max sur desktop (PWA). */
export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const insets = useSafeAreaInsets();
  const inner = (
    <View style={[styles.inner, padded && { padding: 20 }, { paddingBottom: 40 + insets.bottom }]}>{children}</View>
  );
  return (
    <View style={styles.screen}>
      {scroll ? (
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </View>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.h1, style]}>
      {children}
    </Text>
  );
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.h2, style]}>
      {children}
    </Text>
  );
}
export function Body({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[styles.body, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}
export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = 8, wrap }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Spacer({ h = 12 }: { h?: number }) {
  return <View style={{ height: h }} />;
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** Bouton accessible : cible tactile ≥ 44×44, retour visuel, états disabled/loading. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  small,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  accessibilityLabel?: string;
}) {
  const bg = { primary: t.primary, secondary: t.surfaceAlt, ghost: 'transparent', danger: t.danger }[variant];
  const fg = { primary: t.onPrimary, secondary: t.text, ghost: t.primary, danger: '#fff' }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg },
        variant === 'ghost' && { borderWidth: 1, borderColor: t.border },
        pressed && !off && { opacity: 0.8 },
        off && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[styles.btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color = t.text, size = 22 }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: t.surfaceAlt }]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const c = color ?? t.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: active ? c : t.border, backgroundColor: active ? c : 'transparent' },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={{ color: active ? (color ? '#fff' : t.onPrimary) : t.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  const map = {
    neutral: [t.surfaceAlt, t.muted],
    success: [t.successBg, t.success],
    warning: [t.warningBg, t.warning],
    danger: [t.dangerBg, t.danger],
    info: [t.infoBg, t.info],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }, error ? { borderColor: t.danger } : null, style]}
        {...props}
      />
      {error ? <Text style={{ color: t.danger, marginTop: 4, fontSize: 13 }}>{error}</Text> : hint ? <Muted style={{ marginTop: 4, fontSize: 13 }}>{hint}</Muted> : null}
    </View>
  );
}

/** Sélecteur segmenté (ex. TVA Oui / Non). */
export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.segment} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.segItem, on && { backgroundColor: t.surface, ...shadow(1) }]}
            >
              <Text style={{ color: on ? t.text : t.muted, fontWeight: on ? '700' : '500', fontSize: 14 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Body>{label}</Body>
        {hint ? <Muted style={{ fontSize: 13 }}>{hint}</Muted> : null}
      </View>
      <View style={[styles.track, { backgroundColor: value ? t.primary : t.border }]}>
        <View style={[styles.thumb, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

export function Empty({ icon = 'sparkles-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={t.accent} />
      </View>
      <Text style={[styles.h2, { textAlign: 'center', marginBottom: 6 }]}>{title}</Text>
      {text ? <Muted style={{ textAlign: 'center', marginBottom: 14 }}>{text}</Muted> : null}
      {action}
    </View>
  );
}

export function Notice({ tone = 'info', title, text, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title: string; text?: string; icon?: IconName }) {
  const map = { info: [t.infoBg, t.info], warning: [t.warningBg, t.warning], danger: [t.dangerBg, t.danger], success: [t.successBg, t.success] } as const;
  const [bg, fg] = map[tone];
  const ic: IconName = icon ?? ({ info: 'information-circle', warning: 'warning', danger: 'alert-circle', success: 'checkmark-circle' } as const)[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      <Ionicons name={ic} size={20} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: fg, fontWeight: '700', fontSize: 14 }}>{title}</Text>
        {text ? <Text style={{ color: t.text, fontSize: 13, marginTop: 2, lineHeight: 19 }}>{text}</Text> : null}
      </View>
    </View>
  );
}

export function ListItem({ title, subtitle, right, icon, onPress }: { title: string; subtitle?: string; right?: ReactNode; icon?: IconName; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.li, pressed && { backgroundColor: t.surfaceAlt }]}
    >
      {icon ? (
        <View style={styles.liIcon}>
          <Ionicons name={icon} size={18} color={t.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.body, { fontWeight: '600' }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Muted style={{ fontSize: 13 }} >
            {subtitle}
          </Muted>
        ) : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={t.muted} /> : null}
    </Pressable>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 10 }} />;
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={[styles.card, { flex: 1, minWidth: 140, marginBottom: 0 }]}>
      <Muted style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Muted>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '700', marginTop: 4 }}>{value}</Text>
      {sub ? <Muted style={{ fontSize: 12, marginTop: 2 }}>{sub}</Muted> : null}
    </View>
  );
}

/** Bannière « Données d'exemple » pour toute donnée seed. */
export function DemoBanner({ text }: { text: string }) {
  return (
    <View style={styles.demo} accessibilityRole="text">
      <Ionicons name="flask-outline" size={14} color={t.warning} />
      <Text style={{ color: t.warning, fontSize: 12, fontWeight: '600', flex: 1 }}>{text}</Text>
    </View>
  );
}

export function shadow(level = 1): ViewStyle {
  if (Platform.OS === 'android') return { elevation: level * 2 };
  return {
    shadowColor: '#000',
    shadowOpacity: 0.06 * level,
    shadowRadius: 8 * level,
    shadowOffset: { width: 0, height: 2 * level },
  };
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  inner: { width: '100%', maxWidth: 860, alignSelf: 'center' },
  h1: { color: t.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4, fontFamily: t.displayFont },
  h2: { color: t.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.2, marginBottom: 8 },
  body: { color: t.text, fontSize: 16, lineHeight: 23 },
  muted: { color: t.muted, fontSize: 15, lineHeight: 21 },
  eyebrow: { color: t.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 6 },
  card: {
    backgroundColor: t.surface,
    borderRadius: t.radius,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    ...shadow(1),
  },
  btn: {
    minHeight: 48,
    minWidth: 44,
    paddingHorizontal: 18,
    borderRadius: t.radius - 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnSmall: { minHeight: 44, paddingHorizontal: 14 },
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  label: { color: t.muted, fontSize: 13, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: t.radius - 4,
    paddingHorizontal: 14,
    color: t.text,
    backgroundColor: t.surface,
    fontSize: 16,
  },
  segment: { flexDirection: 'row', backgroundColor: t.surfaceAlt, borderRadius: t.radius - 2, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: t.radius - 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  track: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', ...shadow(1) },
  empty: { alignItems: 'center', padding: 28, borderRadius: t.radius, borderWidth: 1, borderStyle: 'dashed', borderColor: t.border, marginBottom: 12 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: t.radius - 4, marginBottom: 12 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10 },
  liIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.warningBg, marginBottom: 12 },
});
