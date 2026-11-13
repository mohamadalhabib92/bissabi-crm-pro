import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nullCalendar } from '../src/calendar/types';
import {
  checkOutbound,
  checkTransferWindow,
  defaultWindows,
  type CheckRequest,
  type ClientFacts,
  type TelSettings,
} from '../src/compliance/engine';
import { decideDial, pickVariant, shouldLeaveVoicemail } from '../src/compliance/gate';
import { VAUD_HOLIDAYS } from '../src/compliance/holidays';
import { DEFAULT_INBOUND_OPENING, DEFAULT_OUTBOUND_OPENING, openingIsValid } from '../src/compliance/opening';
import { toE164 } from '../src/compliance/phone';
import { signTelnyx, twilioSignature, verifyTelnyxSignature, verifyTwilioSignature } from '../src/telephony/signature';
import { executeTool, zurichLocal, type ToolContext } from '../src/tools/handlers';
import { nextStage } from '../src/crm/stage';
import { ToolBatch, grokForceMessage, grokSessionUpdate, isBargeIn, telnyxClearFrame } from '../src/voice/protocol';
import { EuPipelineAdapter, euPipelineContract } from '../src/voice/types';
import { MemoryRepo } from './memoryRepo';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const settings: TelSettings = {
  timezone: 'Europe/Zurich',
  homeCanton: 'VD',
  b2bOnly: true,
  sandboxMode: false,
  sandboxAllowlist: ['+41790000000'],
  directoryCheckMaxAgeDays: 180,
};

function client(over: Partial<ClientFacts> = {}): ClientFacts {
  return {
    id: 'cli_1',
    type: 'Épicerie fine',
    canton: 'VD',
    isB2b: true,
    relationship: 'prospect',
    directoryStatus: 'inscrit_ok',
    directoryCheckedAt: new Date('2026-11-01T08:00:00Z'),
    doNotCall: false,
    ...over,
  };
}

function req(over: Partial<CheckRequest> = {}): CheckRequest {
  return {
    at: new Date('2026-11-16T09:00:00Z'),
    phone: '+41211234567',
    settings,
    client: client(),
    contactDoNotCall: false,
    onDnc: false,
    windows: defaultWindows(),
    holidays: VAUD_HOLIDAYS,
    campaignId: null,
    callerListed: null,
    ...over,
  };
}

test('lundi 10:00 Zurich autorisé pour une épicerie inscrite', () => {
  const r = checkOutbound(req());
  assert.deepEqual(r, { allowed: true, reason: 'ok' });
});

test('dimanche, samedi, pause de midi, fin de plage exclusive, Noël et Jeûne sont refusés', () => {
  assert.equal(checkOutbound(req({ at: new Date('2026-11-15T09:00:00Z') })).reason, 'dimanche');
  assert.equal(checkOutbound(req({ at: new Date('2026-11-14T09:00:00Z') })).reason, 'samedi');
  assert.equal(checkOutbound(req({ at: new Date('2026-11-16T11:30:00Z') })).reason, 'hors_plage_horaire');
  assert.equal(checkOutbound(req({ at: new Date('2026-11-16T10:30:00Z') })).reason, 'hors_plage_horaire');
  assert.equal(checkOutbound(req({ at: new Date('2026-12-25T09:00:00Z') })).reason, 'jour_ferie');
  assert.equal(checkOutbound(req({ at: new Date('2026-09-21T08:00:00Z') })).reason, 'jour_ferie');
  assert.equal(checkOutbound(req({ at: new Date('2026-08-01T08:00:00Z') })).reason, 'jour_ferie');
});

test('HORECA seulement 14:30–17:00', () => {
  const cafe = client({ type: 'CAFE' });
  assert.equal(checkOutbound(req({ client: cafe, at: new Date('2026-11-16T09:00:00Z') })).reason, 'hors_plage_horaire');
  assert.equal(checkOutbound(req({ client: cafe, at: new Date('2026-11-16T12:00:00Z') })).reason, 'hors_plage_horaire');
  assert.equal(checkOutbound(req({ client: cafe, at: new Date('2026-11-16T13:00:00Z') })).reason, 'hors_plage_horaire');
  assert.equal(checkOutbound(req({ client: cafe, at: new Date('2026-11-16T14:00:00Z') })).reason, 'ok');
  assert.equal(checkOutbound(req({ client: client({ type: 'restaurant' }), at: new Date('2026-11-16T14:00:00Z') })).reason, 'ok');
  assert.equal(checkOutbound(req({ at: new Date('2026-11-16T14:00:00Z') })).reason, 'ok');
});

