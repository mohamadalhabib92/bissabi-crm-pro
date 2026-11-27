/**
 * Mise en page iPhone / iPad / Mac.
 * L’iPhone (même en paysage) garde la colonne actuelle. Une fenêtre large
 * plafonne le texte à 1040 pt. La barre latérale s’ouvre à 900 pt sur Mac
 * et sur le web, à 1024 pt sur iPad.
 */
export const PHONE_COLUMN = 860;
export const WIDE_COLUMN = 1040;
export const MAC_SIDEBAR_MIN = 900;
export const PAD_SIDEBAR_MIN = 1024;
export const MAC_TYPE_SCALE = 1.12;
export const SIDEBAR_WIDTH = 248;

export type ShellInput = {
  width: number;
  pad: boolean;
  mac: boolean;
  web: boolean;
};

export type ShellMetrics = {
  /** Colonne de lecture à 1040 pt. */
  wide: boolean;
  sidebar: boolean;
  contentMax: number;
  /** Listes de clients et de pièces : elles prennent la largeur du volet, au-delà de 1040 pt. */
  listSpread: boolean;
  typeScale: number;
  keyboard: boolean;
};

export function shellMetrics(input: ShellInput): ShellMetrics {
  const desktop = input.pad || input.mac || input.web;
  if (!desktop) {
    return {
      wide: false,
      sidebar: false,
      contentMax: PHONE_COLUMN,
      listSpread: false,
      typeScale: 1,
      keyboard: false,
    };
  }
  const breakpoint = input.mac || input.web ? MAC_SIDEBAR_MIN : PAD_SIDEBAR_MIN;
  const wide = input.width >= breakpoint;
  return {
    wide,
    sidebar: wide,
    contentMax: wide ? WIDE_COLUMN : PHONE_COLUMN,
    listSpread: wide,
    typeScale: input.mac ? MAC_TYPE_SCALE : 1,
    keyboard: input.mac || (input.web && wide),
  };
}
