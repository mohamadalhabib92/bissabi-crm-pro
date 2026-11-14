export type ClientRow = {
  id: string;
  ownerId: string;
  name: string;
  city: string | null;
  canton: string | null;
  type: string | null;
  phoneE164: string | null;
  email: string | null;
  stage: string | null;
  relationship: string;
  isB2b: boolean;
  doNotCall: boolean;
  qualification: Record<string, string>;
  preferredLanguage: string | null;
  bestCallHours: string | null;
  businessUnit: string;
  source: string | null;
  lastCallAt: string | null;
  lastCallOutcome: string | null;
};

export type ContactRow = {
  id: string;
  ownerId: string;
  clientId: string;
  name: string;
  role: string | null;
  email: string | null;
  phoneE164: string | null;
  language: string | null;
  isDecisionMaker: boolean | null;
  doNotCall: boolean;
};

export type AppointmentRow = {
  id: string;
  ownerId: string;
  clientId: string;
  contactId: string | null;
  callId: string | null;
  kind: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  status: string;
  calendarProvider: 'google' | 'outlook' | 'aucun';
  externalEventId: string | null;
  notes: string | null;
};

export type KbHit = { title: string; body: string; category: string; language: string };

export interface TelephonyRepo {
  findClientByPhone(ownerId: string, phone: string): Promise<ClientRow | null>;
  findContactByPhone(ownerId: string, phone: string): Promise<ContactRow | null>;
  findClientByNameCity(ownerId: string, name: string, city: string): Promise<ClientRow | null>;
  getClient(id: string): Promise<ClientRow | null>;
  insertClient(row: ClientRow): Promise<void>;
  insertContact(row: ContactRow): Promise<void>;
  updateClient(id: string, patch: Partial<ClientRow>): Promise<void>;
  updateContact(id: string, patch: Partial<ContactRow>): Promise<void>;
  insertDnc(row: { ownerId: string; phone: string; source: string; reason: string; clientId: string | null; callId: string | null }): Promise<void>;
  cancelFutureAttempts(ownerId: string, phone: string): Promise<number>;
  insertAppointment(row: AppointmentRow): Promise<void>;
  appointmentsOverlapping(ownerId: string, startsAt: string, endsAt: string): Promise<AppointmentRow[]>;
  insertTask(row: { ownerId: string; clientId: string | null; contactId: string | null; title: string; description: string; priority: number }): Promise<void>;
  updateCall(id: string, patch: Record<string, unknown>): Promise<void>;
  getCall(id: string): Promise<{ transferredAt: string | null; summary: string | null } | null>;
  insertActivity(row: { ownerId: string; clientId: string; content: string }): Promise<void>;
  insertAudit(row: { ownerId: string; entity: string; entityId: string; action: string; summary: string }): Promise<void>;
  searchKb(ownerId: string, query: string, category?: string, language?: string): Promise<KbHit[]>;
  markClientsDoNotCall(ownerId: string, phone: string): Promise<void>;
}
