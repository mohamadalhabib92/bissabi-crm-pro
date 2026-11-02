import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import jsQR from 'jsqr';
import { contrastRatio } from '../src/lib/a11y';
import { applyBissabiImport } from '../src/lib/bissabiImport';
import { decryptBackup, encryptBackup, fullCsv } from '../src/lib/backup';
import { postSentry, shouldReportRemote } from '../src/lib/crashReport';
import { invoiceHtml } from '../src/lib/documents';
import { env } from '../src/lib/config';
import { isQrIban, isValidIban, isValidScor, scorReference } from '../src/lib/iban';
import {
  applyReset,
  applyRestore,
  applySchemaMigration,
  describeRollback,
  entityCounts,
  loadAndMigrate,
  pruneBackups,
  rollbackMigration,
  SCHEMA_VERSION,
  stripDemo,
  STORE_KEYS,
  type Kv,
  type Store,
  type StoreKey,
} from '../src/lib/migrate';
import { DEFAULT_COMPANY, coerceInvoiceStatus, isDemo, type Account, type Expense, type Invoice, type Offer } from '../src/lib/model';
import { nextSerial, raiseCounters } from '../src/lib/numbering';
import { commitIfHydrated, continueOffline, planDiskWrites, recordWriteOutcome, resetHydrationForTests, shouldPersist, storageHydrated } from '../src/lib/persistGate';
import { buildQrBill, QR_PRINT_MM, qrMatrix, qrSvg, swissCrossRect } from '../src/lib/qrbill';
import { theme } from '../src/ui/theme';
import { vatCSV } from '../src/lib/vatExport';

const root = join(import.meta.dirname, '..');

function memoryKv(initial: Record<string, string> = {}): Kv & { data: Record<string, string>; sets: string[] } {
  const data = { ...initial };
  const sets: string[] = [];
  return {
    data,
    sets,
    async get(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async set(key, value) {
      sets.push(key);
      data[key] = value;
    },
  };
}

function account(partial: Partial<Account> & Pick<Account, 'id' | 'nom'>): Account {
  return {
    type: 'HORECA', etape: 'client_actif', canton: 'VD', ville: 'Lausanne', adresse: 'Rue du Lac 4', npa: '1003',
    livraison_ok: true, mode_logistique: 'Livraison Bissabi', contact_nom: 'Alex Martin', contact_role: 'Gérant',
    contact_email: 'alex@example.ch', contact_tel: '', prochaine_action: '', prochaine_action_date: '', notes: '',
    source: 'carnet', createdAt: '2025-01-15T00:00:00.000Z',
    ...partial,
  };
}

function invoice(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'number'>): Invoice {
  return {
    accountId: 'a-real', date: '2025-06-02', dueDate: '2025-07-02',
    lines: [{ id: 'l1', description: 'Bissabi Red 25cl', qty: 24, unitPrice: 2.5 }],
    vat: { apply: false, rate: 2.6 }, status: 'paid', paidAt: '2025-06-20', notes: '',
    ...partial,
  };
}

test('préfixe de stockage inchangé', () => {
  assert.match(readFileSync(join(root, 'src/lib/storage.ts'), 'utf8'), /export const STORAGE_PREFIX = '@bissabi-crm-pro\/';/);
  const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as { expo: { ios: { bundleIdentifier: string }; experiments: { baseUrl: string }; android: { package: string } } };
  assert.equal(app.expo.ios.bundleIdentifier, 'com.vibecode.bissabicrmpro-h7qq2g');
  assert.equal(app.expo.experiments.baseUrl, '/bissabi-crm-pro');
  assert.equal(app.expo.android.package, 'ch.bissabi.bissabicrmpro');
});

test('aucun « Fruits de Martigny », aucun EXAMPLE env, pas de fetch au démarrage', () => {
  const skip = new Set(['node_modules', '.git', 'dist', '.expo', 'tests']);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs|json|md|html|css)$/.test(name)) {
        const text = readFileSync(p, 'utf8');
        if (text.includes('Fruits de Martigny')) hits.push(p);
      }
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
  const envExample = readFileSync(join(root, '.env.example'), 'utf8');
  assert.equal(env('EXPO_PUBLIC_EXAMPLE_ENV_VAR', undefined).configured, false);
  assert.doesNotMatch(envExample, /^EXPO_PUBLIC_EXAMPLE_ENV_VAR=/m);
  for (const file of ['src/app/_layout.tsx', 'src/lib/data.tsx', 'src/lib/backend.ts', 'src/lib/migrate.ts']) {
    assert.doesNotMatch(readFileSync(join(root, file), 'utf8'), /fetch\(/);
  }
  assert.equal(shouldReportRemote(null), false);
  assert.equal(shouldReportRemote('YOUR_SENTRY_DSN'), false);
  assert.equal(env('EXPO_PUBLIC_SENTRY_DSN', 'YOUR_SENTRY_DSN').value, null);
});

