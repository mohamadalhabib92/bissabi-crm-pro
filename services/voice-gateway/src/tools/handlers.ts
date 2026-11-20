import { randomUUID } from 'node:crypto';
import { nextStage } from '../crm/stage';
import { toE164 } from '../compliance/phone';
import type { CalendarAdapter } from '../calendar/types';
import type { AppointmentRow, ClientRow, ContactRow, TelephonyRepo } from './repo';

export const OUTCOMES = [
  'interesse', 'a_rappeler', 'refus', 'ne_plus_appeler', 'rdv_pris', 'echantillon', 'catalogue',
  'transfere', 'message_laisse', 'info_donnee', 'commande', 'sav', 'autre',
] as const;
export const SENTIMENTS = ['tres_negatif', 'negatif', 'neutre', 'positif', 'tres_positif'] as const;

const CONTACT_FIELDS = ['role', 'email', 'is_decision_maker', 'language'] as const;
const CLIENT_FIELDS = ['stage', 'qualification', 'preferred_language', 'best_call_hours'] as const;
const KNOWN_UPDATE_FIELDS = new Set<string>([...CONTACT_FIELDS, ...CLIENT_FIELDS, 'client_id', 'contact_id']);

const REFUSAL = /(ne (me )?rappelez plus|ne plus (m'|me )?appeler|pas int[ée]ress[ée]|retir\w* mon num[ée]ro|ne me contactez plus|arr[êe]tez (de |vos )?(appels|d[ée]march)|pas de d[ée]marchage|je ne veux pas (être |d'être )?(d[ée]march|appel))/i;

export type ToolContext = {
  ownerId: string;
  callId: string;
  now: Date;
  phone: string;
  clientId: string | null;
  contactId: string | null;
  repo: TelephonyRepo;
  calendar: CalendarAdapter;
  transferPhone: string | null;
  transferAllowed: () => Promise<{ allowed: boolean; reason: string }>;
  slotAllowed: (startsAt: Date, endsAt: Date) => { allowed: boolean; reason: string };
};