test('annuaire, DNC, B2B, client actif et vérification périmée', () => {
  assert.equal(checkOutbound(req({ client: client({ directoryStatus: 'inscrit_asterisque' }) })).reason, 'annuaire_inscrit_asterisque');
  assert.equal(checkOutbound(req({ client: client({ directoryStatus: 'non_inscrit' }) })).reason, 'annuaire_non_inscrit');
  assert.equal(checkOutbound(req({ client: client({ directoryStatus: 'inconnu' }) })).reason, 'annuaire_inconnu');
  assert.equal(checkOutbound(req({ onDnc: true })).reason, 'liste_ne_pas_appeler');
  assert.equal(checkOutbound(req({ client: client({ doNotCall: true }) })).reason, 'compte_ne_pas_appeler');
  assert.equal(checkOutbound(req({ contactDoNotCall: true })).reason, 'contact_ne_pas_appeler');
  assert.equal(checkOutbound(req({ client: client({ isB2b: false }) })).reason, 'non_b2b');
  assert.equal(checkOutbound(req({
    client: client({ directoryCheckedAt: new Date('2025-01-01T00:00:00Z') }),
  })).reason, 'verification_annuaire_perimee');
  assert.equal(checkOutbound(req({
    client: client({ relationship: 'client_actif', directoryStatus: 'non_inscrit', directoryCheckedAt: null }),
  })).reason, 'ok');
});

test('bac à sable et numéro appelant non inscrit', () => {
  const sand = { ...settings, sandboxMode: true };
  assert.equal(checkOutbound(req({ settings: sand })).reason, 'sandbox_numero_non_autorise');
  assert.equal(checkOutbound(req({ settings: sand, phone: '+41790000000' })).reason, 'ok');
  assert.equal(checkOutbound(req({ campaignId: 'camp', callerListed: false })).reason, 'numero_appelant_non_inscrit');
  assert.equal(checkOutbound(req({ campaignId: 'camp', callerListed: true })).reason, 'ok');
  assert.equal(checkOutbound(req({ settings: sand, phone: '+41790000000', campaignId: 'camp', callerListed: false })).reason, 'ok');
});

test('le dialer refuse sans SQL, hors liste, et compose seulement si les deux portes sont ouvertes', () => {
  assert.equal(decideDial({ sandboxMode: true, allowlist: ['+41791111111'], phone: '+41210000000', sql: { allowed: true, reason: 'ok' } }).reason, 'sandbox_numero_non_autorise');
  assert.equal(decideDial({ sandboxMode: false, allowlist: [], phone: '+41210000000', sql: 'error' }).reason, 'verification_impossible');
  assert.equal(decideDial({ sandboxMode: false, allowlist: [], phone: '+41210000000', sql: { allowed: false, reason: 'dimanche' } }).reason, 'dimanche');
  assert.equal(decideDial({ sandboxMode: true, allowlist: ['+41791111111'], phone: '+41791111111', sql: { allowed: true, reason: 'ok' } }).dial, true);
});

test('ouverture IA, répondeur, variantes A/B', () => {
  assert.equal(openingIsValid(DEFAULT_OUTBOUND_OPENING), true);
  assert.equal(openingIsValid(DEFAULT_INBOUND_OPENING), true);
  assert.equal(openingIsValid("Je vous appelle pour une offre. Je suis l'assistante IA de Bissabi."), false);
  assert.equal(openingIsValid('Bonjour, je suis une assistante virtuelle.'), false);
  const picked = pickVariant([{ id: 'A', weight: 0 }, { id: 'B', weight: 100 }], 0.2);
  assert.equal(picked?.id, 'B');
  assert.equal(shouldLeaveVoicemail({ answeredBy: 'machine', alreadyLeft: false, enabled: true }), true);
  assert.equal(shouldLeaveVoicemail({ answeredBy: 'machine', alreadyLeft: true, enabled: true }), false);
  assert.equal(shouldLeaveVoicemail({ answeredBy: 'human', alreadyLeft: false, enabled: true }), false);
});

