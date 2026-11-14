export type SqlVerdict = { allowed: boolean; reason: string };

/**
 * Décision finale avant composition.
 * Le bac à sable d'environnement bloque même si la base est en retard.
 * La fonction SQL tel_check_outbound reste obligatoire : une erreur ou un refus empêche l'appel.
 */
export function decideDial(opts: {
  sandboxMode: boolean;
  allowlist: string[];
  phone: string;
  sql: SqlVerdict | 'error';
}): { dial: boolean; reason: string } {
  if (opts.sandboxMode && !opts.allowlist.includes(opts.phone)) {
    return { dial: false, reason: 'sandbox_numero_non_autorise' };
  }
  if (opts.sql === 'error') return { dial: false, reason: 'verification_impossible' };
  if (!opts.sql.allowed) return { dial: false, reason: opts.sql.reason };
  return { dial: true, reason: 'ok' };
}

export function pickVariant<T extends { weight: number }>(variants: T[], rand: number): T | null {
  if (!variants.length) return null;
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total <= 0) return variants[0];
  let cursor = rand * total;
  for (const variant of variants) {
    cursor -= Math.max(0, variant.weight);
    if (cursor < 0) return variant;
  }
  return variants[variants.length - 1];
}

export function shouldLeaveVoicemail(opts: { answeredBy: string; alreadyLeft: boolean; enabled: boolean }): boolean {
  return opts.enabled && !opts.alreadyLeft && (opts.answeredBy === 'machine' || opts.answeredBy === 'fax');
}