export function normName(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isSolicitationRefusal(text: string): boolean {
  return REFUSAL.test(text);
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  switch (name) {
    case 'create_lead': return createLead(args, ctx);
    case 'update_contact': return updateContact(args, ctx);
    case 'lookup_knowledge_base': return lookupKb(args, ctx);
    case 'check_availability': return checkAvailability(args, ctx);
    case 'book_meeting': return bookMeeting(args, ctx);
    case 'transfer_call': return transferCall(args, ctx);
    case 'add_to_dnc': return addToDnc(args, ctx);
    case 'log_call_summary': return logCallSummary(args, ctx);
    default: return { ok: false, error: 'outil_inconnu' };
  }
}

async function createLead(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const company = String(args.company_name ?? '').trim();
  const phone = toE164(String(args.phone_e164 ?? ctx.phone));
  if (!company || !phone) return { ok: false, error: 'nom_ou_telephone_invalide' };
  const city = String(args.city ?? '').trim();
  const byPhone = await ctx.repo.findClientByPhone(ctx.ownerId, phone)
    ?? (await ctx.repo.findContactByPhone(ctx.ownerId, phone));
  if (byPhone && 'relationship' in byPhone) {
    return { ok: true, created: false, client_id: byPhone.id, reason: 'doublon_telephone' };
  }
  if (byPhone && 'clientId' in byPhone) {
    return { ok: true, created: false, client_id: byPhone.clientId, contact_id: byPhone.id, reason: 'doublon_telephone' };
  }
  if (city) {
    const byName = await ctx.repo.findClientByNameCity(ctx.ownerId, normName(company), normName(city));
    if (byName) return { ok: true, created: false, client_id: byName.id, reason: 'doublon_nom_ville' };
  }
  const clientId = id('cli');
  const contactId = id('ctc');
  const client: ClientRow = {
    id: clientId,
    ownerId: ctx.ownerId,
    name: company,
    city: city || null,
    canton: args.canton ? String(args.canton).toUpperCase() : null,
    type: args.sector ? String(args.sector) : null,
    phoneE164: phone,
    email: args.email ? String(args.email) : null,
    stage: 'prospect',
    relationship: 'prospect',
    isB2b: true,
    doNotCall: false,
    qualification: {},
    preferredLanguage: args.language ? String(args.language) : 'fr',
    bestCallHours: null,
    businessUnit: args.business_unit === 'home_made' ? 'home_made' : 'drinks',
    source: 'telephonie_ia',
    lastCallAt: null,
    lastCallOutcome: null,
  };
  const contact: ContactRow = {
    id: contactId,
    ownerId: ctx.ownerId,
    clientId,
    name: args.contact_name ? String(args.contact_name) : company,
    role: args.contact_role ? String(args.contact_role) : null,
    email: client.email,
    phoneE164: phone,
    language: client.preferredLanguage,
    isDecisionMaker: null,
    doNotCall: false,
  };
  await ctx.repo.insertClient(client);
  await ctx.repo.insertContact(contact);
  await ctx.repo.insertAudit({
    ownerId: ctx.ownerId, entity: 'clients', entityId: clientId, action: 'create_lead',
    summary: `Lead téléphonie : ${company}`,
  });
  return { ok: true, created: true, client_id: clientId, contact_id: contactId };
}

async function updateContact(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const unknown = Object.keys(args).filter((k) => !KNOWN_UPDATE_FIELDS.has(k));
  if (unknown.length) return { ok: false, error: 'champ_interdit', fields: unknown };
  const clientId = String(args.client_id ?? ctx.clientId ?? '');
  const contactId = String(args.contact_id ?? ctx.contactId ?? '');
  if (!clientId && !contactId) return { ok: false, error: 'cible_absente' };
  if (contactId && (args.role != null || args.email != null || args.is_decision_maker != null || args.language != null)) {
    await ctx.repo.updateContact(contactId, {
      role: args.role != null ? String(args.role) : undefined,
      email: args.email != null ? String(args.email) : undefined,
      isDecisionMaker: typeof args.is_decision_maker === 'boolean' ? args.is_decision_maker : undefined,
      language: args.language != null ? String(args.language) : undefined,
    });
  }
  if (clientId) {
    const patch: Partial<ClientRow> = {};
    if (args.stage != null) patch.stage = String(args.stage);
    if (args.preferred_language != null) patch.preferredLanguage = String(args.preferred_language);
    if (args.language != null && patch.preferredLanguage == null) patch.preferredLanguage = String(args.language);
    if (args.best_call_hours != null) patch.bestCallHours = String(args.best_call_hours);
    if (args.qualification && typeof args.qualification === 'object') {
      const current = (await ctx.repo.getClient(clientId))?.qualification ?? {};
      patch.qualification = { ...current, ...(args.qualification as Record<string, string>) };
    }
    if (Object.keys(patch).length) await ctx.repo.updateClient(clientId, patch);
  }
  await ctx.repo.insertAudit({
    ownerId: ctx.ownerId,
    entity: 'clients',
    entityId: clientId || contactId,
    action: 'update_contact',
    summary: 'Mise à jour pendant un appel',
  });
  return { ok: true };
}

async function lookupKb(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const query = String(args.query ?? '').trim();
  if (!query) return { ok: false, error: 'requete_vide' };
  const hits = await ctx.repo.searchKb(
    ctx.ownerId,
    query,
    args.category ? String(args.category) : undefined,
    args.language ? String(args.language) : undefined,
  );
  const priceAsk = /prix|tarif|co[uû]te|chf/i.test(query) || args.category === 'tarifs';
  if (!hits.length) {
    return {
      ok: true,
      found: false,
      articles: [],
      instruction: priceAsk
        ? 'Aucun tarif publié. Ne pas inventer de prix. Dire que quelqu’un confirmera le chiffre.'
        : 'Rien dans la base publiée. Ne pas inventer. Proposer un rappel.',
    };
  }
  return {
    ok: true,
    found: true,
    articles: hits.slice(0, 3).map((h) => ({ title: h.title, body: h.body, category: h.category })),
    instruction: 'Répondre uniquement avec ces textes. Ne pas compléter par un prix absent.',
  };
}

async function checkAvailability(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const date = String(args.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'date_invalide' };
  const duration = Number(args.duration_minutes ?? 30);
  const slots: { starts_at: string; ends_at: string }[] = [];
  for (const start of ['09:00', '10:00', '14:00', '15:00', '16:00']) {
    const startsAt = zurichLocal(date, start);
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    const gate = ctx.slotAllowed(startsAt, endsAt);
    if (!gate.allowed) continue;
    const busy = await ctx.repo.appointmentsOverlapping(ctx.ownerId, startsAt.toISOString(), endsAt.toISOString());
    const cal = ctx.calendar.configured ? await ctx.calendar.listBusy(startsAt.toISOString(), endsAt.toISOString()) : [];
    if (!busy.length && !cal.length) slots.push({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() });
  }
  return { ok: true, slots };
}

async function bookMeeting(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  if (args.confirmed_orally !== true) return { ok: false, error: 'confirmation_orale_requise' };
  const startsAt = new Date(String(args.starts_at ?? ''));
  const endsAt = new Date(String(args.ends_at ?? ''));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return { ok: false, error: 'creneau_invalide' };
  }
  const gate = ctx.slotAllowed(startsAt, endsAt);
  if (!gate.allowed) return { ok: false, error: gate.reason };
  const clientId = String(args.client_id ?? ctx.clientId ?? '');
  if (!clientId) return { ok: false, error: 'compte_absent' };
  const overlap = await ctx.repo.appointmentsOverlapping(ctx.ownerId, startsAt.toISOString(), endsAt.toISOString());
  if (overlap.length) return { ok: false, error: 'creneau_occupe' };
  let provider: AppointmentRow['calendarProvider'] = 'aucun';
  let externalEventId: string | null = null;
  if (ctx.calendar.configured) {
    const created = await ctx.calendar.createEvent({
      title: String(args.title ?? 'Rendez-vous Bissabi'),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      location: args.location ? String(args.location) : undefined,
      description: args.notes ? String(args.notes) : undefined,
    });
    if ('error' in created) return { ok: false, error: created.error };
    provider = ctx.calendar.id === 'outlook' ? 'outlook' : 'google';
    externalEventId = created.externalEventId;
  }
  const appointmentId = id('apt');
  await ctx.repo.insertAppointment({
    id: appointmentId,
    ownerId: ctx.ownerId,
    clientId,
    contactId: args.contact_id ? String(args.contact_id) : ctx.contactId,
    callId: ctx.callId,
    kind: args.kind ? String(args.kind) : 'degustation',
    title: String(args.title ?? 'Rendez-vous Bissabi'),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    location: args.location ? String(args.location) : null,
    status: 'confirme',
    calendarProvider: provider,
    externalEventId,
    notes: args.notes ? String(args.notes) : null,
  });
  return {
    ok: true,
    appointment_id: appointmentId,
    external_event_id: externalEventId,
    calendar: provider,
    note: provider === 'aucun' ? 'Rendez-vous noté. L’agenda externe n’est pas connecté : à reporter à la main.' : undefined,
  };
}

