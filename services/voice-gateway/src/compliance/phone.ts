const E164 = /^\+[1-9][0-9]{6,14}$/;

/** Numéro suisse local ou international → E.164. Vide si ce n'est pas un numéro. */
export function toE164(input: string): string | null {
  const raw = input.replace(/[\s()./-]/g, '');
  if (!raw) return null;
  let n = raw;
  if (n.startsWith('00')) n = `+${n.slice(2)}`;
  else if (n.startsWith('+')) n = `+${n.slice(1).replace(/\D/g, '')}`;
  else if (n.startsWith('0')) n = `+41${n.slice(1).replace(/\D/g, '')}`;
  else n = `+${n.replace(/\D/g, '')}`;
  return E164.test(n) ? n : null;
}

export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return `***${digits.slice(-4)}`;
}