test('Sentry ne part pas sans DSN réel', async () => {
  let calls = 0;
  await postSentry(null, new Error('x'), (() => {
    calls += 1;
    return Promise.resolve(new Response());
  }) as typeof fetch);
  await postSentry('YOUR_SENTRY_DSN', new Error('x'), (() => {
    calls += 1;
    return Promise.resolve(new Response());
  }) as typeof fetch);
  assert.equal(calls, 0);
});

test('contraste AA des tokens de texte', () => {
  assert.ok(contrastRatio(theme.text, theme.bg) >= 4.5);
  assert.ok(contrastRatio(theme.text, theme.surface) >= 4.5);
  assert.ok(contrastRatio(theme.muted, theme.bg) >= 4.5);
  assert.ok(contrastRatio(theme.muted, theme.surface) >= 4.5);
  assert.ok(contrastRatio(theme.primary, theme.bg) >= 4.5);
  assert.ok(contrastRatio(theme.onPrimary, theme.primary) >= 4.5);
  assert.ok(contrastRatio(theme.text, theme.accent) >= 4.5);
  assert.ok(contrastRatio(theme.accent, theme.bg) < 4.5);
});

test('numérotation continue sans réécrire les numéros existants', () => {
  const numbers = ['FA-2026-007', 'FA-DEMO-001', '2024-15'];
  const first = nextSerial({ prefix: 'FA', year: 2026, numbers, counters: { 'FA-2026': 7 } });
  assert.equal(first.number, 'FA-2026-0008');
  const second = nextSerial({ prefix: 'FA', year: 2026, numbers: [...numbers, first.number], counters: first.counters });
  assert.equal(second.number, 'FA-2026-0009');
  const bare = nextSerial({ prefix: 'FA', year: 2026, numbers: ['2026-0007'], counters: {} });
  assert.equal(bare.number, '2026-0008');
  const mixed = nextSerial({ prefix: 'FA', year: 2026, numbers: ['FA-2026-003', '2026-0009'], counters: {} });
  assert.equal(mixed.number, 'FA-2026-0010');
  const kept = raiseCounters({ invoices: ['FA-2025-014'], offers: [], creditNotes: [], counters: { 'FA-2025': 20 } });
  assert.equal(kept['FA-2025'], 20);
  assert.equal(isValidScor(scorReference('FA-2026-0008')), true);
  assert.equal(isQrIban('CHXX30000TEST'), true);
  assert.equal(isQrIban('CHXX29999TEST'), false);
  assert.equal(isValidIban('YOUR_SWISS_IBAN'), false);
});

