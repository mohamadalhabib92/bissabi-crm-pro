import assert from 'node:assert/strict';
import { test } from 'node:test';
import { macLimitMessage } from '../src/lib/macLimits';
import { bindSearchFocus, requestSearchFocus, resetSearchFocus } from '../src/lib/searchFocus';
import { MAC_SIDEBAR_MIN, MAC_TYPE_SCALE, PAD_SIDEBAR_MIN, PHONE_COLUMN, shellMetrics, WIDE_COLUMN } from '../src/lib/shell';

test('l’iPhone, même large en paysage, garde la colonne actuelle', () => {
  const phone = shellMetrics({ width: 932, pad: false, mac: false, web: false });
  assert.equal(phone.wide, false);
  assert.equal(phone.sidebar, false);
  assert.equal(phone.contentMax, PHONE_COLUMN);
  assert.equal(phone.listSpread, false);
  assert.equal(phone.typeScale, 1);
  assert.equal(phone.keyboard, false);
  assert.equal(PHONE_COLUMN, 860);
});

test('le Mac ouvre la barre latérale dès 900 pt, avec une colonne de 1040 et une typo un peu plus grande', () => {
  const narrow = shellMetrics({ width: 899, pad: true, mac: true, web: false });
  assert.equal(narrow.sidebar, false);
  assert.equal(narrow.wide, false);
  assert.equal(narrow.contentMax, PHONE_COLUMN);
  assert.equal(narrow.typeScale, MAC_TYPE_SCALE);
  assert.equal(narrow.keyboard, true);
  const wide = shellMetrics({ width: MAC_SIDEBAR_MIN, pad: true, mac: true, web: false });
  assert.equal(wide.sidebar, true);
  assert.equal(wide.wide, true);
  assert.equal(wide.contentMax, WIDE_COLUMN);
  assert.equal(wide.listSpread, true);
  assert.equal(WIDE_COLUMN, 1040);
  assert.equal(MAC_SIDEBAR_MIN, 900);
  assert.equal(MAC_TYPE_SCALE, 1.12);
});

test('l’iPad ouvre la barre latérale à 1024 pt, sans grossir la typo ni activer le clavier Mac', () => {
  const portrait = shellMetrics({ width: 1023, pad: true, mac: false, web: false });
  assert.equal(portrait.sidebar, false);
  assert.equal(portrait.contentMax, PHONE_COLUMN);
  assert.equal(portrait.listSpread, false);
  const landscape = shellMetrics({ width: PAD_SIDEBAR_MIN, pad: true, mac: false, web: false });
  assert.equal(landscape.sidebar, true);
  assert.equal(landscape.contentMax, WIDE_COLUMN);
  assert.equal(landscape.listSpread, true);
  assert.equal(landscape.typeScale, 1);
  assert.equal(landscape.keyboard, false);
  assert.equal(PAD_SIDEBAR_MIN, 1024);
});

test('une fenêtre web large suit le seuil Mac, une fenêtre étroite reste une colonne', () => {
  const wide = shellMetrics({ width: 1280, pad: false, mac: false, web: true });
  assert.equal(wide.sidebar, true);
  assert.equal(wide.keyboard, true);
  assert.equal(wide.typeScale, 1);
  assert.equal(wide.contentMax, WIDE_COLUMN);
  const narrow = shellMetrics({ width: 700, pad: false, mac: false, web: true });
  assert.equal(narrow.sidebar, false);
  assert.equal(narrow.contentMax, PHONE_COLUMN);
  assert.equal(narrow.keyboard, false);
});

test('sur Mac, l’haptique ne dit rien ; impression, fichiers et téléphonie ont un message', () => {
  assert.equal(macLimitMessage('haptics'), null);
  for (const feature of ['print', 'documentPicker', 'telephony'] as const) {
    const message = macLimitMessage(feature);
    assert.equal(typeof message, 'string');
    assert.ok(message && message.length > 20);
  }
});

test('⌘F cible le champ déjà monté, sinon le prochain écran Comptes', async () => {
  resetSearchFocus();
  assert.equal(requestSearchFocus(), false);
  let hits = 0;
  const stop = bindSearchFocus(() => {
    hits += 1;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(hits, 1);
  assert.equal(requestSearchFocus(), true);
  assert.equal(hits, 2);
  stop();
  assert.equal(requestSearchFocus(), false);
  resetSearchFocus();
});
