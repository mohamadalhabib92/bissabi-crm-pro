import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { qrReference } from '../src/lib/iban';
import { loadAndMigrate, SCHEMA_VERSION, type Kv } from '../src/lib/migrate';
import { DEFAULT_COMPANY, totals, type Invoice } from '../src/lib/model';
import { nextSerial, sameSerialSlot } from '../src/lib/numbering';
import { commitIfHydrated, isPreserveOnly, markPreserveOnly, markStorageHydrated, resetHydrationForTests, shouldPersist } from '../src/lib/persistGate';
import {
  attachmentLossRisk,
  attachmentSubtitle,
  cacheOnlyDurableClaim,
  concurrentNumberConflict,
  cutoverAllowed,
  cutoverGates,
  decideAttachment,
  duplicateExactNumbers,
  historicMoneyUntouched,
  invoiceNumberAmbiguities,
  MONEY_ASSUMPTIONS,
  nextCrashLog,
  observeMoney,
  preserveInvoiceRows,
  reservationConflicts,
  storedParseDecision,
} from '../src/lib/preserve';
import { buildQrBill } from '../src/lib/qrbill';

const root = join(import.meta.dirname, '..');
const fx = join(root, 'tests/fixtures/preserve');

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

test('JSON illisible : original et clé voisine intacts, aucun écrit, hash de l’original', async () => {
  const corrupt = readFileSync(join(fx, 'invoices-corrupt.txt'), 'utf8');
  const accounts = JSON.stringify([{ id: 'a1', nom: 'Café du Lac', noteInterne: 'à garder' }]);
  const kv = memoryKv({ invoices: corrupt, accounts });
  const res = await loadAndMigrate(kv, '2026-11-07T00:00:00.000Z');
  assert.ok('error' in res);
  assert.equal(kv.data.invoices, corrupt);
  assert.equal(kv.data.accounts, accounts);
  assert.deepEqual(kv.sets, []);
  assert.ok(res.quarantine);
  assert.equal(res.quarantine?.reason, 'json-parse');
  assert.equal(res.quarantine?.key, 'invoices');
  assert.equal(res.quarantine?.original, corrupt);
  assert.equal(res.quarantine?.sha256, createHash('sha256').update(corrupt).digest('hex'));
  assert.equal(storedParseDecision(corrupt), 'keep-original');
  assert.equal(shouldPersist(false, 'invoices'), false);
});

test('forme invalide : pas de repli écrit à la place du texte', async () => {
  const raw = '{"pas":"une liste"}';
  const kv = memoryKv({ invoices: raw, accounts: '[]' });
  const res = await loadAndMigrate(kv, '2026-11-07T00:00:00.000Z');
  assert.ok('error' in res);
  assert.equal(res.quarantine?.reason, 'shape');
  assert.equal(res.quarantine?.original, raw);
  assert.equal(kv.data.invoices, raw);
  assert.deepEqual(kv.sets, []);
});

test('schéma futur : lecture seule, octets d’origine conservés', async () => {
  const future = JSON.parse(readFileSync(join(fx, 'future-schema.json'), 'utf8')) as {
    schemaVersion: number;
    invoices: Array<Invoice & { champFutur?: string }>;
  };
  const invoices = JSON.stringify(future.invoices);
  const schemaVersion = JSON.stringify(future.schemaVersion);
  const kv = memoryKv({ invoices, schemaVersion, accounts: '[]' });
  const res = await loadAndMigrate(kv, '2026-11-07T00:00:00.000Z');
  assert.ok(!('error' in res));
  if ('error' in res) return;
  assert.equal(res.preserveOnly, true);
  assert.equal(res.store.schemaVersion, 9);
  assert.ok(res.store.schemaVersion > SCHEMA_VERSION);
  assert.equal(res.store.invoices[0].number, 'FA-2026-7');
  assert.equal((res.store.invoices[0] as Invoice & { champFutur?: string }).champFutur, 'laisser');
  assert.equal(kv.data.invoices, invoices);
  assert.equal(kv.data.schemaVersion, schemaVersion);
  assert.deepEqual(kv.sets, []);
  resetHydrationForTests();
  markStorageHydrated();
  markPreserveOnly(true);
  assert.equal(isPreserveOnly(), true);
  assert.equal(await commitIfHydrated(kv, [{ key: 'invoices', value: '[]' }]), false);
  assert.deepEqual(kv.sets, []);
  assert.equal(kv.data.invoices, invoices);
  resetHydrationForTests();
});

