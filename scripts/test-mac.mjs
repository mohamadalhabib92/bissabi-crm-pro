/**
 * iOS sur Mac : même bundle, même build, mêmes clés. iPad activé, capacités compatibles.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
assert(app.ios.supportsTablet === true, 'supportsTablet');
assert(app.ios.requireFullScreen === false, 'fenêtre redimensionnable');
assert(app.ios.bundleIdentifier === 'com.vibecode.bissabicrmpro-h7qq2g', 'bundle');
assert(app.ios.buildNumber === '2', 'build iPhone');
assert(app.android.package === 'ch.bissabi.bissabicrmpro', 'package Android');
assert(app.android.versionCode === 2, 'versionCode');
assert(app.version === '1.0.1', 'version');
assert(app.extra.eas.projectId === 'dcf8624c-52fa-4862-8f7a-10858db2056d', 'projet Expo');
assert(app.ios.infoPlist.UIApplicationSupportsIndirectInputEvents === true, 'pointeur');
assert(!app.ios.infoPlist.UIRequiredDeviceCapabilities, 'app.json n’exige pas de capacité incompatible');
assert(Array.isArray(app.ios.infoPlist['UISupportedInterfaceOrientations~ipad']), 'orientations iPad');
assert(app.ios.infoPlist['UISupportedInterfaceOrientations~ipad'].length === 4, 'iPad aux quatre orientations');
const plugins = (app.plugins || []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
assert(plugins.includes('./plugins/with-mac-ipad.js'), 'plugin Mac');
assert(plugins.includes('expo-router'), 'expo-router conservé');

const storage = readFileSync(path.join(root, 'src/lib/storage.ts'), 'utf8');
assert(storage.includes("export const STORAGE_PREFIX = '@bissabi-crm-pro/';"), 'préfixe de stockage');
const migrate = readFileSync(path.join(root, 'src/lib/migrate.ts'), 'utf8');
assert(/export const SCHEMA_VERSION = 2;/.test(migrate), 'schéma inchangé');
assert(migrate.includes("'accounts', 'offers', 'invoices', 'expenses', 'company', 'products', 'counters'"), 'clés métier');
const numbering = readFileSync(path.join(root, 'src/lib/numbering.ts'), 'utf8');
assert(numbering.includes('export function nextSerial'), 'numérotation');
assert(numbering.includes("Installation neuve : FA-AAAA-0001"), 'série facture');

const { macCompatiblePlist, MAC_BLOCKED_CAPABILITIES, IPAD_ORIENTATIONS } = require('../plugins/with-mac-ipad.js');
const plist = macCompatiblePlist({
  UIRequiredDeviceCapabilities: ['armv7', 'arm64', 'telephony'],
  UIRequiresFullScreen: true,
  CFBundleName: 'Bissabi CRM Pro',
});
assert(!plist.UIRequiredDeviceCapabilities.includes('armv7'), 'armv7 retiré');
assert(!plist.UIRequiredDeviceCapabilities.includes('telephony'), 'telephony retiré');
assert(plist.UIRequiredDeviceCapabilities.includes('arm64'), 'arm64 conservé');
assert(plist.UIRequiresFullScreen === false, 'plein écran non exigé');
assert(plist.UIApplicationSupportsIndirectInputEvents === true, 'événements indirects');
assert(plist.CFBundleName === 'Bissabi CRM Pro', 'le reste du plist reste');
assert(plist['UISupportedInterfaceOrientations~ipad'].length === 4, 'orientations');
for (const blocked of ['gps', 'sms', 'wifi', 'microphone']) {
  assert(MAC_BLOCKED_CAPABILITIES.includes(blocked), blocked);
}
assert(IPAD_ORIENTATIONS.includes('UIInterfaceOrientationLandscapeLeft'), 'paysage');
const emptied = macCompatiblePlist({ UIRequiredDeviceCapabilities: ['armv7'] });
assert(!('UIRequiredDeviceCapabilities' in emptied), 'liste vide retirée');

for (const file of ['src/ui/haptics.native.ts', 'src/lib/print.ts', 'src/lib/pickFile.ts', 'src/app/(tabs)/telephonie/_layout.tsx']) {
  assert(readFileSync(path.join(root, file), 'utf8').includes('isIosAppOnMac'), `${file} garde Mac`);
}
assert(readFileSync(path.join(root, 'src/lib/mac.ts'), 'utf8').includes('export function isIosAppOnMac'), 'helper');
assert(readFileSync(path.join(root, 'modules/crm-mac/ios/CrmMacModule.swift'), 'utf8').includes('ProcessInfo.processInfo.isiOSAppOnMac'), 'module natif');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
assert(pkg.dependencies['crm-mac'] === 'file:./modules/crm-mac', 'module local');
assert(pkg.scripts['test-mac'], 'script test-mac');

console.log('mac checks ok');
