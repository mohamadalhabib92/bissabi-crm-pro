import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normName } from './tools/handlers';
import type { AppointmentRow, ClientRow, ContactRow, KbHit, TelephonyRepo } from './tools/repo';

export function createServiceClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class SupabaseTelephonyRepo implements TelephonyRepo {
  constructor(private readonly db: SupabaseClient) {}

  async findClientByPhone(ownerId: string, phone: string) {
    const { data, error } = await this.db.from('clients').select('*').eq('owner_id', ownerId).eq('phone_e164', phone).maybeSingle();
    fail(error);
    return data ? mapClient(data) : null;
  }
  async findContactByPhone(ownerId: string, phone: string) {
    const { data, error } = await this.db.from('contacts').select('*').eq('owner_id', ownerId).eq('phone_e164', phone).maybeSingle();
    fail(error);
    return data ? mapContact(data) : null;
  }
  async findClientByNameCity(ownerId: string, name: string, city: string) {
    const { data, error } = await this.db.from('clients').select('*').eq('owner_id', ownerId).ilike('city', city).limit(30);
    fail(error);
    return (data ?? []).map(mapClient).find((c) => normName(c.name) === name && normName(c.city ?? '') === city) ?? null;
  }
  async getClient(id: string) {
    const { data, error } = await this.db.from('clients').select('*').eq('id', id).maybeSingle();
    fail(error);
    return data ? mapClient(data) : null;
  }
  async insertClient(row: ClientRow) {
    fail((await this.db.from('clients').insert(clientToDb(row))).error);
  }
  async insertContact(row: ContactRow) {
    fail((await this.db.from('contacts').insert({
      id: row.id, owner_id: row.ownerId, client_id: row.clientId, name: row.name, role: row.role,
      email: row.email, phone: row.phoneE164, phone_e164: row.phoneE164, language: row.language,
      is_decision_maker: row.isDecisionMaker, do_not_call: row.doNotCall,
    })).error);
  }
  async updateClient(id: string, patch: Partial<ClientRow>) {
    const db: Record<string, unknown> = {};
    if (patch.stage != null) db.stage = patch.stage;
    if (patch.email !== undefined) db.email = patch.email;
    if (patch.doNotCall != null) db.do_not_call = patch.doNotCall;
    if (patch.qualification) db.qualification = patch.qualification;
    if (patch.preferredLanguage !== undefined) db.preferred_language = patch.preferredLanguage;
    if (patch.bestCallHours !== undefined) db.best_call_hours = patch.bestCallHours;
    if (patch.relationship) db.relationship = patch.relationship;
    if (patch.lastCallAt !== undefined) db.last_call_at = patch.lastCallAt;
    if (patch.lastCallOutcome !== undefined) db.last_call_outcome = patch.lastCallOutcome;
    if (!Object.keys(db).length) return;
    fail((await this.db.from('clients').update(db).eq('id', id)).error);
  }
  async updateContact(id: string, patch: Partial<ContactRow>) {
    const db: Record<string, unknown> = {};
    if (patch.role !== undefined) db.role = patch.role;
    if (patch.email !== undefined) db.email = patch.email;
    if (patch.language !== undefined) db.language = patch.language;
    if (patch.isDecisionMaker !== undefined) db.is_decision_maker = patch.isDecisionMaker;
    if (patch.doNotCall != null) db.do_not_call = patch.doNotCall;
    if (!Object.keys(db).length) return;
    fail((await this.db.from('contacts').update(db).eq('id', id)).error);
  }
  async insertDnc(row: { ownerId: string; phone: string; source: string; reason: string; clientId: string | null; callId: string | null }) {
    const { error } = await this.db.from('tel_dnc_list').upsert({
      owner_id: row.ownerId, phone_e164: row.phone, source: row.source, reason: row.reason,
      client_id: row.clientId, call_id: row.callId,
    }, { onConflict: 'owner_id,phone_e164' });
    fail(error);
  }
  async cancelFutureAttempts(ownerId: string, phone: string) {
    const { data, error } = await this.db.from('tel_campaign_contacts')
      .update({ status: 'exclu', exclusion_reason: 'liste_ne_pas_appeler' })
      .eq('owner_id', ownerId).eq('phone_e164', phone)
      .in('status', ['en_attente', 'planifie', 'a_rappeler', 'en_cours'])
      .select('id');
    fail(error);
    return data?.length ?? 0;
  }
  async insertAppointment(row: AppointmentRow) {
    fail((await this.db.from('appointments').insert({
      id: row.id, owner_id: row.ownerId, client_id: row.clientId, contact_id: row.contactId, call_id: row.callId,
      kind: row.kind, title: row.title, starts_at: row.startsAt, ends_at: row.endsAt, location: row.location,
      status: row.status, calendar_provider: row.calendarProvider, external_event_id: row.externalEventId, notes: row.notes,
    })).error);
  }
  async appointmentsOverlapping(ownerId: string, startsAt: string, endsAt: string) {
    const { data, error } = await this.db.from('appointments').select('*').eq('owner_id', ownerId).lt('starts_at', endsAt).gt('ends_at', startsAt);
    fail(error);
    return (data ?? []).map((row) => ({
      id: String(row.id), ownerId, clientId: String(row.client_id), contactId: row.contact_id, callId: row.call_id,
      kind: row.kind, title: row.title, startsAt: row.starts_at, endsAt: row.ends_at, location: row.location,
      status: row.status, calendarProvider: row.calendar_provider, externalEventId: row.external_event_id, notes: row.notes,
    })) as AppointmentRow[];
  }
  async insertTask(row: { ownerId: string; clientId: string | null; contactId: string | null; title: string; description: string; priority: number }) {
    fail((await this.db.from('tasks').insert({
      id: `task_${randomUUID()}`, owner_id: row.ownerId, client_id: row.clientId, contact_id: row.contactId,
      title: row.title, description: row.description, priority: row.priority, source: 'ia_appel', done: false,
    })).error);
  }
  async updateCall(id: string, patch: Record<string, unknown>) {
    fail((await this.db.from('tel_calls').update(patch).eq('id', id)).error);
  }
  async getCall(id: string) {
    const { data, error } = await this.db.from('tel_calls').select('transferred_at, summary').eq('id', id).maybeSingle();
    fail(error);
    return data ? { transferredAt: data.transferred_at, summary: data.summary } : null;
  }
  async insertActivity(row: { ownerId: string; clientId: string; content: string }) {
    fail((await this.db.from('activities').insert({
      id: `act_${randomUUID()}`, owner_id: row.ownerId, client_id: row.clientId, type: 'APPEL', content: row.content,
    })).error);
  }
  async insertAudit(row: { ownerId: string; entity: string; entityId: string; action: string; summary: string }) {
    fail((await this.db.from('audit_log').insert({
      id: `aud_${randomUUID()}`, owner_id: row.ownerId, entity: row.entity, entity_id: row.entityId,
      action: row.action, summary: row.summary,
    })).error);
  }
  async searchKb(ownerId: string, query: string, category?: string, language?: string) {
    let q = this.db.from('kb_articles').select('title, body, category, language').eq('owner_id', ownerId).eq('status', 'publie').limit(20);
    if (category) q = q.eq('category', category);
    if (language) q = q.eq('language', language);
    const { data, error } = await q;
    fail(error);
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return ((data ?? []) as KbHit[]).filter((article) => {
      const hay = `${article.title} ${article.body}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  async markClientsDoNotCall(ownerId: string, phone: string) {
    fail((await this.db.from('clients').update({ do_not_call: true }).eq('owner_id', ownerId).eq('phone_e164', phone)).error);
    fail((await this.db.from('contacts').update({ do_not_call: true }).eq('owner_id', ownerId).eq('phone_e164', phone)).error);
  }
}

function mapClient(row: Record<string, unknown>): ClientRow {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name ?? ''),
    city: (row.city as string | null) ?? null,
    canton: (row.canton as string | null) ?? null,
    type: (row.type as string | null) ?? null,
    phoneE164: (row.phone_e164 as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    stage: (row.stage as string | null) ?? null,
    relationship: String(row.relationship ?? 'prospect'),
    isB2b: row.is_b2b !== false,
    doNotCall: row.do_not_call === true,
    qualification: (row.qualification as Record<string, string>) ?? {},
    preferredLanguage: (row.preferred_language as string | null) ?? null,
    bestCallHours: (row.best_call_hours as string | null) ?? null,
    businessUnit: String(row.business_unit ?? 'drinks'),
    source: (row.source as string | null) ?? null,
    lastCallAt: (row.last_call_at as string | null) ?? null,
    lastCallOutcome: (row.last_call_outcome as string | null) ?? null,
  };
}

function mapContact(row: Record<string, unknown>): ContactRow {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    clientId: String(row.client_id),
    name: String(row.name ?? ''),
    role: (row.role as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phoneE164: (row.phone_e164 as string | null) ?? null,
    language: (row.language as string | null) ?? null,
    isDecisionMaker: (row.is_decision_maker as boolean | null) ?? null,
    doNotCall: row.do_not_call === true,
  };
}

function clientToDb(row: ClientRow) {
  return {
    id: row.id, owner_id: row.ownerId, name: row.name, city: row.city, canton: row.canton, type: row.type,
    phone: row.phoneE164, phone_e164: row.phoneE164, email: row.email, stage: row.stage, relationship: row.relationship,
    is_b2b: row.isB2b, do_not_call: row.doNotCall, qualification: row.qualification,
    preferred_language: row.preferredLanguage, business_unit: row.businessUnit, source: row.source,
  };
}

export async function checkOutboundSql(db: SupabaseClient, args: {
  ownerId: string; clientId: string; phone: string; campaignId?: string | null; at?: string;
}): Promise<{ allowed: boolean; reason: string } | 'error'> {
  const { data, error } = await db.rpc('tel_check_outbound', {
    p_owner: args.ownerId,
    p_client_id: args.clientId,
    p_phone: args.phone,
    p_campaign_id: args.campaignId ?? null,
    p_at: args.at ?? new Date().toISOString(),
  });
  if (error || !Array.isArray(data) || !data[0]) return 'error';
  return { allowed: data[0].allowed === true, reason: String(data[0].reason ?? 'verification_impossible') };
}