test('fixture historique : 3 et 4 chiffres non réécrits, champs et montants gardés', async () => {
  const fixture = JSON.parse(readFileSync(join(fx, 'historic-store.json'), 'utf8')) as {
    accounts: unknown[];
    invoices: Invoice[];
    expenses: Array<{ attachment?: { uri: string; persisted: boolean; blobInconnu?: string } }>;
  };
  const accounts = JSON.stringify(fixture.accounts);
  const invoices = JSON.stringify(fixture.invoices);
  const expenses = JSON.stringify(fixture.expenses);
  const kv = memoryKv({
    accounts,
    invoices,
    expenses,
    offers: '[]',
    products: '[]',
    counters: '{}',
    company: JSON.stringify({ ...DEFAULT_COMPANY, vatNumber: '' }),
  });
  const res = await loadAndMigrate(kv, '2026-11-07T00:00:00.000Z');
  assert.ok(!('error' in res));
  if ('error' in res) return;
  assert.equal(res.preserveOnly, false);
  assert.equal(kv.data.invoices, invoices);
  assert.equal(kv.data.expenses, expenses);
  assert.equal(kv.data.accounts, accounts);
  assert.ok(!kv.sets.includes('invoices'));
  assert.ok(!kv.sets.includes('expenses'));
  assert.deepEqual(res.store.invoices.map((i) => i.number), ['FA-2026-3', 'FA-2026-0003']);
  assert.equal((res.store.invoices[0] as Invoice & { champInconnu?: { origine: string } }).champInconnu?.origine, 'carnet');
  assert.equal((res.store.accounts[0] as { noteInterne?: string }).noteInterne, 'à garder');
  assert.equal(res.store.expenses[0].attachment?.uri, fixture.expenses[0].attachment?.uri);
  assert.equal((res.store.expenses[0].attachment as { blobInconnu?: string }).blobInconnu, 'ne-pas-jeter');
  assert.equal(historicMoneyUntouched(fixture.invoices, res.store.invoices), true);
  assert.equal(cacheOnlyDurableClaim(res.store.expenses[0].attachment!), true);
  const numbers = res.store.invoices.map((i) => i.number);
  const snapshot = [...numbers];
  const ambiguities = invoiceNumberAmbiguities(numbers);
  assert.equal(ambiguities.length, 1);
  assert.deepEqual(ambiguities[0].variants.sort(), ['FA-2026-0003', 'FA-2026-3']);
  const next = nextSerial({ prefix: 'FA', year: 2026, numbers, counters: res.store.counters });
  assert.deepEqual(numbers, snapshot);
  assert.equal(next.number, 'FA-2026-0004');
  assert.equal(reservationConflicts(next.number, numbers), null);
  assert.equal(reservationConflicts('FA-2026-0003', numbers), 'exact');
  assert.equal(reservationConflicts('FA-2026-0003', ['FA-2026-3']), 'width');
  assert.equal(sameSerialSlot('FA-2026-3', 'FA-2026-0003'), true);
  assert.notEqual(qrReference('FA-2026-3'), qrReference('FA-2026-0003'));
  const padded = res.store.invoices.map((i) => ({ ...i, number: i.number.replace(/(\d+)$/, (n) => n.padStart(4, '0')), notes: 'édition concurrente' }));
  const kept = preserveInvoiceRows(res.store.invoices, padded);
  assert.deepEqual(kept.map((i) => i.number), ['FA-2026-3', 'FA-2026-0003']);
  assert.equal(kept[1].notes, 'édition concurrente');
  assert.equal((kept[0] as Invoice & { champInconnu?: { ok: boolean } }).champInconnu?.ok, true);
  assert.equal(concurrentNumberConflict('FA-2026-3', 'FA-2026-0003'), true);
  assert.deepEqual(duplicateExactNumbers(['FA-2026-3', 'FA-2026-3', 'FA-2026-0003']), ['FA-2026-3']);
});

