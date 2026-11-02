import { env } from './config';
import { postSentry } from './crashReport';
import { loadJSON, saveJSON } from './storage';

type CrashRow = { at: string; message: string };

/** DSN public optionnel. YOUR_* ou absent : aucun envoi, y compris au démarrage. */
export function sentryDsn(): string | null {
  return env('EXPO_PUBLIC_SENTRY_DSN', process.env.EXPO_PUBLIC_SENTRY_DSN).value;
}

export async function reportCrash(error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  try {
    const prev = await loadJSON<CrashRow[]>('crashes', []);
    const next = [...(Array.isArray(prev) ? prev : []), { at: new Date().toISOString(), message }].slice(-30);
    await saveJSON('crashes', next);
  } catch {
    // le journal local ne doit pas relancer l’erreur
  }
  await postSentry(sentryDsn(), error);
}
