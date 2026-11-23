import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyDraftDeletion, applyInvoiceSave } from '../src/lib/invoiceSave';
import { qrReference } from '../src/lib/iban';
import { applyReset, loadAndMigrate, SCHEMA_VERSION, type Kv, type Store } from '../src/lib/migrate';
import { DEFAULT_COMPANY, totals, type Invoice } from '../src/lib/model';
import { nextSerial } from '../src/lib/numbering';
import {
  backupWriteAllowed,
  canMutateStore,
  cutoverAllowed,
  decideAttachment,
  deletionReported,
  MONEY_ASSUMPTIONS,
  observeMoney,
} from '../src/lib/preserve';

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

function issued(): Invoice & { champInconnu: string } {
  return {
    id: 'fa-3', number: 'FA-2026-3', accountId: 'a1', date: '2026-01-15', dueDate: '2026-02-14',
    lines: [{ id: 'l1', description: 'Bissabi Red 25cl', qty: 24, unitPrice: 2.5 }],
    vat: { apply: false, rate: 8.1 }, status: 'issued', notes: '', champInconnu: 'carnet',
  };
}

function base(invoices: Invoice[]): Store {
  return {
    accounts: [], offers: [], invoices, expenses: [], company: { ...DEFAULT_COMPANY }, products: [],
    counters: { 'FA-2026': 3 }, creditNotes: [], audit: [], backups: [], schemaVersion: SCHEMA_VERSION,
  };
}

const allocate = (state: Store) => nextSerial({
  prefix: 'FA', year: 2026, numbers: state.invoices.map((i) => i.number).filter(Boolean), counters: state.counters,
});

test('lecture pas finie : une mutation ou un reset ne part pas', () => {
  assert.equal(canMutateStore(false, false), false);
  const s = base([issued()]);
  const raw = JSON.stringify(s.invoices);
  assert.equal(canMutateStore(false, false), false);
  assert.equal(JSON.stringify(s.invoices), raw);
  assert.equal(s.invoices[0].number, 'FA-2026-3');
  const hazard = applyReset(s, '2026-11-08T00:00:00.000Z');
  assert.equal(hazard.invoices.length, 0);
  assert.equal(s.invoices[0].number, 'FA-2026-3');
  assert.equal((s.invoices[0].lines[0].unitPrice), 2.5);
});

test('suppression d’une facture émise refusée, puis écriture du statut : numéro, montant, QR et champ inconnu intacts', () => {
  const inv = issued();
  const s = base([inv, { ...inv, id: 'brouillon', number: '', status: 'draft' }]);
  const refused = applyDraftDeletion(s, inv.id);
  assert.equal(refused.deleted, false);
  assert.equal(refused.store, s);
  assert.equal(deletionReported(true, false), false);
  assert.equal(deletionReported(refused.deleted, true), false);
  const rec: Invoice = {
    ...inv, status: 'paid', paidAt: '2026-11-08', number: 'FA-2026-0003',
    lines: [{ id: 'l1', description: 'Bissabi Red 25cl', qty: 24, unitPrice: 999 }],
  };
  const saved = applyInvoiceSave(refused.store, rec, allocate, '2026-11-08');
  const row = saved.saved as Invoice & { champInconnu?: string };
  assert.equal(row.number, 'FA-2026-3');
  assert.equal(row.status, 'paid');
  assert.equal(row.lines[0].unitPrice, 2.5);
  assert.equal(row.lines[0].qty, 24);
  assert.equal(row.champInconnu, 'carnet');
  assert.equal(qrReference(row.number), qrReference('FA-2026-3'));
  assert.notEqual(qrReference('FA-2026-3'), qrReference('FA-2026-0003'));
  assert.equal(saved.store.invoices.find((i) => i.id === 'brouillon')?.status, 'draft');
  const draftGone = applyDraftDeletion(saved.store, 'brouillon');
  assert.equal(draftGone.deleted, true);
  assert.equal(draftGone.store.invoices.some((i) => i.id === 'fa-3'), true);
  assert.equal(draftGone.store.invoices.find((i) => i.id === 'fa-3')?.number, 'FA-2026-3');
});

