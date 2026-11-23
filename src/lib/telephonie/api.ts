import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '../uid';
import { openingIsValid } from './phone';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadToday(client: SupabaseClient, ownerId: string) {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date());
  const { data, error } = await client.from('tel_dashboard_daily').select('*').eq('owner_id', ownerId).eq('jour', jour).maybeSingle();
  fail(error);
  return data as {
    appels: number; taux_decroche_pct: number | null; taux_conversion_pct: number | null; rdv_pris: number;
    duree_moyenne_s: number | null; cout_par_appel_chf: number | null; cout_total_chf: number | null;
  } | null;
}

export async function loadCalls(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.from('tel_calls')
    .select('id, direction, from_e164, to_e164, status, outcome, sentiment, summary, created_at, duration_seconds, is_sandbox')
    .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(80);
  fail(error);
  return data ?? [];
}

export async function loadCall(client: SupabaseClient, id: string) {
  const call = await client.from('tel_calls').select('*').eq('id', id).maybeSingle();
  fail(call.error);
  const segments = await client.from('tel_transcript_segments').select('seq, speaker, text, interrupted').eq('call_id', id).order('seq');
  fail(segments.error);
  return { call: call.data, segments: segments.data ?? [] };
}

export async function loadSettings(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.from('tel_settings').select('sandbox_mode, recording_enabled, timezone').eq('owner_id', ownerId).maybeSingle();
  fail(error);
  return data;
}

export async function ensureSettings(client: SupabaseClient, ownerId: string) {
  const { error } = await client.from('tel_settings').upsert({ owner_id: ownerId }, { onConflict: 'owner_id' });
  fail(error);
  const seeded = await client.rpc('tel_seed_default_windows', { p_owner: ownerId });
  if (seeded.error) throw new Error(seeded.error.message);
}

export async function loadScripts(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.from('tel_scripts').select('id, name, kind, business_unit, persona_id, updated_at').eq('owner_id', ownerId).order('updated_at', { ascending: false });
  fail(error);
  return data ?? [];
}

export async function loadPersonas(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.from('tel_personas').select('id, name, voice_provider, voice_id, speaking_rate, default_language').eq('owner_id', ownerId).order('name');
  fail(error);
  return data ?? [];
}

export async function savePersona(client: SupabaseClient, ownerId: string, row: { id?: string; name: string; voice_provider: string; voice_id: string }) {
  const payload = { owner_id: ownerId, name: row.name, voice_provider: row.voice_provider, voice_id: row.voice_id, default_language: 'fr', languages: ['fr', 'en', 'ar', 'de'] };
  const q = row.id
    ? client.from('tel_personas').update(payload).eq('id', row.id)
    : client.from('tel_personas').insert(payload);
  fail((await q).error);
}

export async function saveScriptDraft(client: SupabaseClient, ownerId: string, input: {
  scriptId?: string; name: string; kind: 'outbound' | 'inbound' | 'voicemail'; personaId: string | null;
  systemPrompt: string; opening: string; voicemail: string;
}) {
  if (!openingIsValid(input.opening)) throw new Error('La première phrase doit contenir « assistante IA de Bissabi ».');
  let scriptId = input.scriptId;
  if (!scriptId) {
    const created = await client.from('tel_scripts').insert({ owner_id: ownerId, name: input.name, kind: input.kind, persona_id: input.personaId }).select('id').single();
    fail(created.error);
    if (!created.data) throw new Error('script non créé');
    scriptId = created.data.id as string;
  } else {
    fail((await client.from('tel_scripts').update({ name: input.name, persona_id: input.personaId }).eq('id', scriptId)).error);
  }
  const versions = await client.from('tel_script_versions').select('version, status').eq('script_id', scriptId).order('version', { ascending: false }).limit(1);
  fail(versions.error);
  const latest = versions.data?.[0] as { version: number; status: string } | undefined;
  if (!latest || latest.status !== 'brouillon') {
    const version = (latest?.version ?? 0) + 1;
    fail((await client.from('tel_script_versions').insert({
      script_id: scriptId, owner_id: ownerId, version, status: 'brouillon', system_prompt: input.systemPrompt,
      opening_line: input.opening, voicemail_message: input.voicemail,
    })).error);
  } else {
    fail((await client.from('tel_script_versions').update({
      system_prompt: input.systemPrompt, opening_line: input.opening, voicemail_message: input.voicemail,
    }).eq('script_id', scriptId).eq('version', latest.version)).error);
  }
  return scriptId;
}

export async function publishScript(client: SupabaseClient, scriptId: string) {
  const versions = await client.from('tel_script_versions').select('id, version, status').eq('script_id', scriptId).order('version', { ascending: false }).limit(1);
  fail(versions.error);
  const latest = versions.data?.[0] as { id: string; status: string } | undefined;
  if (!latest) throw new Error('Aucune version.');
  if (latest.status !== 'publiee') {
    fail((await client.from('tel_script_versions').update({ status: 'publiee', published_at: new Date().toISOString() }).eq('id', latest.id)).error);
  }
  fail((await client.from('tel_scripts').update({ current_version_id: latest.id }).eq('id', scriptId)).error);
}

