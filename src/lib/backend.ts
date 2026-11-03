import { env } from './config';

/**
 * Seule URL lue côté client, et jamais appelée au démarrage.
 * BETTER_AUTH_SECRET / DATABASE_URL / WIX_* restent côté serveur.
 * EXPO_PUBLIC_EXAMPLE_ENV_VAR a été retirée : ne pas la réintroduire.
 * Aucun parcours ne dépend d’un service qui répondrait 402.
 */
export const BACKEND_URL: string | null = env('EXPO_PUBLIC_BACKEND_URL', process.env.EXPO_PUBLIC_BACKEND_URL).value;
export const SERVER_ENV = ['BETTER_AUTH_SECRET', 'DATABASE_URL', 'WIX_SITE_ID', 'WIX_SITE_URL'] as const;
