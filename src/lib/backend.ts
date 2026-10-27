import { env } from './config';

/** Seule variable lue côté client. BETTER_AUTH_SECRET / DATABASE_URL / WIX_* restent côté serveur (jamais dans le frontend). */
export const BACKEND_URL: string | null = env('EXPO_PUBLIC_BACKEND_URL', process.env.EXPO_PUBLIC_BACKEND_URL).value;
export const SERVER_ENV = ['BETTER_AUTH_SECRET', 'DATABASE_URL', 'WIX_SITE_ID', 'WIX_SITE_URL'] as const;
