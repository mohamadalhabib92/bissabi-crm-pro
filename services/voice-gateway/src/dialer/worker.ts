import type { SupabaseClient } from '@supabase/supabase-js';
import { decideDial } from '../compliance/gate';
import { maskPhone } from '../compliance/phone';
import { checkOutboundSql } from '../db';
import { log } from '../log';
import type { TelephonyProvider } from '../telephony/types';

export type ClaimedContact = {
  id: string;
  owner_id: string;
  client_id: string;
  phone_e164: string;
  campaign_id: string;
  attempts: number;
};

export async function processClaim(opts: {
  row: ClaimedContact;
  db: SupabaseClient;
  telephony: TelephonyProvider;
  sandboxMode: boolean;
  allowlist: string[];
  from: string | null;
  webhookUrl: string;
}): Promise<void> {
  const sql = await checkOutboundSql(opts.db, {
    ownerId: opts.row.owner_id,
    clientId: opts.row.client_id,
    phone: opts.row.phone_e164,
    campaignId: opts.row.campaign_id,
  });
  const decision = decideDial({
    sandboxMode: opts.sandboxMode,
    allowlist: opts.allowlist,
    phone: opts.row.phone_e164,
    sql,
  });
  if (!decision.dial) {
    const permanent = !['sandbox_numero_non_autorise', 'hors_plage_horaire', 'samedi', 'dimanche', 'jour_ferie', 'verification_impossible'].includes(decision.reason);
    await opts.db.from('tel_campaign_contacts').update({
      status: permanent ? 'exclu' : 'a_rappeler',
      exclusion_reason: decision.reason,
      locked_at: null,
      next_attempt_at: permanent ? null : new Date(Date.now() + 60 * 60_000).toISOString(),
    }).eq('id', opts.row.id);
    log('info', 'composition refusée', { contact: opts.row.id, reason: decision.reason, phone: maskPhone(opts.row.phone_e164) });
    return;
  }
  if (!opts.from) {
    await opts.db.from('tel_campaign_contacts').update({
      status: 'erreur', exclusion_reason: 'numero_appelant_absent', locked_at: null,
    }).eq('id', opts.row.id);
    return;
  }
  try {
    const dialed = await opts.telephony.dial({
      to: opts.row.phone_e164,
      from: opts.from,
      webhookUrl: opts.webhookUrl,
      machineDetection: true,
      clientState: { campaign_contact_id: opts.row.id, owner_id: opts.row.owner_id, client_id: opts.row.client_id, sandbox: opts.sandboxMode },
    });
    await opts.db.from('tel_calls').insert({
      owner_id: opts.row.owner_id,
      direction: 'outbound',
      provider: opts.telephony.id,
      provider_call_id: dialed.providerCallId,
      from_e164: opts.from,
      to_e164: opts.row.phone_e164,
      client_id: opts.row.client_id,
      campaign_id: opts.row.campaign_id,
      campaign_contact_id: opts.row.id,
      status: 'dialing',
      is_sandbox: opts.sandboxMode,
    });
    await opts.db.from('tel_campaign_contacts').update({
      attempts: opts.row.attempts + 1,
      last_attempt_at: new Date().toISOString(),
    }).eq('id', opts.row.id);
    log('info', 'composition lancée', { call: dialed.providerCallId, phone: maskPhone(opts.row.phone_e164) });
  } catch (error) {
    await opts.db.from('tel_campaign_contacts').update({
      status: 'erreur', exclusion_reason: 'erreur_fournisseur', locked_at: null,
    }).eq('id', opts.row.id);
    log('error', 'échec de composition', { error: error instanceof Error ? error.message : 'inconnu', contact: opts.row.id });
  }
}

export function startDialer(tick: () => Promise<void>, intervalMs: number): () => void {
  const timer = setInterval(() => {
    tick().catch((error) => log('error', 'tick dialer', { error: error instanceof Error ? error.message : 'inconnu' }));
  }, intervalMs);
  return () => clearInterval(timer);
}
