/**
 * Lecture des variables d'environnement publiques Expo.
 * Toute valeur absente ou commençant par « YOUR_ » est considérée comme
 * non configurée : l'app reste alors en mode local / démo, sans crash.
 */
export function env(name: string, value: string | undefined): { name: string; value: string | null; configured: boolean } {
  const v = (value ?? '').trim();
  const configured = v.length > 0 && !v.startsWith('YOUR_');
  return { name, value: configured ? v : null, configured };
}
