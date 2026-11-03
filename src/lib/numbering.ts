/**
 * Numérotation continue.
 * Les numéros déjà stockés ne sont jamais réécrits.
 * La série reprend après le plus grand suffixe de l’année (et le compteur, qui ne baisse jamais).
 * Factures : on continue la série qui porte le plus grand numéro (FA-AAAA-NNNN par défaut, FAC-AAAA-NNNN après un
 * import Vibecode, ou AAAA-NNNN si l’année ne contient que ce format). Installation neuve : FA-AAAA-0001.
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

/** Préfixes qui ne sont jamais des séries de factures (offres, avoirs, commandes, devis Vibecode). */
const NON_INVOICE_PREFIXES = new Set(['OF', 'AV', 'CMD', 'DEV']);

/**
 * Séries de factures d’une année : préfixe → plus grand numéro ('' = format nu AAAA-NNNN).
 * Toute série « LETTRES-AAAA-NNNN » compte (FA, FAC importée de Vibecode, …).
 */
export function invoiceSeries(numbers: string[], year: number, counters: Record<string, number> = {}): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (k: string, v: number) => { if (v > 0 && v > (out.get(k) ?? 0)) out.set(k, v); };
  const reP = new RegExp(`^([A-Z]{1,6})-${year}-(\\d+)$`);
  const reB = new RegExp(`^${year}-(\\d+)$`);
  for (const raw of numbers) {
    const n = raw.trim();
    const a = reP.exec(n);
    if (a) { if (!NON_INVOICE_PREFIXES.has(a[1])) bump(a[1], Number(a[2])); continue; }
    const b = reB.exec(n);
    if (b) bump('', Number(b[1]));
  }
  const reK = new RegExp(`^([A-Z]{1,6})-${year}$`);
  for (const [key, value] of Object.entries(counters)) {
    const m = reK.exec(key);
    if (!m || typeof value !== 'number' || !Number.isFinite(value) || NON_INVOICE_PREFIXES.has(m[1])) continue;
    bump(m[1] === 'INV' ? '' : m[1], value);
  }
  return out;
}

/** Série de factures dominante : celle qui porte le plus grand numéro (FA en cas d’égalité). */
function dominantPrefix(series: Map<string, number>): string | null {
  let best: string | null = null;
  let max = -1;
  for (const [prefix, value] of series) {
    if (prefix === '') continue;
    if (value > max || (value === max && prefix === 'FA')) { best = prefix; max = value; }
  }
  return best;
}

/** Préfixe de facture de la dernière année utilisée avant `year` (pour continuer FAC l’année suivante). */
function carriedPrefix(numbers: string[], year: number): string | null {
  let bestYear = -1;
  let prefix: string | null = null;
  for (const raw of numbers) {
    const m = /^([A-Z]{1,6})-(\d{4})-\d+$/.exec(raw.trim());
    if (!m || NON_INVOICE_PREFIXES.has(m[1])) continue;
    const y = Number(m[2]);
    if (y >= year || y < bestYear) continue;
    if (y > bestYear) { bestYear = y; prefix = dominantPrefix(invoiceSeries(numbers, y)); }
  }
  return prefix;
}

export function nextSerial(opts: {
  prefix: DocPrefix;
  year: number;
  numbers: string[];
  counters: Record<string, number>;
}): { number: string; counters: Record<string, number> } {
  const { prefix, year, numbers, counters } = opts;
  const taken = new Set(numbers.map((x) => x.trim()));
  if (prefix !== 'FA') {
    const key = `${prefix}-${year}`;
    let n = Math.max(yearSerials(numbers, year, prefix).prefixed, counters[key] ?? 0) + 1;
    let candidate = `${prefix}-${year}-${padded(n)}`;
    while (taken.has(candidate)) { n += 1; candidate = `${prefix}-${year}-${padded(n)}`; }
    return { number: candidate, counters: { ...counters, [key]: Math.max(n, counters[key] ?? 0) } };
  }
  // Factures : on continue la série la plus haute (FA-, FAC-… ou format nu), sans jamais renuméroter.
  const series = invoiceSeries(numbers, year, counters);
  const dominant = dominantPrefix(series);
  const bareStyle = !dominant && series.has('');
  const family = bareStyle ? '' : dominant ?? carriedPrefix(numbers, year) ?? 'FA';
  let n = Math.max(0, ...series.values()) + 1;
  const format = (value: number) => (family === '' ? `${year}-${padded(value)}` : `${family}-${year}-${padded(value)}`);
  let candidate = format(n);
  while (taken.has(candidate)) {
    n += 1;
    candidate = format(n);
  }
  const key = family === '' ? `INV-${year}` : `${family}-${year}`;
  return { number: candidate, counters: { ...counters, [key]: Math.max(n, counters[key] ?? 0) } };
}

/**
 * Ne baisse jamais un compteur : max(actuel, fichier ou snapshot, plus haut numéro présent).
 * Les numéros des deux jeux de documents comptent, même si l’un va quitter la liste active.
 */
export function mergeCounters(input: {
  current: Record<string, number>;
  incoming: Record<string, number>;
  invoices: string[];
  offers: string[];
  creditNotes: string[];
}): Record<string, number> {
  const base: Record<string, number> = { ...input.current };
  for (const [key, value] of Object.entries(input.incoming)) {
    if (typeof value === 'number' && Number.isFinite(value)) base[key] = Math.max(base[key] ?? 0, value);
  }
  return raiseCounters({
    invoices: input.invoices,
    offers: input.offers,
    creditNotes: input.creditNotes,
    counters: base,
  });
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
      const re = prefix === 'FA' ? /^(?:[A-Z]{1,6}-)?(\d{4})-\d+$/ : new RegExp(`^${prefix}-(\\d{4})-\\d+$`);
      const m = re.exec(raw.trim());
      if (m) years.add(Number(m[1]));
    }
  };
  collect(input.invoices, 'FA');
  collect(input.offers, 'OF');
  collect(input.creditNotes, 'AV');
  for (const year of years) {
    const inv = yearSerials(input.invoices, year, 'FA');
    if (inv.prefixed > 0) bump(`FA-${year}`, Math.max(inv.prefixed, inv.bare));
    else if (inv.bare > 0) bump(`INV-${year}`, inv.bare);
    // Autres séries de factures (ex. FAC importée de Vibecode) : leur compteur ne baisse jamais non plus.
    for (const [p, value] of invoiceSeries(input.invoices, year)) if (p !== '' && p !== 'FA') bump(`${p}-${year}`, value);
    bump(`OF-${year}`, yearSerials(input.offers, year, 'OF').prefixed);
    bump(`AV-${year}`, yearSerials(input.creditNotes, year, 'AV').prefixed);
  }
  return out;
}
