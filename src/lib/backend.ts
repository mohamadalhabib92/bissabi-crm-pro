import { env } from './config';

/**
 * Variables publiques lues au démarrage, sans aucun appel réseau.
 * BETTER_AUTH_SECRET et DATABASE_URL sont obsolètes (aucun backend dans ce dépôt) :
 * elles restent documentées, elles ne sont pas lues ici.
 * WIX_* et YOUR_EMAIL_PROVIDER_KEY sont réservés à une phase ultérieure, côté serveur.
 */
export const BACKEND_URL: string | null = env('EXPO_PUBLIC_BACKEND_URL', process.env.EXPO_PUBLIC_BACKEND_URL).value;
export const SUPABASE_URL: string | null = env('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL).value;
export const SUPABASE_CONFIGURED = env('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).configured;
export const SERVER_ENV = ['BETTER_AUTH_SECRET', 'DATABASE_URL', 'WIX_SITE_ID', 'WIX_SITE_URL'] as const;
