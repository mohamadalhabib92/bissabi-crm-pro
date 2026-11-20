import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio } from '../src/lib/a11y';
import { applyScheme, currentScheme, theme } from '../src/ui/theme';

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