async function transferCall(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const call = await ctx.repo.getCall(ctx.callId);
  if (call?.transferredAt) return { ok: false, error: 'deja_transfere' };
  const gate = await ctx.transferAllowed();
  const whisper = String(args.whisper ?? '').trim();
  if (!gate.allowed) {
    await ctx.repo.insertTask({
      ownerId: ctx.ownerId,
      clientId: ctx.clientId,
      contactId: ctx.contactId,
      title: 'Rappel demandé (transfert hors plage)',
      description: `${String(args.reason ?? '')} ${whisper}`.trim(),
      priority: args.urgency === 'haute' ? 1 : 2,
    });
    return { ok: true, transferred: false, callback: true, reason: gate.reason };
  }
  if (!ctx.transferPhone) return { ok: false, error: 'numero_transfert_absent' };
  return {
    ok: true,
    transferred: true,
    to: ctx.transferPhone,
    whisper,
    timeout_seconds: 20,
    say: 'Je vous mets en relation. Un instant, s’il vous plaît.',
  };
}

async function addToDnc(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const phone = toE164(String(args.phone_e164 ?? ctx.phone));
  if (!phone) return { ok: false, error: 'telephone_invalide' };
  const reason = String(args.reason ?? 'refus de sollicitation').trim();
  await ctx.repo.insertDnc({
    ownerId: ctx.ownerId,
    phone,
    source: args.source ? String(args.source) : 'demande_orale',
    reason,
    clientId: ctx.clientId,
    callId: ctx.callId,
  });
  await ctx.repo.markClientsDoNotCall(ctx.ownerId, phone);
  const cancelled = await ctx.repo.cancelFutureAttempts(ctx.ownerId, phone);
  await ctx.repo.insertAudit({
    ownerId: ctx.ownerId,
    entity: 'tel_dnc_list',
    entityId: phone,
    action: 'add_to_dnc',
    summary: reason,
  });
  return { ok: true, phone_e164: phone, cancelled_attempts: cancelled };
}

