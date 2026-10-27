/** Formats suisses : CHF 1'234.50, dates JJ.MM.AAAA. */
export function chf(n: number, withCur = true): string {
  const v = Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  const s = (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + '.' + d;
  return withCur ? `CHF ${s}` : s;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dateCH(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}
/** Accepte AAAA-MM-JJ ou JJ.MM.AAAA ; renvoie ISO ou null. */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}
function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
export function parseAmount(s: string): number {
  const n = Number(String(s).replace(/['\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
