import assert from 'node:assert/strict';
import test from 'node:test';
import { composite, contrastRatio } from '../src/lib/a11y';
import { applyScheme, currentScheme, GLASS_ALPHA, reliefMetrics, theme, WASH_ALPHA } from '../src/ui/theme';

const pairs: [keyof typeof theme, keyof typeof theme][] = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surfaceAlt'], ['muted', 'bg'], ['muted', 'surface'],
  ['primary', 'bg'], ['primary', 'surface'], ['onPrimary', 'primary'], ['onDanger', 'danger'],
  ['danger', 'dangerBg'], ['success', 'successBg'], ['warning', 'warningBg'], ['info', 'infoBg'],
];

for (const s of ['light', 'dark'] as const) {
  test(`contraste AA (${s})`, () => {
    applyScheme(s);
    for (const [fg, bg] of pairs) {
      const r = contrastRatio(String(theme[fg]), String(theme[bg]));
      assert.ok(r >= 4.5, `${s} ${fg}/${bg} = ${r.toFixed(2)}`);
    }
    applyScheme('light');
  });
}

test('mode sombre : QR-facture inchangée (noir sur blanc) et retour au clair', () => {
  applyScheme('dark');
  assert.equal(theme.qrInk, '#000000');
  assert.equal(theme.qrPaper, '#FFFFFF');
  applyScheme('light');
  assert.equal(currentScheme(), 'light');
  assert.equal(theme.bg, '#F7F6F2');
});

test('verre : texte et secondaire AA sur le voile, au-dessus des halos', () => {
  for (const s of ['light', 'dark'] as const) {
    applyScheme(s);
    const backs = [theme.bg, composite(theme.wash, theme.bg, WASH_ALPHA), composite(theme.washAlt, theme.bg, WASH_ALPHA)];
    for (const behind of backs) {
      const glass = composite(theme.surface, behind, GLASS_ALPHA);
      for (const fg of [theme.text, theme.muted]) {
        const r = contrastRatio(fg, glass);
        assert.ok(r >= 4.5, `${s} ${fg} sur ${glass} (fond ${behind}) = ${r.toFixed(2)}`);
      }
    }
  }
  applyScheme('light');
});

test('relief : bouton relâché plus haut, enfoncé plus plat', () => {
  for (const dark of [false, true]) {
    const up = reliefMetrics(false, dark);
    const down = reliefMetrics(true, dark);
    assert.ok(up.radius > down.radius);
    assert.ok(up.offsetY > down.offsetY);
    assert.ok(up.sheen > down.sheen);
    assert.equal(up.sink, 0);
    assert.ok(down.sink >= 2);
    assert.ok(up.keyRadius > down.keyRadius);
  }
});
