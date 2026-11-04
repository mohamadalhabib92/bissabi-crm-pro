/**
 * Mouvement « premium » : ressorts doux, apparitions, squelettes et moments de réussite.
 * Uniquement l'API Animated de React Native (aucune dépendance ajoutée).
 * Respecte « Réduire les animations » (iOS / Android / prefers-reduced-motion sur le web).
 */
import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { haptic, type HapticKind } from './haptics';
import { theme as T } from './theme';

const native = Platform.OS !== 'web';
type IconName = ComponentProps<typeof Ionicons>['name'];

/** Ressorts de référence (cohérents dans toute l'app). */
export const springs = {
  press: { speed: 40, bounciness: 0 },
  release: { speed: 22, bounciness: 8 },
  pop: { speed: 14, bounciness: 12 },
  gentle: { speed: 12, bounciness: 4 },
} as const;

let reduced = false;
void AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => {
    reduced = !!v;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
  reduced = !!v;
});
/** Vrai si l'utilisateur a demandé moins d'animations. */
export const prefersReducedMotion = () => reduced;
export function useReducedMotion() {
  const [r, setR] = useState(reduced);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setR(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setR(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return r;
}

/** Échelle animée au toucher (ressort), à brancher sur onPressIn / onPressOut. */
export function usePressScale(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = useCallback(() => {
    if (reduced) return;
    Animated.spring(scale, { toValue: to, ...springs.press, useNativeDriver: native }).start();
  }, [scale, to]);
  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, ...springs.release, useNativeDriver: native }).start();
  }, [scale]);
  return { scale, onPressIn, onPressOut };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable avec ressort + retour haptique discret. Même API que Pressable, sauf `style`
 * qui accepte aussi une fonction ({ pressed }) comme Pressable.
 */
export function PressableScale({
  style,
  scaleTo = 0.97,
  hapticKind = 'tap',
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  children,
  ...rest
}: Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
  scaleTo?: number;
  hapticKind?: HapticKind | null;
}) {
  const p = usePressScale(scaleTo);
  const [pressed, setPressed] = useState(false);
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        p.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        p.onPressOut();
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (hapticKind) haptic(hapticKind);
        onPress?.(e);
      }}
      style={[resolved, { transform: [{ scale: p.scale }] }]}
    >
      {children as ReactNode}
    </AnimatedPressable>
  );
}

