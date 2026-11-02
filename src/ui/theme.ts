/**
 * Thème bissabi-crm-pro — style minimal-luxe.
 * L’or `accent` est réservé aux liserés : son contraste sur fond clair est insuffisant pour du texte.
 * `muted` est assombri juste assez pour passer AA (4.5) sur `bg` et `surface`.
 * `qrInk` / `qrPaper` sont imposés par la QR-facture (noir sur blanc).
 */
export const theme = {
  bg: '#F7F6F2', surface: '#FFFFFF', surfaceAlt: '#EEF1EC', text: '#16211B', muted: '#6A736E',
  primary: '#1A4D2E', onPrimary: '#FFFFFF', onDanger: '#FFFFFF', accent: '#C9A84C', border: '#E2E4DE',
  danger: '#B3261E', dangerBg: '#FBEAE8', success: '#1E7A46', successBg: '#E5F3EA',
  warning: '#8A5A00', warningBg: '#FCF1D9', info: '#1F5B8C', infoBg: '#E6F0F8',
  qrInk: '#000000', qrPaper: '#FFFFFF', shadow: '#000000',
  radius: 16,
  displayFont: undefined as string | undefined,
};
export type Theme = typeof theme;