test('migration additive : 0 perte, numéros et justificatifs intacts', async () => {
  const accounts: Account[] = [
    account({ id: 'a-real', nom: 'Café du Lac', ext: 'acc:cafe-du-lac|lausanne' }),
    account({ id: 'demo-a1', nom: 'Café Exemple (démo)', demo: true, ville: 'Montreux' }),
  ];
  (accounts[0] as Account & { noteInterne: string }).noteInterne = 'à garder';
  const invoices: Invoice[] = [
    invoice({ id: 'i-real', number: 'FA-2025-014', accountId: 'a-real' }),
    invoice({ id: 'i-bare', number: '2026-0007', accountId: 'a-real', status: 'sent', paidAt: undefined, date: '2026-02-01', dueDate: '2026-03-01' }),
    invoice({ id: 'demo-i1', number: 'FA-DEMO-001', accountId: 'demo-a1', demo: true, status: 'sent', paidAt: undefined }),
  ];
  const expenses: Expense[] = [{
    id: 'e-real', date: '2026-01-20', category: 'Transport & livraison', supplier: 'Transporteur exemple',
    description: 'Tournée Lausanne', amountTTC: 86.4, vatAmount: 0,
    attachment: { name: 'recu-tournee.pdf', uri: 'file://justificatifs/recu-tournee.pdf', persisted: true },
    ext: 'exp:recu-1',
  }];
  const offers: Offer[] = [{
    id: 'o-real', number: 'OF-2026-004', accountId: 'a-real', date: '2026-01-10', validUntil: '2026-02-10',
    lines: invoices[0].lines, vat: { apply: false, rate: 8.1 }, status: 'sent', notes: '',
  }];
  const before = {
    accounts: accounts.length, invoices: invoices.length, expenses: expenses.length, offers: offers.length,
    numbers: invoices.map((i) => i.number),
    uri: expenses[0].attachment?.uri,
  };
  const company = { ...DEFAULT_COMPANY, iban: 'YOUR_SWISS_IBAN', email: 'info@bissabi.ch' };
  delete (company as { vatNumber?: string }).vatNumber;
  const rawInvoices = JSON.stringify(invoices);
  const rawAccounts = JSON.stringify(accounts);
  const rawExpenses = JSON.stringify(expenses);
  const kv = memoryKv({
    accounts: rawAccounts,
    invoices: rawInvoices,
    expenses: rawExpenses,
    offers: JSON.stringify(offers),
    products: JSON.stringify([{ id: 'p1', ref: 'BIS-RED-25', nom: 'Bissabi Red 25cl', description: '', format: '25 cl', prix: 2.5, unite: 'bouteille', canal: 'B2B', tvaTaux: 0, source: 'catalogue' }]),
    company: JSON.stringify(company),
    counters: JSON.stringify({ 'FA-2025': 10 }),
  });
  const loaded = await loadAndMigrate(kv, '2026-04-01T08:00:00.000Z');
  assert.ok(!('error' in loaded));
  if ('error' in loaded) return;
  const store = loaded.store;
  assert.deepEqual(entityCounts(store), { accounts: 2, offers: 1, invoices: 3, expenses: 1, products: 1, creditNotes: 0 });
  assert.deepEqual(store.invoices.map((i) => i.number), before.numbers);
  assert.equal(store.expenses[0].attachment?.uri, before.uri);
  assert.equal(isDemo(store.accounts[0]), false);
  assert.equal(isDemo(store.accounts[1]), true);
  assert.equal((store.accounts[0] as Account & { noteInterne?: string }).noteInterne, 'à garder');
  assert.equal(store.company.iban, 'YOUR_SWISS_IBAN');
  assert.equal(store.company.uid, 'CHE-332.255.936');
  assert.equal(store.company.vatNumber, 'YOUR_VAT_NUMBER');
  assert.equal(store.counters['FA-2025'], 14);
  assert.equal(store.counters['INV-2026'], 7);
  assert.equal(kv.data.invoices, rawInvoices);
  assert.equal(kv.data.accounts, rawAccounts);
  assert.equal(kv.data.expenses, rawExpenses);
  assert.ok(kv.sets.includes('schemaVersion'));
  assert.ok(!kv.sets.includes('invoices'));
  const setsAfterFirst = kv.sets.length;
  const again = await loadAndMigrate(kv, '2026-04-01T09:00:00.000Z');
  assert.ok(!('error' in again));
  assert.equal(kv.sets.length, setsAfterFirst);
  if (!('error' in again)) assert.equal(again.store.backups.filter((b) => b.reason === 'pre-migration').length, 1);

  const kept = stripDemo(store);
  assert.equal(kept.accounts.length, 1);
  assert.equal(kept.invoices.length, 2);
  assert.equal(kept.expenses.length, 1);
  assert.equal(kept.invoices.find((i) => i.id === 'i-real')?.number, 'FA-2025-014');

  const rolled = rollbackMigration(store, '2026-04-02T00:00:00.000Z');
  assert.equal(rolled.ok, true);
  if (!rolled.ok) return;
  assert.deepEqual(rolled.store.invoices.map((i) => i.number), before.numbers);
  assert.equal(rolled.store.expenses[0].attachment?.uri, before.uri);
  assert.equal(entityCounts(rolled.store).invoices, before.invoices);
  assert.ok(rolled.store.audit.length > store.audit.length);
  assert.equal(rolled.store.schemaVersion, SCHEMA_VERSION);
});

