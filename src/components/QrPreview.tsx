import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { qrPath, swissCrossRect } from '@/lib/qrbill';
import { theme as t } from '@/ui/theme';

/** Aperçu écran du QR suisse (croix 7/46). Le PDF imprime le code à 46 × 46 mm ; l’écran peut être plus petit. */
export function QrPreview({ payload, specimen, size = 160 }: { payload: string; specimen?: boolean; size?: number }) {
  const q = useMemo(() => qrPath(payload), [payload]);
  const n = q.size;
  const { c, o, k } = swissCrossRect(n);
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={specimen ? 'QR-facture suisse, spécimen' : 'QR-facture suisse'}>
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Rect width={n} height={n} fill={t.qrPaper} />
        <Path d={q.d} fill={t.qrInk} />
        <G>
          <Rect x={o} y={o} width={c} height={c} fill={t.qrPaper} />
          <Rect x={o + 2 * k} y={o + 2 * k} width={28 * k} height={28 * k} fill={t.qrInk} />
          <Rect x={o + 13 * k} y={o + 7 * k} width={6 * k} height={18 * k} fill={t.qrPaper} />
          <Rect x={o + 7 * k} y={o + 13 * k} width={18 * k} height={6 * k} fill={t.qrPaper} />
        </G>
      </Svg>
      {specimen ? (
        <View style={{ position: 'absolute', left: -10, right: -10, top: size / 2 - 14, backgroundColor: t.accent, transform: [{ rotate: '-30deg' }], paddingVertical: 4 }}>
          <Text style={{ color: t.text, fontWeight: '800', textAlign: 'center', letterSpacing: 2 }}>SPÉCIMEN</Text>
        </View>
      ) : null}
    </View>
  );
}
