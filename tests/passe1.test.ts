import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { applyRestore, businessCsv, decryptBackup, encryptBackup, parseRestore } from '../src/lib/backup';
import { invoiceHtml } from '../src/lib/documents';
import { isQrIban, isValidIban, mod97 } from '../src/lib/iban';
import { buildCreditNote, canDeleteInvoice, turnoverSign } from '../src/lib/invoices';
import {
  assembleDatabase,
  dataCounts,
  keysToPersist,
  migratePersisted,
  rollbackMigration,
  withoutDemo,
  type PersistedInput,
} from '../src/lib/migrate';
import { formatNumber, nextSequence } from '../src/lib/numbering';
import { buildQrBill, parseQrPayload, QR_PRINT_MM, rasterizeSwissQr } from '../src/lib/qrbill';
import { STORAGE_PREFIX } from '../src/lib/storageKey';
import { DEFAULT_COMPANY, type Account, type Expense, type Invoice, type Offer } from '../src/lib/model';
import jsQR from 'jsqr';

const NOW = '2026-11-02T08:00:00.000Z';
const LATER = '2026-11-02T09:00:00.000Z';

function ibanFromBban(bban: string): string {
  const digits = (bban + 'CH00').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  const check = 98 - mod97(digits);
  return 'CH' + String(check).padStart(2, '0') + bban;
}

function account(partial: Partial<Account> & Pick<Account, 'id' | 'nom'>): Account {
  return {
    type: 'restaurant', etape: 'client_actif', canton: 'VD', ville: 'Lausanne', npa: '1003',
    adresse: 'Rue du Lac 4', livraison_ok: true, mode_logistique: 'Livraison Bissabi',
    contact_nom: 'Alex Martin', contact_role: 'Gérant', contact_email: 'alex@lac.example', contact_tel: '',
    prochaine_action: 'Réassort', prochaine_action_date: '2026-11-10', notes: '', source: 'visite',
    createdAt: '2026-01-15T10:00:00.000Z',
    ...partial,
  };
}

function invoice(partial: Partial<Invoice> & Pick<Invoice, 'id' | 'number'>): Invoice {
  return {
    accountId: 'acc-real-1', date: '2026-03-02', dueDate: '2026-04-01',
    lines: [{ id: 'l-' + partial.id, description: 'Bissabi Red 25cl', qty: 12, unitPrice: 2.5 }],
    vat: { apply: false, rate: 0 }, status: 'sent', notes: '',
    ...partial,
  };
}

