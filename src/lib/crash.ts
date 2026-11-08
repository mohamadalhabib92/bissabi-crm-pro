import { env } from './config';
import { postSentry } from './crashReport';
import { nextCrashLog } from './preserve';
import { readRaw, saveJSON } from './storage';

type CrashRow = { at: string; message: string };

/** DSN public optionnel. YOUR_* ou absent : aucun envoi, y compris au démarrage. */
export function sentryDsn(): string | null {
  return env('EXPO_PUBLIC_SENTRY_DSN', process.env.EXPO_PUBLIC_SENTRY_DSN).value;
}

export async function reportCrash(error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  try {
    const raw = await readRaw('crashes');
    const decision = nextCrashLog(raw, { at: new Date().toISOString(), message });
    if (decision.action === 'write') await saveJSON('crashes', JSON.parse(decision.value) as CrashRow[]);
  } catch {
    // le journal local ne doit pas relancer l’erreur, ni écraser un blob illisible
  }
  await postSentry(sentryDsn(), error);
}
