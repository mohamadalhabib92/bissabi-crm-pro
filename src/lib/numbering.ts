/**
 * Numérotation continue.
 * Les numéros déjà stockés ne sont jamais réécrits.
 * La série reprend après le plus grand suffixe de l’année (et le compteur, qui ne baisse jamais).
 * Famille installée : FA-AAAA-NNNN. Si l’année ne contient que des numéros AAAA-NNNN, on continue dans ce format.
 */

export type DocPrefix = 'FA' | 'OF' | 'AV';

export function yearSerials(numbers: string[], year: number, prefix: DocPrefix): { prefixed: number; bare: number } {
  let prefixed = 0;
  let bare = 0;
  const reP = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const reB = new RegExp(`^${year}-(\\d+)$`);
  for (const raw of numbers) {
    const n = raw.trim();
    const a = reP.exec(n);
    if (a) prefixed = Math.max(prefixed, Number(a[1]));
    else if (prefix === 'FA') {
      const b = reB.exec(n);
      if (b) bare = Math.max(bare, Number(b[1]));
    }
  }
  return { prefixed, bare };
}

function padded(n: number): string {
  return String(n).padStart(4, '0');
}

export function nextSerial(opts: {
  prefix: DocPrefix;
  year: number;
  numbers: string[];
  counters: Record<string, number>;
}): { number: string; counters: Record<string, number> } {
  const { prefix, year, numbers, counters } = opts;
  const { prefixed, bare } = yearSerials(numbers, year, prefix);
  const prefixedKey = `${prefix}-${year}`;
  const bareKey = `INV-${year}`;
  const counterP = counters[prefixedKey] ?? 0;
  const counterB = prefix === 'FA' ? (counters[bareKey] ?? 0) : 0;
  const usedPrefixed = prefixed > 0 || counterP > 0;
  const usedBare = prefix === 'FA' && (bare > 0 || counterB > 0);
  const bareStyle = prefix === 'FA' && usedBare && !usedPrefixed;
  let n = bareStyle ? Math.max(bare, counterB) + 1 : Math.max(prefixed, bare, counterP, counterB) + 1;
  const taken = new Set(numbers.map((x) => x.trim()));
  const format = (value: number) => (bareStyle ? `${year}-${padded(value)}` : `${prefix}-${year}-${padded(value)}`);
  let candidate = format(n);
  while (taken.has(candidate)) {
    n += 1;
    candidate = format(n);
  }
  const next = { ...counters };
  if (bareStyle) next[bareKey] = Math.max(n, next[bareKey] ?? 0);
  else next[prefixedKey] = Math.max(n, next[prefixedKey] ?? 0);
  return { number: candidate, counters: next };
}

/** Hausse le compteur jusqu’au dernier numéro connu. Ne diminue jamais une clé. */
export function raiseCounters(input: {
  invoices: string[];
  offers: string[];
  creditNotes: string[];
  counters: Record<string, number>;
}): Record<string, number> {
  const out = { ...input.counters };
  const bump = (key: string, value: number) => {
    if (value > (out[key] ?? 0)) out[key] = value;
  };
  const years = new Set<number>();
  const collect = (numbers: string[], prefix: DocPrefix) => {
    for (const raw of numbers) {
      const m = new RegExp(`^(?:${prefix}-)?(\\d{4})-\\d+$`).exec(raw.trim());
      if (m && (prefix !== 'FA' ? raw.trim().startsWith(prefix + '-') : true)) years.add(Number(m[1]));
    }
  };
  collect(input.invoices, 'FA');
  collect(input.offers, 'OF');
  collect(input.creditNotes, 'AV');
  for (const year of years) {
    const inv = yearSerials(input.invoices, year, 'FA');
    if (inv.prefixed > 0) bump(`FA-${year}`, Math.max(inv.prefixed, inv.bare));
    else if (inv.bare > 0) bump(`INV-${year}`, inv.bare);
    bump(`OF-${year}`, yearSerials(input.offers, year, 'OF').prefixed);
    bump(`AV-${year}`, yearSerials(input.creditNotes, year, 'AV').prefixed);
  }
  return out;
}