test('la migration SQL contient les mêmes motifs de refus', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/20261113193000_telephonie_ia.sql'), 'utf8');
  for (const reason of ['sandbox_numero_non_autorise', 'liste_ne_pas_appeler', 'annuaire_', 'verification_annuaire_perimee', 'dimanche', 'jour_ferie', 'samedi', 'hors_plage_horaire', 'numero_appelant_non_inscrit', 'non_b2b']) {
    assert.ok(sql.includes(reason), reason);
  }
  assert.match(readFileSync(join(root, 'telephonie-ia/prompts/outbound.md'), 'utf8'), /assistante IA de Bissabi/);
  assert.match(readFileSync(join(root, 'telephonie-ia/prompts/inbound.md'), 'utf8'), /assistante IA de Bissabi/);
});

test('normalisation des numéros suisses', () => {
  assert.equal(toE164('021 123 45 67'), '+41211234567');
  assert.equal(toE164('+41 79 000 00 00'), '+41790000000');
  assert.equal(toE164('0041790000000'), '+41790000000');
  assert.equal(toE164('pas un numéro'), null);
});

test('signatures Telnyx et Twilio', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const body = '{"data":{"event_type":"call.answered"}}';
  const timestamp = '1700000000';
  const signature = signTelnyx(body, timestamp, privateKey);
  const key = raw.toString('base64');
  assert.equal(verifyTelnyxSignature({ rawBody: body, timestamp, signature, publicKeyBase64: key, nowMs: 1_700_000_000_000 }), true);
  assert.equal(verifyTelnyxSignature({ rawBody: body + ' ', timestamp, signature, publicKeyBase64: key, nowMs: 1_700_000_000_000 }), false);
  assert.equal(verifyTelnyxSignature({ rawBody: body, timestamp, signature, publicKeyBase64: key, nowMs: 1_700_000_000_000 + 600_000 }), false);
  const token = 'test-token';
  const url = 'https://gateway.example/webhooks/twilio';
  const params = { CallSid: 'CA1', From: '+41790000000' };
  const tw = twilioSignature(token, url, params);
  assert.equal(verifyTwilioSignature({ authToken: token, url, params, signature: tw }), true);
  assert.equal(verifyTwilioSignature({ authToken: token, url, params, signature: 'nope' }), false);
});

test('protocole voix : µ-law, barge-in, outils parallèles, pipeline UE', () => {
  const session = grokSessionUpdate({ voice: 'ara', instructions: 'Tu es l’assistante.', tools: [], speakingRate: 1 });
  assert.equal(session.session.audio.input.format.type, 'audio/pcmu');
  assert.equal(session.session.voice, 'ara');
  assert.equal(isBargeIn({ type: 'input_audio_buffer.speech_started' }), true);
  assert.equal(telnyxClearFrame().event, 'clear');
  assert.equal(grokForceMessage("Bonjour, je suis l'assistante IA de Bissabi.").item.interruptible, false);
  const batch = new ToolBatch();
  batch.pushCall();
  batch.pushCall();
  assert.equal(batch.pushOutput('a', { ok: true }), null);
  const flushed = batch.pushOutput('b', { ok: true });
  assert.equal(flushed?.at(-1) && (flushed.at(-1) as { type: string }).type, 'response.create');
  assert.equal(flushed?.length, 3);
  assert.equal(euPipelineContract({}).ready, false);
  assert.equal(euPipelineContract({ sttUrl: 'https://stt', llmUrl: 'https://llm', ttsUrl: 'https://tts' }).ready, true);
  assert.rejects(() => new EuPipelineAdapter({}).open(), /non branché/);
});

test('étape pipeline : vocabulaire app ou fiches historiques', () => {
  assert.equal(nextStage('prospect', 'rdv_pris'), 'rdv_echantillon');
  assert.equal(nextStage('CLIENT', 'rdv_pris'), 'DEGUSTATION');
  assert.equal(nextStage('CLIENT', 'interesse'), 'CONTACTE');
  assert.equal(nextStage(null, 'commande'), 'premiere_commande');
  assert.equal(nextStage('prospect', 'refus'), null);
});

