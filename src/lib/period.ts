export type Period = 'month' | 'quarter' | 'year' | 'all';
export const PERIODS: { label: string; value: Period }[] = [
  { label: 'Mois', value: 'month' }, { label: 'Trimestre', value: 'quarter' }, { label: 'Année', value: 'year' }, { label: 'Tout', value: 'all' },
];
export function inPeriod(iso: string | undefined, p: Period, ref = new Date()): boolean {
  if (!iso) return false;
  if (p === 'all') return true;
  const [y, m] = iso.split('-').map(Number);
  if (y !== ref.getFullYear()) return false;
  if (p === 'year') return true;
  if (p === 'month') return m === ref.getMonth() + 1;
  return Math.floor((m - 1) / 3) === Math.floor(ref.getMonth() / 3);
}
