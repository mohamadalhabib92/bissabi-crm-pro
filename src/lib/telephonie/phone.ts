const E164 = /^\+[1-9][0-9]{6,14}$/;

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

export function openingIsValid(line: string): boolean {
  const first = line.trim().split(/[.!?]/)[0] ?? '';
  return /assistante\s+IA\s+de\s+Bissabi/i.test(first);
}
