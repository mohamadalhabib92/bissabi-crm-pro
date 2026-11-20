/**
 * Thème bissabi-crm-pro — style minimal-luxe (forêt profonde + or discret), clair ou sombre.
 * L’or `accent` est réservé aux liserés : son contraste sur fond clair est insuffisant pour du texte.
 * `muted` est assombri juste assez pour passer AA (4.5) sur `bg` et `surface`.
 * `qrInk` / `qrPaper` sont imposés par la QR-facture (noir sur blanc) — identiques dans les deux modes.
 *
 * `applyScheme()` réécrit `theme` en place ; la racine remonte la navigation (clé = schéma)
 * pour que tous les écrans se redessinent. Toujours lire `theme.x` au rendu, jamais dans une
 * constante de module.
 */
export type Scheme = 'light' | 'dark';

const LIGHT = {
  bg: '#F7F6F2', surface: '#FFFFFF', surfaceAlt: '#EEF1EC', text: '#16211B', muted: '#6A736E',
  primary: '#1A4D2E', onPrimary: '#FFFFFF', onDanger: '#FFFFFF', accent: '#C9A84C', border: '#E2E4DE',
  danger: '#B3261E', dangerBg: '#FBEAE8', success: '#1E7A46', successBg: '#E5F3EA',
  warning: '#8A5A00', warningBg: '#FCF1D9', info: '#1F5B8C', infoBg: '#E6F0F8',
  qrInk: '#000000', qrPaper: '#FFFFFF', shadow: '#000000',
  /** Teinte douce de la marque (halos, pastilles d'icône). */
  primarySoft: '#E3ECE5',
};
/** Sombre : forêt nocturne, encre crème, sauge lumineuse et or adouci (AA vérifié). */
const DARK: typeof LIGHT = {
  bg: '#0D1310', surface: '#151C18', surfaceAlt: '#1D2621', text: '#ECEAE3', muted: '#A3ADA7',
  primary: '#8FCBA6', onPrimary: '#0B1F14', onDanger: '#2B0D0A', accent: '#D6B967', border: '#27322C',
  danger: '#F2897E', dangerBg: '#3A1D19', success: '#7DD3A0', successBg: '#14291D',
  warning: '#E9C46A', warningBg: '#2E2512', info: '#8DB9E6', infoBg: '#13243A',
  qrInk: '#000000', qrPaper: '#FFFFFF', shadow: '#000000',
  primarySoft: '#1B2E23',
};

export const theme = {
  ...LIGHT,
  radius: 16,
  displayFont: undefined as string | undefined,
};
export type Theme = typeof theme;

let current: Scheme = 'light';
export const currentScheme = () => current;
export const isDark = () => current === 'dark';
/** Réécrit les jetons en place (idempotent). */
export function applyScheme(s: Scheme) {
  if (s === current) return;
  current = s;
  Object.assign(theme, s === 'dark' ? DARK : LIGHT);
}

/** Espacements — grille de 8 (4 pour les micro-ajustements). */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
/** Rayons. */
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
/** Échelle typographique (police système : SF Pro sur iOS, Dynamic Type respecté). */
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24 },
  callout: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 13, lineHeight: 18 },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 1.6 },
  /** Montants : chiffres tabulaires. */
  figure: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const, letterSpacing: -0.4, fontVariant: ['tabular-nums' as const] },
};
/** Ombres : voir `shadow()` dans kit.tsx (aucune ombre en sombre — la profondeur vient des surfaces). */
/** Couleur + alpha (hex 6 chiffres). */
export const alpha = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