function realistic(): PersistedInput {
  const accounts: Account[] = [
    account({ id: 'acc-real-1', nom: 'Café du Port', ville: 'Lausanne', npa: '1006' }),
    account({ id: 'acc-real-2', nom: 'Hôtel du Léman', type: 'hôtel', ville: 'Montreux', npa: '1820' }),
    account({ id: 'acc-real-3', nom: 'Bar du Flon', type: 'bar', ville: 'Lausanne', npa: '1003', contact_email: 'flon@example.ch' }),
    account({ id: 'acc-real-4', nom: 'Brasserie Ouchy', ville: 'Lausanne', npa: '1006' }),
    account({ id: 'acc-real-5', nom: 'Café de Prilly', ville: 'Prilly', npa: '1008' }),
    account({ id: 'acc-real-6', nom: 'Traiteur Riviera', type: 'traiteur', ville: 'Vevey', npa: '1800' }),
    account({ id: 'acc-real-7', nom: 'Épicerie du Bourg', type: 'épicerie', canton: 'GE', ville: 'Genève', npa: '1204', livraison_ok: false }),
    account({ id: 'acc-real-8', nom: 'Restaurant du Parc', ville: 'Morges', npa: '1110' }),
    account({ id: 'demo-a1', nom: 'Café Exemple (démo)', demo: true, ville: 'Lausanne' }),
    account({ id: 'demo-a2', nom: 'Hôtel Démo', demo: true, ville: 'Montreux' }),
  ];
  const offers: Offer[] = [
    { id: 'of-1', number: 'OF-2026-002', accountId: 'acc-real-2', date: '2026-02-01', validUntil: '2026-03-01', lines: [{ id: 'ol1', description: 'Pack essai', qty: 1, unitPrice: 30 }], vat: { apply: false, rate: 0 }, status: 'accepted', notes: '' },
    { id: 'of-2', number: 'OF-2025-014', accountId: 'acc-real-1', date: '2025-11-02', validUntil: '2025-12-02', lines: [{ id: 'ol2', description: 'Red', qty: 24, unitPrice: 2.5 }], vat: { apply: true, rate: 2.6 }, status: 'sent', notes: '' },
    { id: 'demo-o1', number: 'OF-DEMO-001', accountId: 'demo-a1', date: '2026-11-01', validUntil: '2026-12-01', lines: [{ id: 'ol3', description: 'Exemple', qty: 1, unitPrice: 1 }], vat: { apply: false, rate: 8.1 }, status: 'sent', notes: '', demo: true },
  ];
  const invoices: Invoice[] = [
    invoice({ id: 'fa-2024', number: 'FA-2024-7', date: '2024-12-01', dueDate: '2024-12-31', status: 'paid', paidAt: '2024-12-20' }),
    invoice({ id: 'fa-2025', number: 'FA-2025-12', date: '2025-06-15', dueDate: '2025-07-15', status: 'sent', lines: [{ id: 'l1', description: 'Red', qty: 6, unitPrice: 2.5 }, { id: 'l2', description: 'White', qty: 6, unitPrice: 2.5 }] }),
    invoice({ id: 'fa-2026-a', number: 'FA-2026-3', date: '2026-01-20', dueDate: '2026-02-19', status: 'sent' }),
    invoice({ id: 'fa-2026-b', number: 'FA-2026-004', date: '2026-04-02', dueDate: '2026-05-02', status: 'paid', paidAt: '2026-04-28', ext: 'inv:FA-2026-004', source: 'import' }),
    invoice({ id: 'demo-i1', number: 'FA-DEMO-001', accountId: 'demo-a1', status: 'sent', demo: true }),
  ];
  (invoices[0] as Invoice & { internalNote?: string }).internalNote = 'règlement reçu en caisse';
  const expenses: Expense[] = [
    { id: 'ex-1', date: '2026-02-02', category: 'Transport & livraison', supplier: 'Poste', description: 'Tournée Ouest', amountTTC: 42.5, vatAmount: 0, attachment: { name: 'recu-fevrier.jpg', uri: 'file:///receipts/recu-fevrier.jpg', persisted: true } },
    { id: 'ex-2', date: '2026-03-11', category: 'Emballages & bouteilles', supplier: 'Verrerie', description: 'Bouteilles 25cl', amountTTC: 310, vatAmount: 0, attachment: { name: 'facture-verrerie.pdf', uri: 'file:///receipts/verrerie.pdf', persisted: true }, ext: 'exp:verrerie' },
    { id: 'ex-3', date: '2026-05-01', category: 'Marketing & dégustations', supplier: 'Imprimeur', description: 'Cartes', amountTTC: 80, vatAmount: 0 },
    { id: 'demo-e1', date: '2026-11-01', category: 'Autre', supplier: 'Fournisseur exemple', description: 'Dépense d’exemple', amountTTC: 20, vatAmount: 0, demo: true },
  ];
  return {
    accounts,
    offers,
    invoices,
    expenses,
    products: [
      { id: 'prd_bis-red-25', ref: 'BIS-RED-25', nom: 'Bissabi Red 25cl', description: 'Préparé en Suisse', format: '25 cl', prix: 2.5, unite: 'bouteille', canal: 'B2B', tvaTaux: 0, source: 'catalogue' },
      { id: 'prd_bis-white-25', ref: 'BIS-WHITE-25', nom: 'Bissabi White 25cl', description: 'Préparé en Suisse', format: '25 cl', prix: 2.5, unite: 'bouteille', canal: 'B2B', tvaTaux: 0, source: 'catalogue' },
    ],
    counters: { 'FA-2026': 4, 'OF-2026': 2 },
    company: { name: 'Bissabi Drinks - BA', street: 'Chemin de la Suettaz', houseNo: '17', zip: '1008', town: 'Prilly', uid: 'CHE-332.255.936', iban: 'YOUR_SWISS_IBAN', paymentDays: 20, legacyFlag: 'gardé' } as PersistedInput['company'],
    audit: [{ id: 'aud-old', at: '2026-01-20T09:00:00.000Z', action: 'issue', entity: 'invoice', entityId: 'fa-2026-a', detail: 'Émission FA-2026-3' }],
  };
}

