export function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, service: 'voice-gateway', ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}