test('schéma > 2 et journal illisible : relecture sans succès et sans écriture', async () => {
  assert.equal(backupWriteAllowed({ hydrated: true, preserveOnly: true }, SCHEMA_VERSION, SCHEMA_VERSION).ok, false);
  assert.deepEqual(backupWriteAllowed({ hydrated: true, preserveOnly: false }, 9, SCHEMA_VERSION), { ok: false, reason: 'future' });
  assert.equal(backupWriteAllowed({ hydrated: false, preserveOnly: false }, 0, SCHEMA_VERSION).ok, false);
  const invoices = JSON.stringify([issued()]);
  const accounts = JSON.stringify([{ id: 'a1', nom: 'Café du Lac', noteInterne: 'garder' }]);
  const kv = memoryKv({ invoices, accounts, audit: '{journal' });
  const first = await loadAndMigrate(kv, '2026-11-08T00:00:00.000Z');
  const second = await loadAndMigrate(kv, '2026-11-08T00:01:00.000Z');
  assert.ok('error' in first && 'error' in second);
  assert.equal(first.quarantine?.key, 'audit');
  assert.equal(first.quarantine?.original, '{journal');
  assert.deepEqual(kv.sets, []);
  assert.equal(kv.data.invoices, invoices);
  assert.equal(kv.data.accounts, accounts);
  assert.equal(kv.data.audit, '{journal');
  assert.match(kv.data.invoices, /FA-2026-3/);
  assert.match(kv.data.invoices, /champInconnu/);
  assert.match(kv.data.accounts, /noteInterne/);

  const future = memoryKv({ invoices, accounts, schemaVersion: '9' });
  const opened = await loadAndMigrate(future, '2026-11-08T00:02:00.000Z');
  const reread = await loadAndMigrate(future, '2026-11-08T00:03:00.000Z');
  assert.ok(!('error' in opened) && !('error' in reread));
  if ('error' in opened || 'error' in reread) return;
  assert.equal(opened.preserveOnly, true);
  assert.equal(reread.preserveOnly, true);
  assert.equal(opened.store.invoices[0].number, 'FA-2026-3');
  assert.equal((opened.store.invoices[0] as Invoice & { champInconnu?: string }).champInconnu, 'carnet');
  assert.deepEqual(future.sets, []);
  assert.equal(future.data.invoices, invoices);
});

test('copie de justificatif échouée : l’URI d’origine reste, le cache n’est pas déclaré durable', () => {
  const uri = 'file:///var/mobile/Containers/Data/Application/abc/Library/Caches/recu.pdf';
  const kept = decideAttachment({ name: 'recu.pdf', uri, mime: 'application/pdf', inlinedDataUrl: null, extra: { blobInconnu: 'ne-pas-jeter' } });
  assert.equal(kept.uri, uri);
  assert.equal(kept.persisted, false);
  assert.equal(kept.blobInconnu, 'ne-pas-jeter');
  const emptyData = decideAttachment({ name: 'recu.pdf', uri, inlinedDataUrl: 'data:' });
  assert.equal(emptyData.uri, uri);
  assert.equal(emptyData.persisted, false);
});

test('CHF au centime : 10,92 n’est pas ramené à 10,90, le prix stocké ne change pas', () => {
  const lines = [{ id: 'l2', description: 'Bissabi Gold 75cl', qty: 1, unitPrice: 10.1 }];
  const t = totals(lines, { apply: true, rate: 8.1 });
  assert.equal(t.ttc, 10.92);
  assert.equal(observeMoney(t.ttc).centimes, 1092);
  assert.equal(observeMoney(t.ttc).cashCentimes, 1090);
  assert.equal(MONEY_ASSUMPTIONS.cashRoundingApplied, false);
  assert.equal(lines[0].unitPrice, 10.1);
  assert.equal(cutoverAllowed(), false);
});

test('la fixture Vibecode du dépôt n’est pas l’export réel, le test réel reste conditionnel', () => {
  const sample = JSON.parse(readFileSync(join(root, 'tests/fixtures/vibecode-sample.json'), 'utf8')) as { Invoice?: unknown[] };
  assert.notEqual(sample.Invoice?.length ?? 0, 17);
  const src = readFileSync(join(root, 'tests/vibecodeImport.test.ts'), 'utf8');
  assert.match(src, /VIBECODE_REAL_EXPORT/);
  assert.match(src, /skip: !real/);
  assert.equal(process.env.VIBECODE_REAL_EXPORT, undefined);
});

test('les annonces de succès passent par un écrit accepté', () => {
  const data = readFileSync(join(root, 'src/lib/data.tsx'), 'utf8');
  const invoice = readFileSync(join(root, 'src/app/invoice/[id].tsx'), 'utf8');
  const expense = readFileSync(join(root, 'src/app/expense/[id].tsx'), 'utf8');
  const safety = readFileSync(join(root, 'src/ui/SafetyPanel.tsx'), 'utf8');
  assert.match(data, /canMutateStore\(storageHydrated\(\), isPreserveOnly\(\)\)/);
  assert.match(data, /deletionReported\(deleted, wrote != null\)/);
  assert.match(data, /backupWriteAllowed/);
  assert.match(data, /applyInvoiceSave/);
  assert.match(invoice, /if \(!saved\)/);
  assert.match(expense, /if \(!wrote\)/);
  assert.match(safety, /if \(!data\.resetBusiness\(\)\)/);
});
