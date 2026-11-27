/**
 * Ce que l’app iPad ne fait pas quand elle tourne sur Mac.
 * `null` = ne rien faire et ne rien dire (haptique). Les autres renvoient un message à montrer.
 */
export type MacLimit = 'haptics' | 'print' | 'documentPicker' | 'telephony';

const MESSAGES: Record<Exclude<MacLimit, 'haptics'>, string> = {
  print: 'L’impression et le PDF natif ne sont pas disponibles quand l’app iPad tourne sur Mac. Ouvrez Bissabi CRM Pro sur iPhone ou iPad pour imprimer. Les données de cet appareil ne sont pas modifiées.',
  documentPicker: 'Le sélecteur de documents iOS ne s’ouvre pas sur Mac. Collez le contenu dans le champ, ou ouvrez l’app sur iPhone ou iPad. Rien n’est importé tant que vous ne confirmez pas.',
  telephony: 'Les appels ne partent pas depuis le Mac. L’onglet Téléphonie fonctionne sur iPhone et iPad. Les clients, offres et factures déjà enregistrés sur cet appareil restent en place.',
};

export function macLimitMessage(feature: MacLimit): string | null {
  if (feature === 'haptics') return null;
  return MESSAGES[feature];
}
