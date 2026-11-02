/**
 * Thème bissabi-crm-pro — style minimal-luxe.
 * Contrastes mesurés (WCAG 2.2) :
 * texte #16211B sur fond #F7F6F2 = 15,3:1 ; primaire #1A4D2E sur blanc = 9,8:1 ;
 * blanc sur primaire = 9,8:1 ; blanc sur danger = 6,5:1 ;
 * warning #8A5A00 / #FCF1D9 = 5,3:1 ; succès = 4,7:1 ; info = 6,2:1 ;
 * secondaire #6B746E sur blanc = 4,8:1 ; sur ivoire #F7F6F2 = 4,47:1 (juste sous 4,5, texte d’appoint) ;
 * or #C9A84C sur ivoire = 2,1:1 — liseré uniquement, jamais du texte fin.
 */
export const theme = {
  bg: '#F7F6F2', surface: '#FFFFFF', surfaceAlt: '#EEF1EC', text: '#16211B', muted: '#6B746E',
  primary: '#1A4D2E', onPrimary: '#FFFFFF', accent: '#C9A84C', border: '#E2E4DE',
  danger: '#B3261E', dangerBg: '#FBEAE8', success: '#1E7A46', successBg: '#E5F3EA',
  warning: '#8A5A00', warningBg: '#FCF1D9', info: '#1F5B8C', infoBg: '#E6F0F8',
  radius: 16,
  displayFont: undefined as string | undefined,
};
export type Theme = typeof theme;
