/** Rapport de contraste WCAG 2.2 (relatif). AA texte normal ≥ 4.5, grand texte / UI ≥ 3. */
export function contrastRatio(hexA: string, hexB: string): number {
  const L1 = luminance(hexA);
  const L2 = luminance(hexB);
  const h = Math.max(L1, L2);
  const l = Math.min(L1, L2);
  return (h + 0.05) / (l + 0.05);
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
