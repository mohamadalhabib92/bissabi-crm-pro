/** La première phrase doit porter l'annonce « assistante IA de Bissabi ». */
export function openingIsValid(line: string): boolean {
  const first = line.trim().split(/[.!?]/)[0] ?? '';
  return /assistante\s+IA\s+de\s+Bissabi/i.test(first);
}

/**
 * Même règle que le check SQL : IA/AI en casse exacte (pas le « ai » de « j'ai »),
 * ou les formes longues sans tenir compte de la casse.
 */
export function openingDisclosesAi(line: string): boolean {
  return /\b(?:IA|AI)\b/.test(line) || /intelligence artificielle|artificial intelligence/i.test(line);
}

export const DEFAULT_OUTBOUND_OPENING =
  "Bonjour, je suis l'assistante IA de Bissabi. Cet échange est transcrit pour le suivi, sans enregistrement audio. Je vous appelle au sujet de nos boissons à l'hibiscus, préparées en Suisse.";

export const DEFAULT_INBOUND_OPENING =
  "Bonjour, je suis l'assistante IA de Bissabi. Cet échange est transcrit pour le suivi, sans enregistrement audio. Comment puis-je vous aider ?";

export const DEFAULT_VOICEMAIL =
  "Bonjour, je suis l'assistante IA de Bissabi. Je vous appelais au sujet de nos boissons à l'hibiscus, préparées en Suisse. Vous pouvez nous rappeler sur ce numéro. Bonne journée.";