describe('migration zéro perte', () => {
  test('comptages, numéros et champs libres identiques, idempotent, retour arrière', () => {
    const raw = realistic();
    const before = dataCounts(raw);
    const once = migratePersisted(raw, NOW);
    const after = dataCounts(once.state);
    assert.equal(once.migrated, true);
    assert.deepEqual(after, before);
    assert.deepEqual(once.state.invoices.map((i) => i.number), raw.invoices!.map((i) => i.number));
    assert.equal((once.state.invoices[0] as Invoice & { internalNote?: string }).internalNote, 'règlement reçu en caisse');
    assert.equal(once.state.invoices.find((i) => i.id === 'fa-2026-b')?.ext, 'inv:FA-2026-004');
    assert.equal(once.state.expenses[0].attachment?.uri, 'file:///receipts/recu-fevrier.jpg');
    assert.equal(once.state.accounts.filter((a) => a.demo === true).length, before.demoAccounts);
    assert.equal(once.state.accounts.filter((a) => a.id === 'acc-real-1')[0].demo, undefined);
    assert.equal((once.state.company as { legacyFlag?: string }).legacyFlag, 'gardé');
    assert.equal(once.state.company.name, 'Bissabi Drinks - BA');
    assert.equal(once.state.company.uid, 'CHE-332.255.936');
    assert.equal(once.state.company.iban, 'YOUR_SWISS_IBAN');
    assert.equal(once.state.company.vatNumber, '');
    assert.equal(once.state.schemaVersion, 1);
    assert.equal(once.state.migrationBackups.length, 1);
    assert.equal(once.state.audit[0].id, 'aud-old');
    assert.equal(once.state.audit.at(-1)?.action, 'migrate');
    assert.deepEqual(keysToPersist(raw, once.state).sort(), ['audit', 'company', 'migrationBackups', 'schemaVersion']);

    const twice = migratePersisted(once.state, LATER);
    assert.equal(twice.migrated, false);
    assert.equal(twice.state.migrationBackups.length, once.state.migrationBackups.length);
    assert.deepEqual(twice.state.invoices, once.state.invoices);
    assert.deepEqual(dataCounts(twice.state), before);

    const back = rollbackMigration(once.state);
    assert.ok(back);
    assert.deepEqual(dataCounts(back), before);
    assert.equal((back.invoices[0] as Invoice & { internalNote?: string }).internalNote, 'règlement reçu en caisse');
    assert.equal(back.schemaVersion, 0);
    assert.equal(back.migrationBackups.length, 0);
    const again = migratePersisted(back, LATER);
    assert.deepEqual(dataCounts(again.state), before);
  });

  test('la démo ne se mélange pas à une base réelle, et le reset démo ne touche pas le réel', () => {
    const raw = realistic();
    const kept = withoutDemo(raw.accounts!);
    assert.equal(kept.length, 8);
    assert.ok(kept.every((a) => a.demo !== true));
    assert.equal(withoutDemo(raw.invoices!).length, 4);
    const onlyCompany = assembleDatabase({ company: true }, { company: { name: 'Bissabi Drinks - BA', iban: 'YOUR_SWISS_IBAN' } });
    assert.equal(onlyCompany.company.name, 'Bissabi Drinks - BA');
    assert.ok(onlyCompany.accounts.some((a) => a.demo === true));
    const withReal = assembleDatabase({ invoices: true, accounts: true }, { invoices: raw.invoices, accounts: raw.accounts });
    assert.equal(withReal.accounts.length, raw.accounts!.length);
    assert.equal(assembleDatabase({ invoices: true }, { invoices: raw.invoices }).accounts.length, 0);
  });
});