test('installation vide : démo en mémoire seulement ; clé partielle : aucune démo injectée', async () => {
  const empty = memoryKv();
  const seeded = await loadAndMigrate(empty, '2026-04-01T00:00:00.000Z');
  assert.ok(!('error' in seeded));
  if ('error' in seeded) return;
  assert.equal(seeded.persisted, false);
  assert.equal(empty.sets.length, 0);
  assert.ok(seeded.store.accounts.length > 0);
  assert.ok(seeded.store.accounts.every((a) => a.demo === true));

  const real = [invoice({ id: 'i-real', number: 'FA-2025-014' })];
  const raw = JSON.stringify(real);
  const partial = memoryKv({ invoices: raw });
  const loaded = await loadAndMigrate(partial, '2026-04-01T00:00:00.000Z');
  assert.ok(!('error' in loaded));
  if ('error' in loaded) return;
  assert.equal(loaded.store.accounts.length, 0);
  assert.equal(loaded.store.invoices[0].number, 'FA-2025-014');
  assert.equal(loaded.store.invoices[0].demo, undefined);
  assert.equal(partial.data.invoices, raw);
});

test('migration illisible : aucune réécriture', async () => {
  const kv = memoryKv({ invoices: '{pas du json', accounts: '[]' });
  const res = await loadAndMigrate(kv, '2026-04-01T00:00:00.000Z');
  assert.ok('error' in res);
  assert.deepEqual(kv.sets, []);
  assert.equal(kv.data.invoices, '{pas du json');
});

test('import Bissabi idempotent et démo non mélangée au CSV TVA', () => {
  const state: Parameters<typeof applyBissabiImport>[0] = {
    accounts: [], invoices: [], expenses: [], products: [], company: { ...DEFAULT_COMPANY },
  };
  const header = 'nom;type;etape;canton;ville;livraison_ok;mode_logistique;contact_nom;contact_role;contact_email;contact_tel;prochaine_action;prochaine_action_date;notes;source';
  const row = 'Café du Port;HORECA;Client actif;VD;Vevey;true;Livraison Bissabi;Sam;Gérant;sam@example.ch;;;2026-05-01;Carnet;Visite';
  const files = [{ name: 'accounts.csv', text: `${header}\n${row}` }];
  const once = applyBissabiImport(state, files);
  const twice = applyBissabiImport(once.next, files);
  assert.equal(once.report.added.comptes, 1);
  assert.equal(twice.report.added.comptes, 0);
  assert.equal(twice.report.skipped.comptes, 1);
  assert.equal(twice.next.accounts.length, 1);
  assert.equal(isDemo(twice.next.accounts[0]), false);
  const csv = vatCSV([
    invoice({ id: 'i-real', number: 'FA-2025-014', status: 'sent', paidAt: undefined }),
    invoice({ id: 'demo-i1', number: 'FA-DEMO-001', demo: true, status: 'sent', paidAt: undefined }),
  ], [account({ id: 'a-real', nom: 'Café du Lac' })]);
  assert.match(csv, /FA-2025-014/);
  assert.doesNotMatch(csv, /FA-DEMO-001/);
  const store = {
    accounts: twice.next.accounts,
    offers: [] as Offer[],
    invoices: [invoice({ id: 'i-real', number: 'FA-2025-014' }), invoice({ id: 'demo-i1', number: 'FA-DEMO-001', demo: true })],
    expenses: [] as Expense[],
    company: DEFAULT_COMPANY,
    products: twice.next.products,
    counters: {},
    creditNotes: [],
    audit: [],
    backups: [],
    schemaVersion: SCHEMA_VERSION,
  } satisfies Store;
  const full = fullCsv(store);
  assert.match(full, /Café du Port/);
  assert.doesNotMatch(full, /FA-DEMO-001/);
});