export async function loadScriptBundle(client: SupabaseClient, scriptId: string) {
  const script = await client.from('tel_scripts').select('*').eq('id', scriptId).maybeSingle();
  fail(script.error);
  const versions = await client.from('tel_script_versions').select('id, version, status, system_prompt, opening_line, voicemail_message, published_at').eq('script_id', scriptId).order('version', { ascending: false });
  fail(versions.error);
  return { script: script.data, versions: versions.data ?? [] };
}

export async function loadCampaigns(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.from('tel_campaigns').select('id, name, status, goal, business_unit, segment_filter, max_attempts').eq('owner_id', ownerId).order('created_at', { ascending: false });
  fail(error);
  return data ?? [];
}

export async function createCampaign(client: SupabaseClient, ownerId: string, input: { name: string; goal: string; secteur: string; ville: string; statut: string }) {
  const { data, error } = await client.from('tel_campaigns').insert({
    owner_id: ownerId,
    name: input.name,
    goal: input.goal || null,
    segment_filter: { secteur: input.secteur || null, ville: input.ville || null, statut: input.statut || null },
  }).select('id').single();
  fail(error);
  if (!data) throw new Error('campagne non créée');
  return data.id as string;
}

export async function setCampaignStatus(client: SupabaseClient, id: string, status: 'active' | 'en_pause') {
  fail((await client.from('tel_campaigns').update({ status }).eq('id', id)).error);
}

export async function importCampaignRows(client: SupabaseClient, ownerId: string, campaignId: string, rows: { nom: string; phone: string; secteur: string; ville: string; statut: string; canton: string }[]) {
  let inserted = 0;
  const excluded: { nom: string; reason: string }[] = [];
  for (const row of rows) {
    const existing = await client.from('clients').select('id').eq('owner_id', ownerId).eq('phone_e164', row.phone).maybeSingle();
    fail(existing.error);
    let clientId = existing.data?.id as string | undefined;
    if (!clientId) {
      clientId = uid('tel_');
      fail((await client.from('clients').insert({
        id: clientId, owner_id: ownerId, name: row.nom, phone: row.phone, phone_e164: row.phone,
        type: row.secteur, city: row.ville, canton: row.canton || null, stage: row.statut, source: 'telephonie_ia',
        is_b2b: true, relationship: 'prospect',
      })).error);
    }
    const check = await client.rpc('tel_check_outbound', { p_owner: ownerId, p_client_id: clientId, p_phone: row.phone, p_campaign_id: campaignId });
    const verdict = Array.isArray(check.data) ? check.data[0] as { allowed: boolean; reason: string } : null;
    const allowed = verdict?.allowed === true;
    const up = await client.from('tel_campaign_contacts').upsert({
      campaign_id: campaignId, owner_id: ownerId, client_id: clientId, phone_e164: row.phone,
      status: allowed ? 'en_attente' : 'exclu',
      exclusion_reason: allowed ? null : (verdict?.reason ?? check.error?.message ?? 'verification_impossible'),
    }, { onConflict: 'campaign_id,client_id,phone_e164' });
    fail(up.error);
    if (!allowed) excluded.push({ nom: row.nom, reason: verdict?.reason ?? 'verification_impossible' });
    else inserted += 1;
  }
  return { inserted, excluded };
}

export async function loadDnc(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.from('tel_dnc_list').select('id, phone_e164, source, reason, created_at').eq('owner_id', ownerId).order('created_at', { ascending: false });
  fail(error);
  return data ?? [];
}

export async function addDnc(client: SupabaseClient, ownerId: string, phone: string, reason: string) {
  fail((await client.from('tel_dnc_list').upsert({ owner_id: ownerId, phone_e164: phone, source: 'manuel', reason })).error);
  fail((await client.from('clients').update({ do_not_call: true }).eq('owner_id', ownerId).eq('phone_e164', phone)).error);
}

export async function removeDnc(client: SupabaseClient, id: string) {
  fail((await client.from('tel_dnc_list').delete().eq('id', id)).error);
}

export async function loadArticles(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.from('kb_articles').select('id, title, category, language, status, body, updated_at').eq('owner_id', ownerId).order('updated_at', { ascending: false });
  fail(error);
  return data ?? [];
}

export async function saveArticle(client: SupabaseClient, ownerId: string, row: { id?: string; title: string; body: string; category: string; language: string; status: string }) {
  const payload = { owner_id: ownerId, title: row.title, body: row.body, category: row.category, language: row.language, status: row.status };
  const q = row.id ? client.from('kb_articles').update(payload).eq('id', row.id) : client.from('kb_articles').insert(payload);
  fail((await q).error);
}

export async function loadPublishedVersions(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.from('tel_script_versions').select('id, version, script_id').eq('owner_id', ownerId).eq('status', 'publiee');
  fail(error);
  return data ?? [];
}

export async function saveVariant(client: SupabaseClient, ownerId: string, campaignId: string, label: string, scriptVersionId: string, weight: number) {
  fail((await client.from('tel_campaign_variants').upsert({
    campaign_id: campaignId, owner_id: ownerId, label, script_version_id: scriptVersionId, weight,
  }, { onConflict: 'campaign_id,label' })).error);
}
