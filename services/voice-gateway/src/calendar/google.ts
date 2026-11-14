import type { CalendarAdapter, CalendarEventInput } from './types';

type GoogleEnv = {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  calendarId: string | null;
};

export class GoogleCalendarAdapter implements CalendarAdapter {
  readonly id = 'google' as const;
  readonly configured: boolean;

  constructor(private readonly env: GoogleEnv) {
    this.configured = Boolean(env.clientId && env.clientSecret && env.refreshToken && env.calendarId);
  }

  async createEvent(input: CalendarEventInput): Promise<{ externalEventId: string } | { error: string }> {
    if (!this.configured) return { error: 'agenda_non_configure' };
    try {
      const token = await this.accessToken();
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.env.calendarId as string)}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: input.title,
          description: input.description,
          location: input.location,
          start: { dateTime: input.startsAt, timeZone: 'Europe/Zurich' },
          end: { dateTime: input.endsAt, timeZone: 'Europe/Zurich' },
        }),
      });
      const json = await res.json() as { id?: string; error?: { message?: string } };
      if (!res.ok || !json.id) return { error: json.error?.message ?? `google_${res.status}` };
      return { externalEventId: json.id };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'google_error' };
    }
  }

  async listBusy(fromIso: string, toIso: string) {
    if (!this.configured) return [];
    const token = await this.accessToken();
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: fromIso,
        timeMax: toIso,
        timeZone: 'Europe/Zurich',
        items: [{ id: this.env.calendarId }],
      }),
    });
    if (!res.ok) return [];
    const json = await res.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
    const busy = json.calendars?.[this.env.calendarId as string]?.busy ?? [];
    return busy.map((b) => ({ startsAt: b.start, endsAt: b.end }));
  }

  private async accessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.env.clientId as string,
      client_secret: this.env.clientSecret as string,
      refresh_token: this.env.refreshToken as string,
      grant_type: 'refresh_token',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
    const json = await res.json() as { access_token?: string };
    if (!res.ok || !json.access_token) throw new Error('google_oauth');
    return json.access_token;
  }
}
