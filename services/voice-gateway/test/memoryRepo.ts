import { normName } from '../src/tools/handlers';
import type { AppointmentRow, ClientRow, ContactRow, KbHit, TelephonyRepo } from '../src/tools/repo';

export class MemoryRepo implements TelephonyRepo {
  clients: ClientRow[] = [];
  contacts: ContactRow[] = [];
  dnc: { phone: string; reason: string; source: string }[] = [];
  attempts: { phone: string; status: string }[] = [];
  appointments: AppointmentRow[] = [];
  tasks: { title: string; description: string; priority: number }[] = [];
  calls = new Map<string, { transferredAt: string | null; summary: string | null; outcome?: string; sentiment?: string }>();
  activities: { clientId: string; content: string }[] = [];
  audits: { action: string; entityId: string; summary: string }[] = [];
  kb: KbHit[] = [];

  async findClientByPhone(ownerId: string, phone: string) {
    return this.clients.find((c) => c.ownerId === ownerId && c.phoneE164 === phone) ?? null;
  }
  async findContactByPhone(ownerId: string, phone: string) {
    return this.contacts.find((c) => c.ownerId === ownerId && c.phoneE164 === phone) ?? null;
  }
  async findClientByNameCity(ownerId: string, name: string, city: string) {
    return this.clients.find((c) => c.ownerId === ownerId && normName(c.name) === name && normName(c.city ?? '') === city) ?? null;
  }
  async getClient(id: string) {
    return this.clients.find((c) => c.id === id) ?? null;
  }
  async insertClient(row: ClientRow) {
    this.clients.push(row);
  }
  async insertContact(row: ContactRow) {
    this.contacts.push(row);
  }
  async updateClient(id: string, patch: Partial<ClientRow>) {
    const row = this.clients.find((c) => c.id === id);
    if (row) Object.assign(row, stripUndefined(patch));
  }
  async updateContact(id: string, patch: Partial<ContactRow>) {
    const row = this.contacts.find((c) => c.id === id);
    if (row) Object.assign(row, stripUndefined(patch));
  }
  async insertDnc(row: { ownerId: string; phone: string; source: string; reason: string }) {
    if (!this.dnc.some((d) => d.phone === row.phone)) this.dnc.push({ phone: row.phone, reason: row.reason, source: row.source });
  }
  async cancelFutureAttempts(_ownerId: string, phone: string) {
    let n = 0;
    for (const a of this.attempts) {
      if (a.phone === phone && a.status !== 'termine' && a.status !== 'exclu') {
        a.status = 'exclu';
        n += 1;
      }
    }
    return n;
  }
  async insertAppointment(row: AppointmentRow) {
    this.appointments.push(row);
  }
  async appointmentsOverlapping(ownerId: string, startsAt: string, endsAt: string) {
    const a = Date.parse(startsAt);
    const b = Date.parse(endsAt);
    return this.appointments.filter((row) => row.ownerId === ownerId && Date.parse(row.startsAt) < b && Date.parse(row.endsAt) > a);
  }
  async insertTask(row: { title: string; description: string; priority: number }) {
    this.tasks.push({ title: row.title, description: row.description, priority: row.priority });
  }
  async updateCall(id: string, patch: Record<string, unknown>) {
    const cur = this.calls.get(id) ?? { transferredAt: null, summary: null };
    this.calls.set(id, {
      ...cur,
      summary: (patch.summary as string | undefined) ?? cur.summary,
      outcome: (patch.outcome as string | undefined) ?? cur.outcome,
      sentiment: (patch.sentiment as string | undefined) ?? cur.sentiment,
      transferredAt: (patch.transferred_at as string | undefined) ?? cur.transferredAt,
    });
  }
  async getCall(id: string) {
    return this.calls.get(id) ?? null;
  }
  async insertActivity(row: { clientId: string; content: string }) {
    this.activities.push(row);
  }
  async insertAudit(row: { action: string; entityId: string; summary: string }) {
    this.audits.push(row);
  }
  async searchKb(_ownerId: string, query: string, category?: string) {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return this.kb.filter((article) => {
      if (category && article.category !== category) return false;
      const hay = `${article.title} ${article.body}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  async markClientsDoNotCall(ownerId: string, phone: string) {
    for (const c of this.clients) if (c.ownerId === ownerId && c.phoneE164 === phone) c.doNotCall = true;
    for (const c of this.contacts) if (c.ownerId === ownerId && c.phoneE164 === phone) c.doNotCall = true;
  }
}

function stripUndefined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}