export async function logCallSummary(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const outcome = String(args.outcome ?? '');
  if (!OUTCOMES.includes(outcome as (typeof OUTCOMES)[number])) return { ok: false, error: 'resultat_invalide' };
  const sentiment = args.sentiment ? String(args.sentiment) : 'neutre';
  if (!SENTIMENTS.includes(sentiment as (typeof SENTIMENTS)[number])) return { ok: false, error: 'sentiment_invalide' };
  const summary = String(args.summary ?? '').trim();
  if (!summary) return { ok: false, error: 'resume_vide' };
  const leadScore = args.lead_score == null ? null : Number(args.lead_score);
  if (leadScore != null && (!Number.isInteger(leadScore) || leadScore < 0 || leadScore > 100)) {
    return { ok: false, error: 'score_invalide' };
  }
  await ctx.repo.updateCall(ctx.callId, {
    outcome,
    sentiment,
    summary,
    next_steps: args.next_steps ? String(args.next_steps) : null,
    lead_score: leadScore,
    qualification: args.qualification ?? {},
  });
  if (ctx.clientId) {
    const client = await ctx.repo.getClient(ctx.clientId);
    const stage = nextStage(client?.stage, outcome);
    const patch: Partial<ClientRow> = {
      lastCallAt: ctx.now.toISOString(),
      lastCallOutcome: outcome,
    };
    if (stage) patch.stage = stage;
    if (outcome === 'commande' && client?.relationship === 'prospect') patch.relationship = 'client_actif';
    if (args.qualification && typeof args.qualification === 'object') {
      patch.qualification = { ...(client?.qualification ?? {}), ...(args.qualification as Record<string, string>) };
    }
    await ctx.repo.updateClient(ctx.clientId, patch);
    await ctx.repo.insertActivity({
      ownerId: ctx.ownerId,
      clientId: ctx.clientId,
      content: summary,
    });
  }
  if (outcome === 'ne_plus_appeler' || outcome === 'refus' || isSolicitationRefusal(summary)) {
    await addToDnc({ reason: summary, source: 'demande_orale' }, ctx);
  }
  return { ok: true };
}

export async function ensureSummary(ctx: ToolContext, transcript: string): Promise<void> {
  const call = await ctx.repo.getCall(ctx.callId);
  if (!call || call.summary) return;
  const text = transcript.trim();
  const summary = text
    ? `Résumé automatique : ${text.slice(0, 480)}`
    : 'Appel terminé sans transcription exploitable.';
  const outcome = isSolicitationRefusal(text) ? 'ne_plus_appeler' : 'autre';
  await logCallSummary({ outcome, sentiment: 'neutre', summary }, ctx);
}

/** Interprète une heure murale Europe/Zurich (AAAA-MM-JJ + HH:MM) en instant UTC. */
export function zurichLocal(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const utcGuess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Zurich',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(utcGuess))) {
    if (p.type !== 'literal') bag[p.type] = p.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(Number(bag.year), Number(bag.month) - 1, Number(bag.day), hour, Number(bag.minute), Number(bag.second));
  return new Date(utcGuess - (asUtc - utcGuess));
}
