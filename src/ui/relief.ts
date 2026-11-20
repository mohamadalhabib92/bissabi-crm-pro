/**
 * Relief partagé (boutons, cartes, pastilles) : deux ombres empilées,
 * liseré clair en haut, enfoncement au pressé. Les chiffres viennent de `reliefMetrics`.
 */
import { Platform, type ViewStyle } from 'react-native';
import { alpha, currentScheme, reliefMetrics, theme as t } from './theme';

function metrics(pressed: boolean) {
  return reliefMetrics(pressed, currentScheme() === 'dark');
}

/** Ombre portée large (couche du dessous). */
export function ambientShadow(pressed: boolean): ViewStyle {
  const m = metrics(pressed);
  if (Platform.OS === 'android') return { elevation: pressed ? 2 : 8 };
  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: m.offsetY },
    shadowOpacity: m.opacity,
    shadowRadius: m.radius,
  };
}

/** Ombre courte, collée au bord (couche du dessus). */
export function keyShadow(pressed: boolean): ViewStyle {
  const m = metrics(pressed);
  if (Platform.OS === 'android') return {};
  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: m.keyOffsetY },
    shadowOpacity: m.keyOpacity,
    shadowRadius: m.keyRadius,
  };
}

export function sheenColor(pressed: boolean) {
  return alpha(t.veil, metrics(pressed).sheen);
}

export function sinkOffset(pressed: boolean) {
  return metrics(pressed).sink;
}

/** Bord bas plus sombre : le bouton a une épaisseur. */
export function shadeEdge(pressed: boolean) {
  return alpha(t.ink, pressed ? 0.34 : 0.16);
}