test('QR 46 mm, payload décodé, SPÉCIMEN et TVA masquée', () => {
  const acc = account({ id: 'a-real', nom: 'Café du Lac' });
  const inv = invoice({ id: 'i-real', number: 'FA-2026-0008', status: 'issued', paidAt: undefined });
  const bill = buildQrBill(DEFAULT_COMPANY, acc, inv, 60);
  assert.equal(bill.ibanStatus, 'placeholder');
  assert.match(bill.payload, /YOUR_SWISS_IBAN/);
  assert.equal(bill.referenceType, 'SCOR');
  assert.equal(bill.message, 'Facture n° FA-2026-0008');
  const { size } = qrMatrix(bill.payload);
  assert.ok(Math.abs(swissCrossRect(size).c / size - 7 / 46) < 1e-12);
  assert.equal(swissCrossRect(QR_PRINT_MM).c, 7);
  const svg = qrSvg(bill.payload, QR_PRINT_MM, false);
  assert.match(svg, /width="46mm"/);
  assert.match(svg, /height="46mm"/);
  const html = invoiceHtml(DEFAULT_COMPANY, acc, inv);
  const scan = html.indexOf('Scannez pour payer (TWINT / e-banking)');
  const band = html.indexOf('class="qr"');
  assert.ok(scan > -1 && band > scan);
  assert.equal(html.split('Scannez pour payer (TWINT / e-banking)').length, 2);
  assert.match(html, /width:62mm/);
  assert.match(html, /width:148mm/);
  assert.match(html, /height:105mm/);
  assert.match(html, /padding:5mm/);
  assert.match(html, /✂/);
  assert.match(html, /SPÉCIMEN/);
  assert.match(html, /TVA non applicable/);
  assert.doesNotMatch(html, /YOUR_VAT_NUMBER/);
  assert.doesNotMatch(html, /Fruits de Martigny/);
  assert.match(html, /CHE-332\.255\.936/);

  const { size: n, dark } = qrMatrix(bill.payload);
  const cross = swissCrossRect(n);
  const scale = 6;
  const quiet = 4;
  const dim = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4);
  for (let py = 0; py < dim; py++) {
    for (let px = 0; px < dim; px++) {
      const mx = px / scale - quiet;
      const my = py / scale - quiet;
      let black = false;
      if (mx >= 0 && my >= 0 && mx < n && my < n) black = dark(Math.floor(mx), Math.floor(my));
      const lx = mx - cross.o;
      const ly = my - cross.o;
      if (lx >= 0 && ly >= 0 && lx < cross.c && ly < cross.c) {
        const body = lx >= 2 * cross.k && lx < 30 * cross.k && ly >= 2 * cross.k && ly < 30 * cross.k;
        const vert = lx >= 13 * cross.k && lx < 19 * cross.k && ly >= 7 * cross.k && ly < 25 * cross.k;
        const horz = ly >= 13 * cross.k && ly < 19 * cross.k && lx >= 7 * cross.k && lx < 25 * cross.k;
        black = body && !vert && !horz;
      }
      const i = (py * dim + px) * 4;
      const v = black ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const decoded = jsQR(data, dim, dim);
  assert.ok(decoded, 'le QR avec croix suisse doit se décoder');
  const got = decoded.data.split(/\r?\n/);
  const expected = bill.payload.split('\r\n');
  assert.deepEqual(got, expected);
});

test('sauvegarde chiffrée : aller-retour, mauvaise phrase refusée', async () => {
  const json = JSON.stringify({ invoices: [{ number: 'FA-2025-014' }] });
  const file = await encryptBackup(json, 'phrase-locale-test');
  assert.match(file, /bissabi-backup/);
  assert.doesNotMatch(file, /FA-2025-014/);
  const back = await decryptBackup(file, 'phrase-locale-test');
  assert.equal(back.ok && back.json, json);
  const bad = await decryptBackup(file, 'autre-phrase');
  assert.equal(bad.ok, false);
});

test('timeout puis continuer : les données stockées ne sont pas écrasées', async () => {
  resetHydrationForTests();
  const invoices = JSON.stringify([invoice({ id: 'i-real', number: 'FA-2025-014', accountId: 'a-real' })]);
  const accounts = JSON.stringify([account({ id: 'a-real', nom: 'Café du Lac' })]);
  const expenses = JSON.stringify([{ id: 'e-real', date: '2026-01-20', category: 'Transport & livraison', supplier: 'Dépôt', description: 'Tournée', amountTTC: 40, vatAmount: 0, attachment: { name: 'recu.pdf', uri: 'file://justificatifs/recu.pdf', persisted: true } }]);
  const kv = memoryKv({ invoices, accounts, expenses, offers: '[]', products: '[]', counters: '{}', company: JSON.stringify({ name: 'Bissabi Drinks - BA', iban: 'YOUR_SWISS_IBAN' }) });
  assert.equal(storageHydrated(), false);
  assert.equal(shouldPersist(false, 'invoices'), false);
  continueOffline();
  assert.equal(storageHydrated(), false);
  const empty = await commitIfHydrated(kv, STORE_KEYS.map((key) => ({ key, value: key === 'company' ? '{}' : '[]' })));
  assert.equal(empty, false);
  assert.deepEqual(kv.sets, []);
  assert.equal(kv.data.invoices, invoices);
  assert.equal(kv.data.accounts, accounts);
  assert.equal(kv.data.expenses, expenses);
  assert.equal(shouldPersist(true, 'invoices'), false);
});

test('retour arrière : copie préalable et numéros FA-2026-0009 / 0010 non réattribués', () => {
  const early = invoice({ id: 'i8', number: 'FA-2026-0008', status: 'sent', paidAt: undefined });
  const later = [
    invoice({ id: 'i9', number: 'FA-2026-0009', status: 'sent', paidAt: undefined }),
    invoice({ id: 'i10', number: 'FA-2026-0010', status: 'sent', paidAt: undefined }),
  ];
  const store = {
    accounts: [],
    offers: [],
    invoices: [early, ...later],
    expenses: [],
    company: { ...DEFAULT_COMPANY },
    products: [],
    counters: { 'FA-2026': 10 },
    creditNotes: [],
    audit: [],
    backups: [{
      id: 'bak-pre', at: '2026-01-01T00:00:00.000Z', reason: 'pre-migration' as const, fromVersion: 0,
      data: { invoices: [early], counters: { 'FA-2026': 8 }, accounts: [], offers: [], expenses: [], creditNotes: [] },
    }],
    schemaVersion: SCHEMA_VERSION,
  } satisfies Store;
  const warning = describeRollback(store);
  assert.match(warning, /FA-2026-0009/);
  assert.match(warning, /FA-2026-0010/);
  assert.match(warning, /copie/i);
  assert.match(warning, /ne seront pas redonnés/);
  const rolled = rollbackMigration(store, '2026-06-01T00:00:00.000Z');
  assert.equal(rolled.ok, true);
  if (!rolled.ok) return;
  assert.deepEqual(rolled.store.invoices.map((i) => i.number), ['FA-2026-0008']);
  const copy = rolled.store.backups.find((b) => b.reason === 'pre-rollback');
  assert.ok(copy);
  assert.deepEqual((copy.data.invoices as { number: string }[]).map((i) => i.number), ['FA-2026-0008', 'FA-2026-0009', 'FA-2026-0010']);
  assert.ok((rolled.store.counters['FA-2026'] ?? 0) >= 10);
  const next = nextSerial({ prefix: 'FA', year: 2026, numbers: rolled.store.invoices.map((i) => i.number), counters: rolled.store.counters });
  assert.equal(next.number, 'FA-2026-0011');
  assert.ok(rolled.store.backups.some((b) => b.id === 'bak-pre'));
});

test('restauration d’une sauvegarde v2 : le compteur ne passe pas de 10 à 7', () => {
  const current = {
    accounts: [],
    offers: [],
    invoices: [invoice({ id: 'i10', number: 'FA-2026-0010', status: 'sent', paidAt: undefined })],
    expenses: [],
    company: { ...DEFAULT_COMPANY },
    products: [],
    counters: { 'FA-2026': 10 },
    creditNotes: [],
    audit: [],
    backups: [],
    schemaVersion: SCHEMA_VERSION,
  } satisfies Store;
  const next = applyRestore(current, {
    schemaVersion: SCHEMA_VERSION,
    counters: { 'FA-2026': 7 },
    invoices: [invoice({ id: 'i7', number: 'FA-2026-0007', status: 'sent', paidAt: undefined })],
    accounts: [],
  }, '2026-06-02T00:00:00.000Z');
  assert.ok((next.counters['FA-2026'] ?? 0) >= 10);
  const allocated = nextSerial({ prefix: 'FA', year: 2026, numbers: next.invoices.map((i) => i.number), counters: next.counters });
  assert.equal(allocated.number, 'FA-2026-0011');
});

test('migration : sauvegarde confirmée avant schemaVersion, échecs sans avancer le schéma', async () => {
  const rawInvoices = JSON.stringify([invoice({ id: 'i-real', number: 'FA-2025-014' })]);
  const rawAccounts = JSON.stringify([account({ id: 'a-real', nom: 'Café du Lac' })]);
  const base = { invoices: rawInvoices, accounts: rawAccounts, counters: JSON.stringify({ 'FA-2025': 10 }) };

  const successOrder: string[] = [];
  const successData: Record<string, string> = { ...base };
  const success = await loadAndMigrate({
    async get(key) { return successData[key] ?? null; },
    async set(key, value) { successOrder.push(key); successData[key] = value; },
  }, '2026-04-01T00:00:00.000Z');
  assert.ok(!('error' in success));
  assert.ok(successOrder.indexOf('backups') >= 0);
  assert.ok(successOrder.indexOf('backups') < successOrder.indexOf('schemaVersion'));
  assert.equal(successOrder[successOrder.length - 1], 'schemaVersion');
  assert.equal(successData.invoices, rawInvoices);

  const quotaOrder: string[] = [];
  const quotaData: Record<string, string> = { ...base };
  const quota = await loadAndMigrate({
    async get(key) { return quotaData[key] ?? null; },
    async set(key, value) {
      quotaOrder.push(key);
      if (key === 'schemaVersion') throw new Error('quota');
      quotaData[key] = value;
    },
  }, '2026-04-01T00:00:00.000Z');
  assert.ok('error' in quota);
  assert.equal(quotaData.schemaVersion, undefined);
  assert.ok(JSON.parse(quotaData.backups).some((b: { reason: string }) => b.reason === 'pre-migration'));
  assert.equal(quotaData.invoices, rawInvoices);

  const fullOrder: string[] = [];
  const fullData: Record<string, string> = { ...base };
  const full = await loadAndMigrate({
    async get(key) { return fullData[key] ?? null; },
    async set(key) {
      fullOrder.push(key);
      if (key === 'backups') throw new Error('plein');
    },
  }, '2026-04-01T00:00:00.000Z');
  assert.ok('error' in full);
  assert.deepEqual(fullOrder, ['backups']);
  assert.equal(fullData.schemaVersion, undefined);
  assert.equal(fullData.invoices, rawInvoices);

  let hideBackup = false;
  const hiddenOrder: string[] = [];
  const hiddenData: Record<string, string> = { ...base };
  const hidden = await loadAndMigrate({
    async get(key) {
      if (key === 'backups' && hideBackup) return null;
      return hiddenData[key] ?? null;
    },
    async set(key, value) {
      hiddenOrder.push(key);
      if (key === 'backups') hideBackup = true;
      hiddenData[key] = value;
    },
  }, '2026-04-01T00:00:00.000Z');
  assert.ok('error' in hidden);
  assert.deepEqual(hiddenOrder, ['backups']);
  assert.equal(hiddenData.schemaVersion, undefined);
});

test('deux chargements ne migrent pas en même temps', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const data: Record<string, string> = { invoices: JSON.stringify([invoice({ id: 'i-real', number: 'FA-2025-014' })]) };
  const kv = {
    async get(key: string) {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return data[key] ?? null;
    },
    async set(key: string, value: string) { data[key] = value; },
  };
  await Promise.all([
    loadAndMigrate(kv, '2026-04-01T00:00:00.000Z'),
    loadAndMigrate(kv, '2026-04-01T00:00:00.000Z'),
  ]);
  assert.equal(maxInFlight, 1);
  assert.equal(data.invoices, JSON.stringify([invoice({ id: 'i-real', number: 'FA-2025-014' })]));
});

