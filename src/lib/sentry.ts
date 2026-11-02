import { env } from './config';
import { loadJSON, saveJSON } from './storage';

/** Désactivé tant que le DSN est absent ou un placeholder YOUR_*. Aucun envoi au démarrage. */
export const sentryEnv = env('EXPO_PUBLIC_SENTRY_DSN', process.env.EXPO_PUBLIC_SENTRY_DSN);

type CrashEntry = { at: string; message: string; stack?: string; info?: string };

function parseDsn(dsn: string): { store: string; key: string } | null {
  try {
    const u = new URL(dsn);
    const key = decodeURIComponent(u.username);
    const project = u.pathname.replace(/^\//, '');
    if (!key || !project || !u.host) return null;
    return { store: `${u.protocol}//${u.host}/api/${project}/store/`, key };
  } catch {
    return null;
  }
}

/** Journal local toujours. Réseau uniquement si un DSN réel est configuré, et seulement après un crash. */
export async function reportCrash(error: unknown, info?: string): Promise<void> {
  const entry: CrashEntry = {
    at: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
    info: info?.slice(0, 2000),
  };
  try {
    const prev = await loadJSON<CrashEntry[]>('crashLog', []);
    const list = Array.isArray(prev) ? prev : [];
    await saveJSON('crashLog', [...list, entry].slice(-10));
  } catch {
    // le journal local ne doit pas provoquer un second crash
  }
  if (!sentryEnv.configured || !sentryEnv.value) return;
  const target = parseDsn(sentryEnv.value);
  if (!target) return;
  try {
    const body = JSON.stringify({
      message: entry.message,
      level: 'error',
      platform: 'javascript',
      timestamp: entry.at,
      extra: { info: entry.info, stack: entry.stack },
    });
    await fetch(target.store, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=bissabi-crm/1.0`,
      },
      body,
    });
  } catch {
    // hors ligne : le crash reste dans crashLog
  }
}
