import type { AuditEvent } from './audit';
import { toCSV } from './csv';
import { bookTotals } from './invoices';
import {
  dataCounts,
  migratePersisted,
  type DataCounts,
  type Database,
  type MigrationBackup,
  type PersistedInput,
} from './migrate';
import { STORAGE_PREFIX } from './storageKey';
import type { Account, Company, Expense, Invoice, Offer, Product } from './model';

export const RESTORE_FORMAT = 'bissabi-crm-pro-restore';
export const ENCRYPTED_FORMAT = 'bissabi-crm-pro-backup';
const ITERATIONS = 120_000;

export type EncryptedBackup = {
  format: typeof ENCRYPTED_FORMAT;
  v: 1;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  cipher: 'AES-GCM';
  salt: string;
  iv: string;
  ciphertext: string;
};

export type RestoreFile = {
  format: typeof RESTORE_FORMAT;
  v: 1;
  exportedAt: string;
  app: 'bissabi-crm-pro';
  storagePrefix: typeof STORAGE_PREFIX;
  data: PersistedInput;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/\s/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const len = (clean.length / 4) * 3 - pad;
  const out = new Uint8Array(len);
  let j = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] === '=' ? 0 : B64.indexOf(clean[i + 2])) << 6) |
      (clean[i + 3] === '=' ? 0 : B64.indexOf(clean[i + 3]));
    if (j < len) out[j++] = (n >> 16) & 255;
    if (j < len) out[j++] = (n >> 8) & 255;
    if (j < len) out[j++] = n & 255;
  }
  return out;
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error('Chiffrement indisponible sur cet appareil.');
  return c;
}

export function isEncryptedBackup(v: unknown): v is EncryptedBackup {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<EncryptedBackup>;
  return o.format === ENCRYPTED_FORMAT && o.cipher === 'AES-GCM' && typeof o.ciphertext === 'string' && typeof o.salt === 'string' && typeof o.iv === 'string';
}

export async function encryptBackup(json: string, passphrase: string): Promise<EncryptedBackup> {
  const pass = passphrase.trim();
  if (pass.length < 4) throw new Error('Phrase secrète trop courte (4 caractères minimum).');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await subtle().importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json)));
  return {
    format: ENCRYPTED_FORMAT,
    v: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    cipher: 'AES-GCM',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(cipher),
  };
}

const bytes = (raw: Uint8Array): BufferSource => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