test('réinitialisation, statut émis et purge des sauvegardes', () => {
  const store = {
    accounts: [account({ id: 'a-real', nom: 'Café du Lac' })],
    offers: [],
    invoices: [invoice({ id: 'i10', number: 'FA-2026-0010', status: 'sent', paidAt: undefined })],
    expenses: [],
    company: { ...DEFAULT_COMPANY },
    products: [],
    counters: { 'FA-2026': 10 },
    creditNotes: [],
    audit: [],
    backups: [
      { id: 'old-pre', at: '2026-01-01T00:00:00.000Z', reason: 'pre-migration' as const, fromVersion: 0, data: { invoices: [] } },
      ...['b1', 'b2', 'b3', 'b4'].map((id, i) => ({ id, at: `2026-02-0${i + 1}T00:00:00.000Z`, reason: 'manual' as const, fromVersion: 2, data: {} })),
    ],
    schemaVersion: SCHEMA_VERSION,
  } satisfies Store;
  const reset = applyReset(store, '2026-06-03T00:00:00.000Z');
  assert.equal(reset.counters['FA-2026'], 10);
  assert.equal(reset.invoices.length, 0);
  assert.ok(reset.backups.some((b) => b.id === 'old-pre'));
  assert.ok(reset.backups.length <= 4);
  assert.equal(coerceInvoiceStatus('sent', 'draft'), 'sent');
  assert.equal(coerceInvoiceStatus('issued', 'draft'), 'issued');
  assert.equal(coerceInvoiceStatus('draft', 'issued'), 'issued');
  const pruned = pruneBackups(store.backups);
  assert.ok(pruned.some((b) => b.id === 'old-pre'));
  assert.ok(pruned.length >= 3);
  assert.ok(pruned.length < store.backups.length);
});

