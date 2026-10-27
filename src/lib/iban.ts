/** Validation IBAN (mod 97) et détection QR-IBAN (IID 30000–31999). Aucun IBAN n'est inventé ici. */
export const IBAN_PLACEHOLDER = 'YOUR_SWISS_IBAN';
export const compactIban = (s: string) => s.replace(/\s+/g, '').toUpperCase();
export function isPlaceholderIban(s: string) {
  const c = compactIban(s);
  return !c || c.startsWith('YOUR_');
}
export function mod97(numeric: string): number {
  let r = 0;
  for (const ch of numeric) r = (r * 10 + Number(ch)) % 97;
  return r;
}
const toDigits = (s: string) => s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
export function isValidIban(s: string): boolean {
  const c = compactIban(s);
  if (!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(c)) return false;
  return mod97(toDigits(c.slice(4) + c.slice(0, 4))) === 1;
}
export function isQrIban(s: string): boolean {
  const iid = Number(compactIban(s).slice(4, 9));
  return iid >= 30000 && iid <= 31999;
}
export const formatIban = (s: string) => compactIban(s).replace(/(.{4})/g, '$1 ').trim();

/** Référence créancier ISO 11649 (RF..) dérivée du n° de facture. */
export function scorReference(base: string): string {
  const ref = base.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 21);
  const check = 98 - mod97(toDigits(ref + 'RF00'));
  return 'RF' + String(check).padStart(2, '0') + ref;
}
/** Référence QR (27 chiffres, modulo 10 récursif) — uniquement avec un QR-IBAN. */
export function qrReference(base: string): string {
  const digits = base.replace(/\D/g, '').slice(-26).padStart(26, '0');
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const d of digits) carry = table[(carry + Number(d)) % 10];
  return digits + String((10 - carry) % 10);
}
export const isValidScor = (r: string) => /^RF\d{2}[0-9A-Z]{1,21}$/.test(r) && mod97(toDigits(r.slice(4) + r.slice(0, 4))) === 1;