test('CHF : pas facture 0,01, pas cash 0,05, montant QR non réécrit dans la fixture', () => {
  const lines = [{ id: 'l2', description: 'Bissabi Gold 75cl', qty: 1, unitPrice: 10.1 }];
  const t = totals(lines, { apply: true, rate: 8.1 });
  assert.equal(t.ht, 10.1);
  assert.equal(t.tva, 0.82);
  assert.equal(t.ttc, 10.92);
  const seen = observeMoney(t.ttc);
  assert.equal(seen.centimes, 1092);
  assert.equal(seen.cashCentimes, 1090);
  assert.equal(MONEY_ASSUMPTIONS.cashRoundingApplied, false);
  assert.equal(MONEY_ASSUMPTIONS.historicAmountsRewritten, false);
  const inv: Invoice = {
    id: 'fa-0003', number: 'FA-2026-0003', accountId: 'a1', date: '2026-02-02', dueDate: '2026-03-04',
    lines, vat: { apply: true, rate: 8.1 }, status: 'issued', notes: 'largeur 4',
  };
  const bill = buildQrBill(DEFAULT_COMPANY, undefined, inv, t.ttc);
  assert.match(bill.payload, /10\.92\r\nCHF/);
  assert.equal(lines[0].unitPrice, 10.1);
});

test('justificatif : cache non déclaré durable, data URL conservé, fichier non retiré', () => {
  const uri = 'file:///var/mobile/Containers/Data/Application/abc/Library/Caches/recu.pdf';
  const cache = decideAttachment({ name: 'recu.pdf', uri, mime: 'application/pdf', extra: { blobInconnu: 'ne-pas-jeter' } });
  assert.equal(cache.persisted, false);
  assert.equal(cache.uri, uri);
  assert.equal(cache.blobInconnu, 'ne-pas-jeter');
  assert.equal(attachmentLossRisk(cache), 'high');
  assert.match(attachmentSubtitle(cache), /cache/);
  assert.match(attachmentSubtitle(cache), /effac/);
  const embedded = decideAttachment({
    name: 'recu.pdf', uri, mime: 'application/pdf', inlinedDataUrl: 'data:application/pdf;base64,YQ==', extra: { blobInconnu: 'ne-pas-jeter' },
  });
  assert.equal(embedded.persisted, true);
  assert.equal(embedded.uri, 'data:application/pdf;base64,YQ==');
  assert.equal(embedded.blobInconnu, 'ne-pas-jeter');
  assert.equal(attachmentLossRisk(embedded), 'low');
  assert.match(attachmentSubtitle({ uri: 'file:///var/mobile/Containers/Data/Application/abc/Documents/recu.pdf', persisted: true }), /inspecté/);
  assert.equal(attachmentLossRisk({ uri: 'content://media/external/file/1' }), 'high');
});

test('journal de crash illisible non remplacé', () => {
  const raw = '{pas du json';
  assert.equal(nextCrashLog(raw, { at: '2026-11-07T00:00:00.000Z', message: 'boom' }).action, 'keep');
  const fresh = nextCrashLog(null, { at: '2026-11-07T00:00:00.000Z', message: 'boom' });
  assert.equal(fresh.action, 'write');
  if (fresh.action === 'write') {
    assert.equal(JSON.parse(fresh.value)[0].message, 'boom');
    assert.doesNotMatch(fresh.value, /pas du json/);
  }
});

test('bascule interdite : les tests ne valident pas une sauvegarde appareil', () => {
  const gates = cutoverGates();
  assert.equal(cutoverAllowed(), false);
  assert.ok(gates.length >= 6);
  assert.ok(gates.every((g) => g.satisfied === false));
  const text = gates.map((g) => g.requirement).join('\n');
  assert.match(text, /chiffrée/);
  assert.match(text, /isolée/);
  assert.match(text, /Comptages/);
  assert.match(text, /Hash/);
  assert.match(text, /retour arrière/);
  assert.match(text, /Système de fichiers/);
});

test('les chemins d’écriture passent par la fondation', () => {
  const data = readFileSync(join(root, 'src/lib/data.tsx'), 'utf8');
  const storage = readFileSync(join(root, 'src/lib/storage.ts'), 'utf8');
  const expense = readFileSync(join(root, 'src/app/expense/[id].tsx'), 'utf8');
  const numbering = readFileSync(join(root, 'src/lib/numbering.ts'), 'utf8');
  assert.match(data, /preserveInvoiceRows\(s\.invoices/);
  assert.match(data, /markPreserveOnly\(res\.preserveOnly\)/);
  assert.match(storage, /storedParseDecision/);
  assert.match(expense, /decideAttachment/);
  assert.match(expense, /attachmentSubtitle/);
  assert.match(numbering, /slotTaken\(candidate, numbers\)/);
  assert.doesNotMatch(expense, /persisted: Platform\.OS !== 'web'/);
});