test('toutes les sauvegardes pre-migration sont conservées', () => {
  const phone = { id: 'phone', at: '2026-01-01T00:00:00.000Z', reason: 'pre-migration' as const, fromVersion: 0, data: { invoices: [{ number: 'FA-2025-014' }] } };
  const second = { id: 'v1-restore', at: '2026-03-01T00:00:00.000Z', reason: 'pre-migration' as const, fromVersion: 0, data: { invoices: [] } };
  const manuals = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id, i) => ({
    id, at: `2026-04-0${i + 1}T00:00:00.000Z`, reason: 'manual' as const, fromVersion: 2, data: {},
  }));
  const pruned = pruneBackups([phone, manuals[0], manuals[1], second, ...manuals.slice(2)]);
  assert.ok(pruned.some((b) => b.id === 'phone'));
  assert.ok(pruned.some((b) => b.id === 'v1-restore'));
  assert.equal(JSON.stringify(pruned.find((b) => b.id === 'phone')?.data), JSON.stringify(phone.data));
  assert.ok(pruned.length < 7);
  assert.ok(pruned.filter((b) => b.reason === 'pre-migration').length === 2);
});

test('une clé ratée reste à réécrire et le bandeau ne s’efface pas', () => {
  const oldInvoice = JSON.stringify([invoice({ id: 'i-real', number: 'FA-2025-014' })]);
  const base = {
    accounts: [account({ id: 'a-real', nom: 'Café du Lac' })],
    offers: [] as Offer[],
    invoices: [invoice({ id: 'i-real', number: 'FA-2025-014' }), invoice({ id: 'i-new', number: 'FA-2026-0011', status: 'issued', paidAt: undefined })],
    expenses: [],
    company: { ...DEFAULT_COMPANY },
    products: [],
    counters: {},
    creditNotes: [],
    audit: [],
    backups: [],
    schemaVersion: SCHEMA_VERSION,
  } satisfies Store;
  const confirmedAll: Partial<Record<keyof Store, string>> = {
    accounts: '[]', invoices: oldInvoice, offers: '[]', expenses: '[]', company: JSON.stringify(base.company),
    products: '[]', counters: '{}', creditNotes: '[]', audit: '[]', backups: '[]', schemaVersion: String(SCHEMA_VERSION),
  };
  const failed = new Set<StoreKey>();
  let plan = planDiskWrites(confirmedAll, failed, base);
  assert.ok(plan.some((entry) => entry.key === 'invoices'));
  assert.ok(plan.some((entry) => entry.key === 'accounts'));
  const invoicesWrite = plan.find((entry) => entry.key === 'invoices')!;
  const accountsWrite = plan.find((entry) => entry.key === 'accounts')!;
  recordWriteOutcome(confirmedAll, failed, invoicesWrite, false);
  recordWriteOutcome(confirmedAll, failed, accountsWrite, true);
  assert.equal(confirmedAll.invoices, oldInvoice);
  assert.ok(failed.has('invoices'));
  assert.equal(failed.has('accounts'), false);
  const withOffer = { ...base, offers: [{ id: 'o1', number: 'OF-2026-0001', accountId: 'a-real', date: '2026-04-01', validUntil: '2026-05-01', lines: [], vat: { apply: false, rate: 0 as const }, status: 'draft' as const, notes: '' }] };
  plan = planDiskWrites(confirmedAll, failed, withOffer);
  const keys = plan.map((entry) => entry.key);
  assert.ok(keys.includes('invoices'));
  assert.ok(keys.includes('offers'));
  assert.equal(keys.includes('accounts'), false);
  assert.ok(failed.size > 0);
});

test('schéma déjà à jour : migration sans nouveau snapshot', () => {
  const store = {
    accounts: [account({ id: 'a-real', nom: 'Café du Lac' })],
    offers: [],
    invoices: [invoice({ id: 'i-real', number: 'FA-2025-014' })],
    expenses: [],
    company: { ...DEFAULT_COMPANY },
    products: [],
    counters: { 'FA-2025': 14 },
    creditNotes: [],
    audit: [],
    backups: [],
    schemaVersion: SCHEMA_VERSION,
  } satisfies Store;
  const res = applySchemaMigration(store, '2026-04-01T00:00:00.000Z');
  assert.equal(res.changed, false);
  assert.equal(res.store.backups.length, 0);
  assert.equal(res.store.invoices[0].number, 'FA-2025-014');
});