export async function decryptBackup(file: EncryptedBackup, passphrase: string): Promise<string> {
  const salt = base64ToBytes(file.salt);
  const iv = base64ToBytes(file.iv);
  const keyMaterial = await subtle().importKey('raw', new TextEncoder().encode(passphrase.trim()), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey(
    { name: 'PBKDF2', salt: bytes(salt), iterations: file.iterations || ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  try {
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(base64ToBytes(file.ciphertext)));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('Phrase secrète incorrecte, ou fichier endommagé.');
  }
}

export function exportRestoreFile(db: Database, exportedAt: string): RestoreFile {
  return {
    format: RESTORE_FORMAT,
    v: 1,
    exportedAt,
    app: 'bissabi-crm-pro',
    storagePrefix: STORAGE_PREFIX,
    data: {
      accounts: db.accounts,
      offers: db.offers,
      invoices: db.invoices,
      expenses: db.expenses,
      company: db.company,
      products: db.products,
      counters: db.counters,
      audit: db.audit,
      schemaVersion: db.schemaVersion,
      migrationBackups: db.migrationBackups,
    },
  };
}

function asArray<T>(v: unknown, label: string): T[] | string {
  if (v == null) return [];
  if (!Array.isArray(v)) return `${label} doit être une liste.`;
  return v as T[];
}

/** Accepte le fichier de restauration et l'ancien export JSON plat. Ne pose jamais demo:true. */
export function parseRestore(input: unknown): { ok: true; data: PersistedInput; counts: DataCounts } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Fichier illisible.' };
  const root = input as Record<string, unknown>;
  const payload = root.format === RESTORE_FORMAT && root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  const accounts = asArray<Account>(payload.accounts, 'Comptes');
  const offers = asArray<Offer>(payload.offers, 'Offres');
  const invoices = asArray<Invoice>(payload.invoices, 'Factures');
  const expenses = asArray<Expense>(payload.expenses, 'Dépenses');
  const products = asArray<Product>(payload.products, 'Produits');
  const audit = asArray<AuditEvent>(payload.audit, 'Journal');
  const backups = asArray<MigrationBackup>(payload.migrationBackups, 'Sauvegardes');
  const err = [accounts, offers, invoices, expenses, products, audit, backups].find((x) => typeof x === 'string');
  if (typeof err === 'string') return { ok: false, error: err };
  for (const inv of invoices as Invoice[]) {
    if (!inv || typeof inv !== 'object' || typeof inv.id !== 'string' || typeof inv.number !== 'string') {
      return { ok: false, error: 'Une facture du fichier n’a pas d’identifiant ou de numéro.' };
    }
  }
  const company = payload.company && typeof payload.company === 'object' ? (payload.company as Partial<Company>) : undefined;
  const counters = payload.counters && typeof payload.counters === 'object' && !Array.isArray(payload.counters) ? (payload.counters as Record<string, number>) : {};
  const data: PersistedInput = {
    accounts: accounts as Account[],
    offers: offers as Offer[],
    invoices: invoices as Invoice[],
    expenses: expenses as Expense[],
    products: products as Product[],
    audit: audit as AuditEvent[],
    migrationBackups: backups as MigrationBackup[],
    company,
    counters,
    schemaVersion: typeof payload.schemaVersion === 'number' ? payload.schemaVersion : undefined,
  };
  return { ok: true, data, counts: dataCounts(data) };
}

/** Restaure le fichier et conserve un snapshot de l'état précédent (retour arrière). */
export function applyRestore(prev: Database, incoming: PersistedInput, now: string, auditId: string): Database {
  const migrated = migratePersisted(incoming, now);
  const safety: MigrationBackup = {
    id: `bak-restore-${now}`,
    at: now,
    fromVersion: prev.schemaVersion,
    toVersion: prev.schemaVersion,
    snapshot: {
      accounts: prev.accounts,
      offers: prev.offers,
      invoices: prev.invoices,
      expenses: prev.expenses,
      company: prev.company,
      products: prev.products,
      counters: prev.counters,
      audit: prev.audit,
      schemaVersion: prev.schemaVersion,
    },
  };
  return {
    ...migrated.state,
    migrationBackups: [safety, ...migrated.state.migrationBackups].slice(0, 5),
    audit: [
      ...migrated.state.audit,
      { id: auditId, at: now, action: 'restore', entity: 'system', detail: 'Restauration d’un fichier de sauvegarde' },
    ],
  };
}

/** CSV métier : les lignes demo:true sont exclues. Le JSON de restauration, lui, est complet. */
export function businessCsv(db: Database, accountName: (id: string) => string): string {
  const accounts = db.accounts.filter((a) => a.demo !== true);
  const invoices = db.invoices.filter((i) => i.demo !== true);
  const expenses = db.expenses.filter((e) => e.demo !== true);
  const acc = toCSV([
    ['nom', 'type', 'etape', 'canton', 'ville', 'livraison_ok', 'mode_logistique', 'contact_nom', 'contact_role', 'contact_email', 'contact_tel', 'prochaine_action', 'prochaine_action_date', 'notes', 'source'],
    ...accounts.map((a) => [a.nom, a.type, a.etape, a.canton, a.ville, a.livraison_ok ? 'true' : 'false', a.mode_logistique, a.contact_nom, a.contact_role, a.contact_email, a.contact_tel, a.prochaine_action, a.prochaine_action_date, a.notes, a.source]),
  ]);
  const inv = toCSV([
    ['numero', 'date', 'echeance', 'client', 'statut', 'type', 'ht', 'tva', 'ttc', 'tva_oui_non'],
    ...invoices.map((i) => {
      const t = bookTotals(i);
      return [i.number, i.date, i.dueDate, accountName(i.accountId), i.status, i.kind === 'credit' ? 'avoir' : 'facture', t ? t.ht.toFixed(2) : '', t ? t.tva.toFixed(2) : '', t ? t.ttc.toFixed(2) : '', i.vat.apply ? 'Oui' : 'Non'];
    }),
  ]);
  const exp = toCSV([
    ['date', 'categorie', 'fournisseur', 'description', 'montant_ttc', 'tva', 'justificatif'],
    ...expenses.map((e) => [e.date, e.category, e.supplier, e.description, e.amountTTC.toFixed(2), (e.vatAmount || 0).toFixed(2), e.attachment?.name ?? '']),
  ]);
  return `# comptes\n${acc}\n\n# factures\n${inv}\n\n# depenses\n${exp}\n`;
}
