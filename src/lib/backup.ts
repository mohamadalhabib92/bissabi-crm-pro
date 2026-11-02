import { toCSV } from './csv';
import { isDemo, type Account, type CreditNote, type Expense, type Invoice, type Offer } from './model';
import type { Store } from './migrate';

const ITERATIONS = 120_000;

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function subtle(): SubtleCrypto {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle || !cryptoObj.getRandomValues) {
    throw new Error('Chiffrement indisponible sur cet appareil. L’export JSON en clair reste disponible.');
  }
  return cryptoObj.subtle;
}

async function deriveKey(passphrase: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

/** Fichier chiffré sur l’appareil. La phrase secrète n’est pas stockée. */
export async function encryptBackup(json: string, passphrase: string): Promise<string> {
  if (passphrase.trim().length < 8) throw new Error('Phrase secrète trop courte (8 caractères minimum).');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ['encrypt']);
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
  return JSON.stringify({
    format: 'bissabi-backup',
    v: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(cipher)),
  });
}

export async function decryptBackup(payload: string, passphrase: string): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'Fichier illisible.' };
  }
  if (obj.format !== 'bissabi-backup' || typeof obj.ciphertext !== 'string' || typeof obj.salt !== 'string' || typeof obj.iv !== 'string') {
    return { ok: false, error: 'Ce fichier n’est pas une sauvegarde chiffrée Bissabi.' };
  }
  if (!passphrase) return { ok: false, error: 'Phrase secrète requise.' };
  try {
    const key = await deriveKey(passphrase, b64ToBytes(obj.salt), ['decrypt']);
    const clear = await subtle().decrypt({ name: 'AES-GCM', iv: b64ToBytes(obj.iv) as BufferSource }, key, b64ToBytes(obj.ciphertext) as BufferSource);
    return { ok: true, json: new TextDecoder().decode(clear) };
  } catch {
    return { ok: false, error: 'Phrase secrète incorrecte ou fichier altéré. Aucune donnée n’a été écrite.' };
  }
}

function demoCol(row: { demo?: boolean }): string {
  return isDemo(row) ? 'oui' : 'non';
}

/** CSV lisible. La colonne `demo` sépare les exemples des données réelles. Le JSON reste la sauvegarde complète. */
export function fullCsv(store: Store): string {
  const name = (id: string) => store.accounts.find((a) => a.id === id)?.nom ?? '';
  const accounts: unknown[][] = [
    ['# comptes'],
    ['id', 'nom', 'type', 'etape', 'canton', 'ville', 'npa', 'adresse', 'livraison_ok', 'contact_email', 'demo'],
    ...store.accounts.filter((a) => !isDemo(a)).map((a: Account) => [a.id, a.nom, a.type, a.etape, a.canton, a.ville, a.npa ?? '', a.adresse ?? '', a.livraison_ok, a.contact_email, demoCol(a)]),
  ];
  const offers: unknown[][] = [
    ['# offres'],
    ['id', 'numero', 'compte', 'date', 'statut', 'demo'],
    ...store.offers.filter((o) => !isDemo(o)).map((o: Offer) => [o.id, o.number, name(o.accountId), o.date, o.status, demoCol(o)]),
  ];
  const invoices: unknown[][] = [
    ['# factures'],
    ['id', 'numero', 'compte', 'date', 'echeance', 'statut', 'demo'],
    ...store.invoices.filter((i) => !isDemo(i)).map((i: Invoice) => [i.id, i.number, name(i.accountId), i.date, i.dueDate, i.status, demoCol(i)]),
  ];
  const credits: unknown[][] = [
    ['# avoirs'],
    ['id', 'numero', 'facture', 'compte', 'date', 'demo'],
    ...store.creditNotes.filter((c) => !isDemo(c)).map((c: CreditNote) => [c.id, c.number, c.invoiceNumber, name(c.accountId), c.date, demoCol(c)]),
  ];
  const expenses: unknown[][] = [
    ['# depenses'],
    ['id', 'date', 'categorie', 'fournisseur', 'montant_ttc', 'tva', 'justificatif', 'demo'],
    ...store.expenses.filter((e) => !isDemo(e)).map((e: Expense) => [e.id, e.date, e.category, e.supplier, e.amountTTC, e.vatAmount, e.attachment?.name ?? '', demoCol(e)]),
  ];
  return toCSV([...accounts, [], ...offers, [], ...invoices, [], ...credits, [], ...expenses]);
}

export function plainExport(store: Store): Record<string, unknown> {
  return {
    accounts: store.accounts,
    offers: store.offers,
    invoices: store.invoices,
    expenses: store.expenses,
    company: store.company,
    products: store.products,
    counters: store.counters,
    creditNotes: store.creditNotes,
    audit: store.audit,
    backups: store.backups,
    schemaVersion: store.schemaVersion,
  };
}