function ctx(repo: MemoryRepo, over: Partial<ToolContext> = {}): ToolContext {
  return {
    ownerId: 'owner',
    callId: 'call_1',
    now: new Date('2026-11-16T09:00:00Z'),
    phone: '+41211234567',
    clientId: 'cli_1',
    contactId: 'ctc_1',
    repo,
    calendar: nullCalendar,
    transferPhone: '+41790000000',
    transferAllowed: async () => checkTransferWindow({
      at: new Date('2026-11-16T09:00:00Z'),
      settings,
      windows: defaultWindows(),
      holidays: VAUD_HOLIDAYS,
      clientType: 'Épicerie fine',
      canton: 'VD',
    }),
    slotAllowed: () => ({ allowed: true, reason: 'ok' }),
    ...over,
  };
}

test('création de lead, dédoublonnage, champs interdits', async () => {
  const repo = new MemoryRepo();
  const created = await executeTool('create_lead', {
    company_name: 'Café du Jura', phone_e164: '021 555 01 01', city: 'Lausanne', sector: 'cafe', contact_name: 'Léa',
  }, ctx(repo, { clientId: null }));
  assert.equal(created.created, true);
  assert.equal(repo.clients[0].source, 'telephonie_ia');
  assert.equal(repo.clients[0].relationship, 'prospect');
  assert.equal(repo.clients[0].phoneE164, '+41215550101');
  const again = await executeTool('create_lead', { company_name: 'Autre', phone_e164: '+41215550101', city: 'Renens' }, ctx(repo));
  assert.equal(again.created, false);
  assert.equal(again.reason, 'doublon_telephone');
  const samePlace = await executeTool('create_lead', { company_name: 'Cafe du Jura', phone_e164: '+41791112233', city: 'lausanne' }, ctx(repo));
  assert.equal(samePlace.reason, 'doublon_nom_ville');
  const forbidden = await executeTool('update_contact', { client_id: repo.clients[0].id, iban: 'CH00', notes: 'secret' }, ctx(repo));
  assert.equal(forbidden.error, 'champ_interdit');
  assert.deepEqual(repo.clients[0].email, null);
});

test('qualification, rendez-vous, transfert et DNC', async () => {
  const repo = new MemoryRepo();
  repo.clients.push({
    id: 'cli_1', ownerId: 'owner', name: 'Café du Jura', city: 'Lausanne', canton: 'VD', type: 'CAFE',
    phoneE164: '+41215550101', email: null, stage: 'prospect', relationship: 'prospect', isB2b: true,
    doNotCall: false, qualification: {}, preferredLanguage: 'fr', bestCallHours: null, businessUnit: 'drinks',
    source: 'telephonie_ia', lastCallAt: null, lastCallOutcome: null,
  });
  repo.contacts.push({
    id: 'ctc_1', ownerId: 'owner', clientId: 'cli_1', name: 'Léa', role: null, email: null,
    phoneE164: '+41215550101', language: 'fr', isDecisionMaker: null, doNotCall: false,
  });
  repo.calls.set('call_1', { transferredAt: null, summary: null });
  repo.attempts.push({ phone: '+41215550101', status: 'en_attente' });

  const updated = await executeTool('update_contact', {
    role: 'Gérante', is_decision_maker: true, qualification: { besoin: 'carte été', volume: '2 caisses / semaine', decideur: 'Léa' },
  }, ctx(repo, { phone: '+41215550101' }));
  assert.equal(updated.ok, true);
  assert.equal(repo.contacts[0].role, 'Gérante');
  assert.equal(repo.contacts[0].isDecisionMaker, true);
  assert.equal(repo.clients[0].qualification.volume, '2 caisses / semaine');

  const noYes = await executeTool('book_meeting', {
    title: 'Dégustation', starts_at: '2026-11-17T14:00:00.000Z', ends_at: '2026-11-17T14:30:00.000Z', confirmed_orally: false,
  }, ctx(repo));
  assert.equal(noYes.error, 'confirmation_orale_requise');
  const closed = await executeTool('book_meeting', {
    title: 'Dégustation', starts_at: '2026-11-17T14:00:00.000Z', ends_at: '2026-11-17T14:30:00.000Z', confirmed_orally: true,
  }, ctx(repo, { slotAllowed: () => ({ allowed: false, reason: 'hors_plage_horaire' }) }));
  assert.equal(closed.error, 'hors_plage_horaire');
  const booked = await executeTool('book_meeting', {
    title: 'Dégustation', starts_at: '2026-11-17T14:00:00.000Z', ends_at: '2026-11-17T14:30:00.000Z', confirmed_orally: true, kind: 'degustation',
  }, ctx(repo));
  assert.equal(booked.ok, true);
  assert.equal(booked.calendar, 'aucun');
  assert.equal(repo.appointments.length, 1);

  const callback = await executeTool('transfer_call', { reason: 'veut un humain', whisper: 'Café du Jura, dégustation' }, ctx(repo, {
    transferAllowed: async () => ({ allowed: false, reason: 'hors_plage_horaire' }),
  }));
  assert.equal(callback.transferred, false);
  assert.equal(callback.callback, true);
  assert.equal(repo.tasks[0].priority, 2);
  assert.equal(repo.tasks[0].title.includes('Rappel'), true);

  const hot = await executeTool('transfer_call', { reason: 'décideur', whisper: 'Café du Jura, Lausanne, 2 caisses', urgency: 'haute' }, ctx(repo));
  assert.equal(hot.transferred, true);
  assert.equal(hot.to, '+41790000000');
  repo.calls.set('call_1', { transferredAt: '2026-11-16T09:05:00Z', summary: null });
  const second = await executeTool('transfer_call', { reason: 'encore', whisper: 'non' }, ctx(repo));
  assert.equal(second.error, 'deja_transfere');

  const dnc = await executeTool('add_to_dnc', { reason: 'pas intéressé' }, ctx(repo, { phone: '+41215550101' }));
  assert.equal(dnc.ok, true);
  assert.equal(repo.clients[0].doNotCall, true);
  assert.equal(repo.contacts[0].doNotCall, true);
  assert.equal(repo.attempts[0].status, 'exclu');
  assert.equal(repo.dnc.length, 1);
});