describe('numérotation et avoirs', () => {
  test('la suite continue après le dernier numéro, sans réécrire les anciens', () => {
    const numbers = ['FA-2024-7', 'FA-2025-12', 'FA-2026-3', 'FA-2026-004', 'FA-DEMO-001'];
    assert.equal(nextSequence('FA', 2026, numbers, { 'FA-2026': 4 }), 5);
    assert.equal(formatNumber('FA', 2026, 5), 'FA-2026-0005');
    assert.equal(nextSequence('FA', 2026, numbers, { 'FA-2026': 9 }), 10);
    assert.equal(nextSequence('AV', 2026, [], {}), 1);
    assert.equal(formatNumber('AV', 2026, 1), 'AV-2026-0001');
  });

  test('un avoir annule sans changer le numéro ni marquer une facture réelle comme démo', () => {
    const original = invoice({ id: 'fa-2026-a', number: 'FA-2026-3', status: 'sent' });
    assert.equal(canDeleteInvoice(original), false);
    assert.equal(canDeleteInvoice({ ...original, status: 'draft' }), true);
    const { credit, original: cancelled } = buildCreditNote(original, 'av-1', 'AV-2026-0001', '2026-11-02', ['nl']);
    assert.equal(cancelled.number, 'FA-2026-3');
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.creditedBy, 'av-1');
    assert.equal(cancelled.demo, undefined);
    assert.equal(credit.kind, 'credit');
    assert.equal(credit.demo, undefined);
    assert.equal(credit.number, 'AV-2026-0001');
    assert.equal(turnoverSign(cancelled), 1);
    assert.equal(turnoverSign(credit), -1);
    const demo = buildCreditNote({ ...original, demo: true }, 'av-2', 'AV-2026-0002', '2026-11-02', ['nl']);
    assert.equal(demo.credit.demo, true);
  });
});

describe('sauvegarde', () => {
  test('JSON de restauration complet, CSV hors démo, chiffrement aller-retour', async () => {
    const raw = realistic();
    const parsed = parseRestore({ accounts: raw.accounts, invoices: raw.invoices, expenses: raw.expenses, offers: raw.offers });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.data.accounts!.find((a) => a.id === 'acc-real-1')?.demo, undefined);
    assert.equal(parsed.data.invoices!.find((i) => i.number === 'FA-2026-3')?.number, 'FA-2026-3');
    const db = migratePersisted(raw, NOW).state;
    const csv = businessCsv(db, (id) => db.accounts.find((a) => a.id === id)?.nom ?? '');
    assert.match(csv, /Café du Port/);
    assert.match(csv, /FA-2026-3/);
    assert.doesNotMatch(csv, /Café Exemple/);
    assert.doesNotMatch(csv, /FA-DEMO-001/);
    assert.doesNotMatch(csv, /Fournisseur exemple/);
    const file = await encryptBackup(JSON.stringify({ hello: 'bissabi' }), 'phrase-de-test');
    assert.equal(file.format, 'bissabi-crm-pro-backup');
    assert.equal(await decryptBackup(file, 'phrase-de-test'), JSON.stringify({ hello: 'bissabi' }));
    await assert.rejects(() => decryptBackup(file, 'autre-phrase'));
    const restored = applyRestore(db, { accounts: [account({ id: 'acc-new', nom: 'Nouveau Café' })], invoices: [] }, LATER, 'aud-restore');
    assert.equal(restored.accounts.length, 1);
    assert.equal(restored.migrationBackups[0].snapshot.invoices.length, db.invoices.length);
    assert.equal(restored.audit.at(-1)?.action, 'restore');
  });
});

