import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Animated,
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
import { haptic } from './haptics';
import { FadeIn, PressableScale } from './motion';
import { currentScheme, theme as t, type Scheme } from './theme';

const S = () => getStyles();

export type IconName = ComponentProps<typeof Ionicons>['name'];
export { Ionicons };
export { Breathing, FadeIn, PressableScale, ProgressBar, Skeleton, SkeletonList, useFeedback } from './motion';
export { haptic } from './haptics';

/** Conteneur d'écran défilant, largeur max sur desktop (PWA). */
export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const insets = useSafeAreaInsets();
  const inner = (
    <View style={[S().inner, padded && { padding: 20 }, { paddingBottom: 40 + insets.bottom }]}>{children}</View>
  );
  return (
    <View style={S().screen}>
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
    <Text accessibilityRole="header" style={[S().h1, style]}>
      {children}
    </Text>
  );
}
export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[S().h2, style]}>
      {children}
    </Text>
  );
}
export function Body({ children, style, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[S().body, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}
export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[S().muted, style]}>{children}</Text>;
}
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[S().eyebrow, style]}>{children}</Text>;
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [S().card, pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[S().card, style]}>{children}</View>;
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
  const fg = { primary: t.onPrimary, secondary: t.text, ghost: t.primary, danger: t.onDanger }[variant];
  const off = disabled || loading;
  return (
    <PressableScale
      onPress={off ? undefined : onPress}
      disabled={!!off}
      hapticKind={variant === 'danger' ? 'warning' : 'tap'}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      hitSlop={6}
      style={({ pressed }) => [
        S().btn,
        small && S().btnSmall,
        { backgroundColor: bg },
        variant === 'ghost' && { borderWidth: 1, borderColor: t.border },
        pressed && !off && { opacity: 0.9 },
        off && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[S().btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({ icon, onPress, label, color = t.text, size = 22 }: { icon: IconName; onPress: () => void; label: string; color?: string; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [S().iconBtn, pressed && { backgroundColor: t.surfaceAlt }]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const c = color ?? t.primary;
  return (
    <PressableScale
      hapticKind="select"
      scaleTo={0.95}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        S().chip,
        { borderColor: active ? c : t.border, backgroundColor: active ? c : 'transparent' },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={{ color: active ? t.onPrimary : t.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </PressableScale>
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
    <View style={[S().badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={S().label}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        style={[S().input, props.multiline && { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }, focused && !error ? { borderColor: t.primary, borderWidth: 1.5 } : null, error ? { borderColor: t.danger } : null, style]}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
      />
      {error ? <Text style={{ color: t.danger, marginTop: 4, fontSize: 13 }}>{error}</Text> : hint ? <Muted style={{ marginTop: 4, fontSize: 13 }}>{hint}</Muted> : null}
    </View>
  );
}

/** Sélecteur segmenté (ex. TVA Oui / Non). */
export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={S().label}>{label}</Text> : null}
      <View style={S().segment} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => {
                if (!on) haptic('select');
                onChange(o.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[S().segItem, on && { backgroundColor: t.surface, ...shadow(1) }]}
            >
              <Text style={{ color: on ? t.text : t.muted, fontWeight: on ? '700' : '500', fontSize: 14 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Interrupteur à ressort (le pouce glisse, la piste se teinte). */
function SpringSwitch({ on }: { on: boolean }) {
  const x = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: on ? 1 : 0, speed: 20, bounciness: 6, useNativeDriver: false }).start();
  }, [on, x]);
  const bg = x.interpolate({ inputRange: [0, 1], outputRange: [t.border, t.primary] });
  const tx = x.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
  return (
    <Animated.View style={[S().track, { backgroundColor: bg }]}>
      <Animated.View style={[S().thumb, { transform: [{ translateX: tx }] }]} />
    </Animated.View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 12 }}
    >
      <View style={{ flex: 1 }}>
        <Body>{label}</Body>
        {hint ? <Muted style={{ fontSize: 13 }}>{hint}</Muted> : null}
      </View>
      <SpringSwitch on={value} />
    </Pressable>
  );
}

export function Empty({ icon = 'sparkles-outline', title, text, action }: { icon?: IconName; title: string; text?: string; action?: ReactNode }) {
  return (
    <FadeIn>
      <View style={S().empty}>
        <View style={S().emptyHalo}>
          <View style={S().emptyIcon}>
            <Ionicons name={icon} size={30} color={t.primary} />
          </View>
        </View>
        <Text accessibilityRole="header" style={[S().h2, { textAlign: 'center', marginBottom: 8 }]}>{title}</Text>
        {text ? <Muted style={{ textAlign: 'center', marginBottom: 16, maxWidth: 360 }}>{text}</Muted> : null}
        {action}
      </View>
    </FadeIn>
  );
}

export function Notice({ tone = 'info', title, text, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; title: string; text?: string; icon?: IconName }) {
  const map = { info: [t.infoBg, t.info], warning: [t.warningBg, t.warning], danger: [t.dangerBg, t.danger], success: [t.successBg, t.success] } as const;
  const [bg, fg] = map[tone];
  const ic: IconName = icon ?? ({ info: 'information-circle', warning: 'warning', danger: 'alert-circle', success: 'checkmark-circle' } as const)[tone];
  return (
    <View style={[S().notice, { backgroundColor: bg }]} accessibilityRole="alert">
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
      style={({ pressed }) => [S().li, pressed && { backgroundColor: t.surfaceAlt }]}
    >
      {icon ? (
        <View style={S().liIcon}>
          <Ionicons name={icon} size={18} color={t.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[S().body, { fontWeight: '600' }]} numberOfLines={1}>
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
    <View accessible accessibilityLabel={sub ? `${label} : ${value}. ${sub}` : `${label} : ${value}`} style={[S().card, { flex: 1, minWidth: 140, marginBottom: 0, alignSelf: 'stretch' }]}>
      <Muted style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Muted>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.4, marginTop: 6, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {sub ? <Muted style={{ fontSize: 12, marginTop: 2 }}>{sub}</Muted> : null}
    </View>
  );
}

/** Bannière « Données d'exemple » pour toute donnée seed. */
export function DemoBanner({ text }: { text: string }) {
  return (
    <View style={S().demo} accessibilityRole="text">
      <Ionicons name="flask-outline" size={14} color={t.warning} />
      <Text style={{ color: t.warning, fontSize: 12, fontWeight: '600', flex: 1 }}>{text}</Text>
    </View>
  );
}

export function shadow(level = 1): ViewStyle {
  if (currentScheme() === 'dark') return {};
  if (Platform.OS === 'android') return { elevation: level * 2 };
  return {
    shadowColor: t.shadow,
    shadowOpacity: 0.06 * level,
    shadowRadius: 8 * level,
    shadowOffset: { width: 0, height: 2 * level },
  };
}

function makeStyles() {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  inner: { width: '100%', maxWidth: 860, alignSelf: 'center' },
  h1: { color: t.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4, fontFamily: t.displayFont },
  h2: { color: t.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.2, marginBottom: 8 },
  body: { color: t.text, fontSize: 16, lineHeight: 23 },
  muted: { color: t.muted, fontSize: 15, lineHeight: 21 },
  eyebrow: { color: t.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 6, borderBottomWidth: 2, borderBottomColor: t.accent, alignSelf: 'flex-start', paddingBottom: 2 },
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
  thumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: t.qrPaper, ...shadow(1) },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, borderRadius: t.radius + 4, backgroundColor: t.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border, marginBottom: 16 },
  emptyHalo: { width: 96, height: 96, borderRadius: 48, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', ...shadow(1) },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: t.radius - 4, marginBottom: 12 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10 },
  liIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.warningBg, marginBottom: 12 },
  });
}
type Styles = ReturnType<typeof makeStyles>;
const cache: Partial<Record<Scheme, Styles>> = {};
/** Styles du kit, recalculés une fois par schéma (clair / sombre). */
export const getStyles = (): Styles => (cache[currentScheme()] ??= makeStyles());
/** Compatibilité : `styles.x` lit toujours la version du schéma courant. */
export const styles = new Proxy({} as Styles, { get: (_o, k: string) => getStyles()[k as keyof Styles] });
