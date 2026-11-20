import type { CalendarAdapter, CalendarEventInput } from './types';

/** Adaptateur Microsoft Graph. Sans jeton, il reste inactif : aucun rendez-vous n'est annoncé comme synchronisé. */
export class OutlookCalendarAdapter implements CalendarAdapter {
  readonly id = 'outlook' as const;
  readonly configured: boolean;

  constructor(private readonly accessToken: string | null) {
    this.configured = Boolean(accessToken);
  }

  async createEvent(input: CalendarEventInput): Promise<{ externalEventId: string } | { error: string }> {
    if (!this.accessToken) return { error: 'outlook_non_configure' };
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: input.title,
        body: { contentType: 'text', content: input.description ?? '' },
        start: { dateTime: input.startsAt, timeZone: 'Europe/Zurich' },
        end: { dateTime: input.endsAt, timeZone: 'Europe/Zurich' },
        location: input.location ? { displayName: input.location } : undefined,
      }),
    });
    const json = await res.json() as { id?: string };
    if (!res.ok || !json.id) return { error: `outlook_${res.status}` };
    return { externalEventId: json.id };
  }

  async listBusy(fromIso: string, toIso: string) {
    if (!this.accessToken) return [];
    const res = await fetch('https://graph.microsoft.com/v1.0/me/calendar/getSchedule', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedules: ['me'],
        startTime: { dateTime: fromIso, timeZone: 'Europe/Zurich' },
        endTime: { dateTime: toIso, timeZone: 'Europe/Zurich' },
        availabilityViewInterval: 30,
      }),
    });
    if (!res.ok) return [];
    const json = await res.json() as { value?: { scheduleItems?: { status: string; start: { dateTime: string }; end: { dateTime: string } }[] }[] };
    const items = json.value?.[0]?.scheduleItems ?? [];
    return items.filter((i) => i.status && i.status !== 'free').map((i) => ({ startsAt: i.start.dateTime, endsAt: i.end.dateTime }));
  }
}