describe('QR-facture 46 mm', () => {
  const debtor = account({ id: 'acc-real-1', nom: 'Café du Port', adresse: 'Rue du Lac 4', npa: '1003', ville: 'Lausanne' });
  const inv = invoice({ id: 'fa-qr', number: 'FA-2026-0008', status: 'issued' });

  test('SPÉCIMEN, section normalisée, libellé hors section, pas de numéro TVA', () => {
    const html = invoiceHtml(DEFAULT_COMPANY, debtor, inv);
    assert.equal(QR_PRINT_MM, 46);
    assert.match(html, /width="46mm"/);
    assert.match(html, /height="46mm"/);
    assert.match(html, /width:62mm/);
    assert.match(html, /width:148mm/);
    assert.match(html, /height:105mm/);
    const scan = html.indexOf('Scannez pour payer (TWINT / e-banking)');
    const slip = html.indexOf('class="slip"');
    assert.ok(scan > 0 && slip > scan);
    assert.match(html, /SPÉCIMEN/);
    assert.match(html, /UID CHE-332\.255\.936/);
    assert.match(html, /Chemin de la Suettaz 17, 1008 Prilly/);
    assert.match(html, /TVA non applicable/);
    assert.doesNotMatch(html, /TVA CHE/);
    assert.doesNotMatch(html, /YOUR_VAT_NUMBER/);
    const forbidden = ['Fruits', 'de', 'Martigny'].join(' ');
    assert.equal(html.includes(forbidden), false);
  });

  test('le QR décodé est égal au payload, QRR ou SCOR selon l’IBAN', () => {
    const qrIban = ibanFromBban('30000123456789012');
    const plainIban = ibanFromBban('00762123456789012');
    assert.equal(isValidIban(qrIban), true);
    assert.equal(isQrIban(qrIban), true);
    assert.equal(isValidIban(plainIban), true);
    assert.equal(isQrIban(plainIban), false);

    for (const [iban, ref] of [[qrIban, 'QRR'], [plainIban, 'SCOR']] as const) {
      const company = { ...DEFAULT_COMPANY, iban };
      const bill = buildQrBill(company, debtor, inv, 30);
      assert.equal(bill.ibanStatus, 'ok');
      assert.equal(bill.referenceType, ref);
      const fields = parseQrPayload(bill.payload);
      assert.equal(fields.qrType, 'SPC');
      assert.equal(fields.version, '0200');
      assert.equal(fields.coding, '1');
      assert.equal(fields.iban, iban);
      assert.equal(fields.creditorName, 'Bissabi Drinks - BA');
      assert.equal(fields.creditorZip, '1008');
      assert.equal(fields.creditorTown, 'Prilly');
      assert.equal(fields.amount, '30.00');
      assert.equal(fields.currency, 'CHF');
      assert.equal(fields.debtorName, 'Café du Port');
      assert.equal(fields.debtorZip, '1003');
      assert.equal(fields.debtorTown, 'Lausanne');
      assert.equal(fields.referenceType, ref);
      assert.equal(fields.message, 'Facture FA-2026-0008');
      assert.equal(fields.trailer, 'EPD');
      const image = rasterizeSwissQr(bill.payload, 8, 4);
      const decoded = jsQR(image.data, image.width, image.height);
      assert.ok(decoded, `QR ${ref} illisible`);
      assert.equal(decoded.data, bill.payload);
      assert.deepEqual(parseQrPayload(decoded.data), fields);
      const html = invoiceHtml(company, debtor, inv);
      assert.doesNotMatch(html, /SPÉCIMEN/);
      assert.match(html, /width="46mm"/);
    }
  });
});

describe('garde-fous', () => {
  test('bundle, clé de stockage, aucun secret et aucune mention interdite dans src', () => {
    assert.equal(STORAGE_PREFIX, '@bissabi-crm-pro/');
    const app = JSON.parse(readFileSync('app.json', 'utf8')) as { expo: { ios: { bundleIdentifier: string } } };
    assert.equal(app.expo.ios.bundleIdentifier, 'com.vibecode.bissabicrmpro-h7qq2g');
    const phrase = ['Fruits', 'de', 'Martigny'].join(' ');
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (/\.(ts|tsx|js|mjs|json)$/.test(name)) out.push(p);
      }
      return out;
    };
    for (const file of walk('src')) {
      const text = readFileSync(file, 'utf8');
      assert.equal(text.includes(phrase), false, file);
      assert.doesNotMatch(text, /process\.env\.EXPO_PUBLIC_EXAMPLE_ENV_VAR/, file);
      assert.doesNotMatch(text, /EXPO_PUBLIC_EXAMPLE_ENV_VAR\s*=/, file);
      assert.doesNotMatch(text, /service_role|sk_live|BEGIN PRIVATE KEY/);
      assert.doesNotMatch(text, /CH\d{19}/);
    }
  });
});
