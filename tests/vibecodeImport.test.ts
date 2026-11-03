import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SCHEMA_VERSION, type Store } from '../src/lib/migrate';
import { DEFAULT_COMPANY, type Invoice } from '../src/lib/model';
import { nextSerial } from '../src/lib/numbering';
import { SEED_ACCOUNTS, SEED_EXPENSES, SEED_INVOICES, SEED_OFFERS } from '../src/lib/seed';
import { applyVibecodeImport, parseVibecodeExport, peekNextInvoiceNumber, vibecodeTotals, zurichDate, type VibecodeExport } from '../src/lib/vibecodeImport';

const root = join(import.meta.dirname, '..');
const load = (path: string): VibecodeExport => {
  const p = parseVibecodeExport(readFileSync(path, 'utf8'));
  if (!p.ok) throw new Error(p.error);
  return p.data;
};
const fixture = () => load(join(root, 'tests/fixtures/vibecode-sample.json'));
const emptyStore = (over: Partial<Store> = {}): Store => ({
  accounts: [], offers: [], invoices: [], expenses: [], company: { ...DEFAULT_COMPANY }, products: [], counters: {},
  creditNotes: [], audit: [], backups: [], schemaVersion: SCHEMA_VERSION, ...over,
});
const r2 = (x: number) => Math.round(x * 100) / 100;
const invTotal = (i: Invoice) => r2(i.lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
const NOW = '2026-11-03T09:00:00.000Z';

test('vibecode: parse refuse un fichier qui n’est pas un export Vibecode', () => {
  assert.equal(parseVibecodeExport('{oops').ok, false);
  assert.equal(parseVibecodeExport(JSON.stringify({ accounts: [] })).ok, false);
});

test('vibecode: dates epoch → date Europe/Zurich (été / hiver)', () => {
  assert.equal(zurichDate(Date.UTC(2026, 7, 31, 22, 30)), '2026-09-01'); // CEST
  assert.equal(zurichDate(Date.UTC(2026, 11, 31, 22, 30)), '2026-12-31'); // CET
});

test('vibecode: totaux du fichier (hors démo, centimes → CHF)', () => {
  const t = vibecodeTotals(fixture());
  assert.equal(t.accounts, 3);
  assert.equal(t.demoExcluded, 2);
  assert.equal(t.invoices, 3);
  assert.equal(t.invoicesTotal, 70);
  assert.deepEqual([t.paid, t.paidTotal, t.open, t.openTotal, t.cancelled, t.cancelledTotal], [1, 50, 1, 12, 1, 8]);
  assert.deepEqual([t.payments, t.paymentsTotal], [1, 50]);
  assert.deepEqual([t.expenses, t.expensesTotal], [2, 190]);
  assert.equal(t.products, 2);
  assert.equal(t.ordersAsInvoiceNotes, 3);
  assert.equal(t.ordersAsAccountNotes, 2);
});

test('vibecode: import complet, numéros conservés, démo exclue, statuts et paiements', () => {
  const { store, report } = applyVibecodeImport(emptyStore(), fixture(), NOW);
  assert.equal(store.accounts.length, 3);
  assert.ok(!store.accounts.some((a) => /d[ée]mo/i.test(a.nom)));
  assert.deepEqual(store.invoices.map((i) => i.number).sort(), ['FAC-2026-0003', 'FAC-2026-0004', 'FAC-2026-0005']);
  assert.equal(r2(store.invoices.reduce((a, i) => a + invTotal(i), 0)), 70);
  const byNum = Object.fromEntries(store.invoices.map((i) => [i.number, i]));
  assert.equal(byNum['FAC-2026-0003'].status, 'paid');
  assert.equal(byNum['FAC-2026-0003'].paidAt, '2026-09-10');
  assert.match(byNum['FAC-2026-0003'].notes ?? '', /CMD-2026-0003/);
  assert.match(byNum['FAC-2026-0003'].notes ?? '', /Encaissement CHF 50\.00 le 10\.09\.2026/);
  assert.equal(byNum['FAC-2026-0004'].status, 'issued');
  assert.equal(byNum['FAC-2026-0005'].status, 'cancelled');
  assert.equal(store.expenses.length, 2);
  assert.equal(r2(store.expenses.reduce((a, e) => a + e.amountTTC, 0)), 190);
  assert.deepEqual(store.expenses.map((e) => e.category).sort(), ['Emballages & bouteilles', 'Matières premières']);
  const fictif = store.accounts.find((a) => a.nom === 'Restaurant Fictif')!;
  assert.match(fictif.notes ?? '', /CMD-2026-0006/);
  assert.match(fictif.notes ?? '', /Rappeler le gérant/);
  const modele = store.accounts.find((a) => a.nom === 'Épicerie Modèle')!;
  assert.match(modele.notes ?? '', /Visite test/);
  assert.match(modele.notes ?? '', /CMD-2026-0007.*annulée/);
  assert.ok(!JSON.stringify(store.accounts).includes('Tâche démo'));
  assert.equal(report.iban, 'importé');
  assert.equal(store.company.iban.replace(/\s/g, ''), 'CH9300762011623852957');
  assert.equal(report.nextInvoiceNumber, 'FAC-2026-0006');
  assert.equal(nextSerial({ prefix: 'FA', year: 2026, numbers: store.invoices.map((i) => i.number), counters: store.counters }).number, 'FAC-2026-0006');
  assert.equal(store.backups.at(-1)?.reason, 'pre-import');
});

test('vibecode: idempotent — un 2e import n’ajoute rien et rend le même store', () => {
  const once = applyVibecodeImport(emptyStore(), fixture(), NOW);
  const twice = applyVibecodeImport(once.store, fixture(), NOW);
  assert.equal(twice.store, once.store);
  assert.deepEqual(Object.values(twice.report.added), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(twice.report.skipped, { comptes: 3, factures: 3, depenses: 2, produits: 2 });
  assert.equal(twice.report.nextInvoiceNumber, 'FAC-2026-0006');
});

test('vibecode: additif — ne remplace ni n’efface rien, garde la démo de l’app à part, IBAN existant conservé', () => {
  const company = { ...DEFAULT_COMPANY, iban: 'CH56 0483 5012 3456 7800 9', email: 'moi@example.test' };
  const before = emptyStore({ accounts: [...SEED_ACCOUNTS], offers: [...SEED_OFFERS], invoices: [...SEED_INVOICES], expenses: [...SEED_EXPENSES], company });
  const { store, report } = applyVibecodeImport(before, fixture(), NOW);
  for (const a of before.accounts) assert.deepEqual(store.accounts.find((x) => x.id === a.id), a);
  for (const i of before.invoices) assert.deepEqual(store.invoices.find((x) => x.id === i.id), i);
  for (const e of before.expenses) assert.deepEqual(store.expenses.find((x) => x.id === e.id), e);
  assert.equal(store.accounts.length, before.accounts.length + 3);
  assert.equal(store.company.iban, company.iban);
  assert.equal(store.company.email, 'moi@example.test');
  assert.equal(report.iban, 'déjà renseigné');
  assert.ok(!store.invoices.some((i) => i.accountId && SEED_ACCOUNTS.some((a) => a.id === i.accountId) && i.number.startsWith('FAC-')));
});

test('vibecode: facture déjà présente (même numéro) ignorée, jamais renumérotée', () => {
  const first = applyVibecodeImport(emptyStore(), fixture(), NOW).store;
  const keep = first.invoices.find((i) => i.number === 'FAC-2026-0004')!;
  const partial = emptyStore({ invoices: [{ ...keep, id: 'autre-id', notes: 'saisie manuelle' }] });
  const { store, report } = applyVibecodeImport(partial, fixture(), NOW);
  assert.equal(store.invoices.filter((i) => i.number === 'FAC-2026-0004').length, 1);
  assert.equal(store.invoices.find((i) => i.number === 'FAC-2026-0004')!.notes, 'saisie manuelle');
  assert.equal(report.skipped.factures, 1);
  assert.equal(report.added.factures, 2);
});

test('vibecode: installation neuve sans import → FA-AAAA-0001 (inchangé)', () => {
  assert.equal(peekNextInvoiceNumber(emptyStore(), 2026), 'FA-2026-0001');
  assert.equal(nextSerial({ prefix: 'FA', year: 2026, numbers: [], counters: {} }).number, 'FA-2026-0001');
  assert.equal(nextSerial({ prefix: 'OF', year: 2026, numbers: ['FAC-2026-0024'], counters: {} }).number, 'OF-2026-0001');
});

const real = process.env.VIBECODE_REAL_EXPORT;
test('vibecode: contrôle sur l’export réel (hors dépôt, VIBECODE_REAL_EXPORT)', { skip: !real || !existsSync(real) }, () => {
  const data = load(real!);
  const t = vibecodeTotals(data);
  assert.deepEqual([t.accounts, t.invoices, t.invoicesTotal, t.paid, t.paidTotal, t.expenses, t.expensesTotal], [17, 17, 1260, 5, 210, 10, 5233.4]);
  const once = applyVibecodeImport(emptyStore(), data, NOW);
  const s = once.store;
  assert.equal(s.accounts.length, 17);
  assert.equal(s.invoices.length, 17);
  assert.equal(r2(s.invoices.reduce((a, i) => a + invTotal(i), 0)), 1260);
  const paid = s.invoices.filter((i) => i.status === 'paid');
  assert.deepEqual([paid.length, r2(paid.reduce((a, i) => a + invTotal(i), 0))], [5, 210]);
  assert.deepEqual(s.invoices.filter((i) => i.status === 'cancelled').map((i) => i.number), ['FAC-2026-0021']);
  assert.deepEqual(s.invoices.map((i) => i.number).sort(), Array.from({ length: 17 }, (_, k) => `FAC-2026-${String(k + 8).padStart(4, '0')}`));
  assert.deepEqual([s.expenses.length, r2(s.expenses.reduce((a, e) => a + e.amountTTC, 0))], [10, 5233.4]);
  assert.equal(once.report.nextInvoiceNumber, 'FAC-2026-0025');
  const twice = applyVibecodeImport(s, data, NOW);
  assert.equal(twice.store, s);
  assert.deepEqual(Object.values(twice.report.added), [0, 0, 0, 0, 0, 0]);
  // Avec la démo de l’app présente : la série FAC continue quand même.
  const withSeed = applyVibecodeImport(emptyStore({ accounts: [...SEED_ACCOUNTS], invoices: [...SEED_INVOICES] }), data, NOW);
  assert.equal(withSeed.report.nextInvoiceNumber, 'FAC-2026-0025');
});