test('résumé, base de connaissances, prix non inventé', async () => {
  const repo = new MemoryRepo();
  repo.clients.push({
    id: 'cli_1', ownerId: 'owner', name: 'Cave', city: 'Prilly', canton: 'VD', type: 'Épicerie fine',
    phoneE164: '+41215550101', email: null, stage: 'prospect', relationship: 'prospect', isB2b: true,
    doNotCall: false, qualification: {}, preferredLanguage: 'fr', bestCallHours: null, businessUnit: 'drinks',
    source: null, lastCallAt: null, lastCallOutcome: null,
  });
  repo.calls.set('call_1', { transferredAt: null, summary: null });
  repo.kb.push({ title: 'Hibiscus 25 cl', body: 'CHF 3.50 la bouteille, hors TVA.', category: 'tarifs', language: 'fr' });
  const price = await executeTool('lookup_knowledge_base', { query: 'hibiscus bouteille' }, ctx(repo));
  assert.equal(price.found, true);
  assert.match(String((price.articles as { body: string }[])[0].body), /3\.50/);
  const missing = await executeTool('lookup_knowledge_base', { query: 'prix menu traiteur' }, ctx(repo));
  assert.equal(missing.found, false);
  assert.match(String(missing.instruction), /inventer/);

  const summary = await executeTool('log_call_summary', {
    outcome: 'interesse', sentiment: 'positif', summary: 'Veut goûter en décembre.', lead_score: 60,
    qualification: { besoin: 'carte' },
  }, ctx(repo));
  assert.equal(summary.ok, true);
  assert.equal(repo.clients[0].stage, 'contacte');
  assert.equal(repo.clients[0].lastCallOutcome, 'interesse');
  assert.equal(repo.activities[0].content, 'Veut goûter en décembre.');

  repo.calls.set('call_2', { transferredAt: null, summary: null });
  await executeTool('log_call_summary', {
    outcome: 'refus', sentiment: 'negatif', summary: 'Pas intéressé, ne plus appeler.',
  }, ctx(repo, { callId: 'call_2', phone: '+41215550101' }));
  assert.equal(repo.clients[0].doNotCall, true);
  assert.equal(zurichLocal('2026-11-16', '10:00').toISOString(), '2026-11-16T09:00:00.000Z');
});

test('transfert hors fenêtre un dimanche', () => {
  const r = checkTransferWindow({
    at: new Date('2026-11-15T09:00:00Z'),
    settings,
    windows: defaultWindows(),
    holidays: VAUD_HOLIDAYS,
    clientType: 'CAFE',
    canton: 'VD',
  });
  assert.equal(r.reason, 'dimanche');
});