/** Apparition douce : fondu + léger glissement vers le haut (décalable pour les listes). */
export function FadeIn({ children, delay = 0, distance = 10, style }: { children: ReactNode; delay?: number; distance?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    const a = Animated.spring(v, { toValue: 1, delay, ...springs.gentle, useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [v, delay]);
  return (
    <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

/** Bloc squelette : pulsation lente, remplace les indicateurs de chargement. */
export function Skeleton({ w = '100%', h = 14, r = 8, style }: { w?: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const o = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(o, { toValue: 0.55, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View importantForAccessibility="no" style={[{ width: w, height: h, borderRadius: r, backgroundColor: T.surfaceAlt, opacity: o }, style]} />;
}

/** Liste squelette (cartes) — à afficher pendant un chargement. */
export function SkeletonList({ rows = 3, label = 'Chargement…' }: { rows?: number; label?: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[sk.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Skeleton w={40} h={40} r={20} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton w={`${70 - i * 8}%` as `${number}%`} h={14} />
            <Skeleton w="45%" h={12} />
          </View>
        </View>
      ))}
    </View>
  );
}
const sk = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
});

type Celebration = { title: string; subtitle?: string; icon?: IconName; tone?: 'success' | 'gold' };
type Toast = { text: string; tone?: 'success' | 'info' | 'danger'; icon?: IconName };
type FeedbackApi = { celebrate: (c: Celebration) => void; toast: (t: Toast | string) => void; haptic: (k: HapticKind) => void };
const Ctx = createContext<FeedbackApi>({ celebrate: () => {}, toast: () => {}, haptic });
/** `celebrate()` : moment de réussite (pastille animée + haptique). `toast()` : confirmation discrète. */
export const useFeedback = () => useContext(Ctx);

/** À placer une fois près de la racine : affiche les célébrations et confirmations au-dessus de tout. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [cel, setCel] = useState<(Celebration & { k: number }) | null>(null);
  const [tst, setTst] = useState<(Toast & { k: number }) | null>(null);
  const celebrate = useCallback((c: Celebration) => {
    haptic('success');
    setCel({ ...c, k: Date.now() });
  }, []);
  const toast = useCallback((x: Toast | string) => {
    const t2 = typeof x === 'string' ? { text: x } : x;
    haptic(t2.tone === 'danger' ? 'warning' : 'select');
    setTst({ ...t2, k: Date.now() });
  }, []);
  const value = useMemo(() => ({ celebrate, toast, haptic }), [celebrate, toast]);
  const endCel = useCallback(() => setCel(null), []);
  const endTst = useCallback(() => setTst(null), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      {cel ? <CelebrationView key={cel.k} c={cel} onDone={endCel} /> : null}
      {tst ? <ToastView key={tst.k} t={tst} onDone={endTst} /> : null}
    </Ctx.Provider>
  );
}

function CelebrationView({ c, onDone }: { c: Celebration; onDone: () => void }) {
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(c.subtitle ? `${c.title}. ${c.subtitle}` : c.title);
    const seq = Animated.sequence([
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, ...springs.pop, useNativeDriver: native }),
        Animated.timing(ring, { toValue: 1, duration: reduced ? 0 : 700, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      ]),
      Animated.delay(900),
      Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: native }),
    ]);
    seq.start(({ finished }) => finished && onDone());
    return () => seq.stop();
  }, [c, pop, ring, fade, onDone]);
  const accent = c.tone === 'gold' ? T.accent : T.success;
  return (
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, cs.wrap, { opacity: fade }]}>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={`${c.title}. Fermer`} style={[cs.card, { backgroundColor: T.surface, borderColor: T.border }]}>
        <View style={cs.badgeWrap}>
          <Animated.View
            style={[
              cs.ring,
              { borderColor: accent, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.8] }) }] },
            ]}
          />
          <Animated.View style={[cs.badge, { backgroundColor: accent, transform: [{ scale: pop }] }]}>
            <Ionicons name={c.icon ?? 'checkmark'} size={34} color={T.surface} />
          </Animated.View>
        </View>
        <Text style={[cs.title, { color: T.text }]}>{c.title}</Text>
        {c.subtitle ? <Text style={[cs.sub, { color: T.muted }]}>{c.subtitle}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}
const cs = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  card: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 32,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 240,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  badgeWrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  ring: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 3 },
  badge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
});

function ToastView({ t: x, onDone }: { t: Toast; onDone: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(x.text);
    const seq = Animated.sequence([
      Animated.spring(v, { toValue: 1, ...springs.release, useNativeDriver: native }),
      Animated.delay(2200),
      Animated.timing(v, { toValue: 0, duration: 220, useNativeDriver: native }),
    ]);
    seq.start(({ finished }) => finished && onDone());
    return () => seq.stop();
  }, [x, v, onDone]);
  // Pastille inversée (texte sur fond « encre ») : lisible en clair comme en sombre.
  const fg = T.surface;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[ts.wrap, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}
    >
      <View accessibilityRole="alert" style={[ts.pill, { backgroundColor: T.text }]}>
        <Ionicons name={x.icon ?? (x.tone === 'danger' ? 'alert-circle' : 'checkmark-circle')} size={18} color={fg} />
        <Text style={[ts.text, { color: T.surface }]}>{x.text}</Text>
      </View>
    </Animated.View>
  );
}
const ts = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 104, alignItems: 'center', zIndex: 1001 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  text: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
});

/** Respiration lente (attente courte : démarrage, synchronisation) — remplace l'indicateur rotatif. */
export function Breathing({ children, size = 72, color, style }: { children?: ReactNode; size?: number; color: string; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.08] });
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Chargement…" style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color, opacity, transform: [{ scale }] }]} />
      {children}
    </View>
  );
}

/** Barre de progression qui glisse en ressort jusqu'à sa valeur (0–1). */
export function ProgressBar({ value, color, track, height = 8, label, style }: { value: number; color: string; track?: string; height?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(reduced ? value : 0)).current;
  useEffect(() => {
    const c = Math.max(0, Math.min(1, value));
    if (reduced) v.setValue(c);
    else Animated.spring(v, { toValue: c, ...springs.gentle, useNativeDriver: false }).start();
  }, [value, v]);
  const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.max(0, Math.min(1, value)) * 100) }}
      style={[{ height, borderRadius: height / 2, backgroundColor: track ?? T.surfaceAlt, overflow: 'hidden', marginVertical: 10 }, style]}
    >
      <Animated.View style={{ width, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}
