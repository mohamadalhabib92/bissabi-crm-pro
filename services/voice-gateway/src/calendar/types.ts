export type CalendarEventInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  description?: string;
};

export interface CalendarAdapter {
  readonly id: 'google' | 'outlook' | 'aucun';
  readonly configured: boolean;
  createEvent(input: CalendarEventInput): Promise<{ externalEventId: string } | { error: string }>;
  listBusy(fromIso: string, toIso: string): Promise<{ startsAt: string; endsAt: string }[]>;
}

export const nullCalendar: CalendarAdapter = {
  id: 'aucun',
  configured: false,
  async createEvent() {
    return { error: 'agenda_non_configure' };
  },
  async listBusy() {
    return [];
  },
};
