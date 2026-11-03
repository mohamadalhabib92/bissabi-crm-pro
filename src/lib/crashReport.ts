/** Envoi Sentry uniquement si un DSN réel est fourni. Aucun appel au chargement du module. */

export function shouldReportRemote(dsn: string | null | undefined): boolean {
  const v = (dsn ?? '').trim();
  return v.length > 0 && !v.startsWith('YOUR_');
}

/** Dérive l’URL du magasin depuis le DSN saisi. N’invente pas d’hôte. */
export function sentryStoreUrl(dsn: string): string | null {
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/\//g, '');
    if (!project || !url.username) return null;
    return `${url.protocol}//${url.host}/api/${project}/store/?sentry_version=7&sentry_key=${encodeURIComponent(url.username)}`;
  } catch {
    return null;
  }
}

export async function postSentry(dsn: string | null, error: unknown, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!shouldReportRemote(dsn) || !dsn) return;
  const url = sentryStoreUrl(dsn);
  if (!url) return;
  const message = error instanceof Error ? error.message : String(error);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.slice(0, 500) }),
      signal: ctrl.signal,
    });
  } catch {
    // un journal distant en échec ne doit jamais casser l’écran
  } finally {
    clearTimeout(timer);
  }
}
