import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type WebSocket from 'ws';
import { mayStoreAudio } from './audio';
import type { GatewayConfig } from '../config';
import { maskPhone, toE164 } from '../compliance/phone';
import { DEFAULT_INBOUND_OPENING, DEFAULT_OUTBOUND_OPENING, DEFAULT_VOICEMAIL } from '../compliance/opening';
import { shouldLeaveVoicemail } from '../compliance/gate';
import { log } from '../log';
import type { TelephonyProvider } from '../telephony/types';
import type { NormalizedEvent } from '../telephony/types';
import { executeTool, ensureSummary, type ToolContext } from '../tools/handlers';
import type { TelephonyRepo } from '../tools/repo';
import { telnyxClearFrame, telnyxMediaFrame } from '../voice/protocol';
import { ToolBatch } from '../voice/protocol';
import type { VoiceAdapter, VoiceSession } from '../voice/types';
import { loadToolDefinitions } from '../voice/grok';
import type { CalendarAdapter } from '../calendar/types';

type LiveCall = {
  providerCallId: string;
  callRowId: string;
  ownerId: string;
  clientId: string | null;
  contactId: string | null;
  phone: string;
  direction: 'inbound' | 'outbound';
  clientType: string | null;
  canton: string | null;
  campaignContactId: string | null;
  voice: VoiceSession | null;
  socket: WebSocket | null;
  transcript: string[];
  batch: ToolBatch;
  voicemailLeft: boolean;
  machine: boolean;
};

export class CallRuntime {
  private readonly calls = new Map<string, LiveCall>();

  constructor(
    private readonly config: GatewayConfig,
    private readonly db: SupabaseClient | null,
    private readonly repo: TelephonyRepo | null,
    private readonly telephony: TelephonyProvider,
    private readonly voice: VoiceAdapter,
    private readonly calendar: CalendarAdapter,
  ) {}

  async onEvent(event: NormalizedEvent): Promise<void> {
    try {
      if (event.type === 'initiated' && event.direction === 'inbound') await this.onInbound(event);
      else if (event.type === 'answered') await this.onAnswered(event);
      else if (event.type === 'machine') await this.onMachine(event);
      else if (event.type === 'greeting_ended') await this.onGreetingEnded(event);
      else if (event.type === 'speak_ended') await this.onSpeakEnded(event);
      else if (event.type === 'hangup') await this.onHangup(event);
    } catch (error) {
      log('error', 'événement appel', { error: error instanceof Error ? error.message : 'inconnu', type: event.rawType, call: event.callId });
    }
  }

  attachSocket(callId: string, socket: WebSocket): void {
    const live = this.calls.get(callId);
    if (live) live.socket = socket;
    else this.calls.set(callId, this.blank(callId, 'outbound'));
    const current = this.calls.get(callId);
    if (current) current.socket = socket;
  }

  async onCallerAudio(callId: string, payload: string): Promise<void> {
    const live = this.calls.get(callId);
    if (!live?.voice) return;
    if (mayStoreAudio({ recordingEnabled: this.config.recordingEnabled, consent: null })) {
      log('warn', 'stockage audio ignoré : consentement absent');
    }
    live.voice.sendAudioPcmU(payload);
  }

  private async onInbound(event: NormalizedEvent): Promise<void> {
    const from = toE164(event.from) ?? event.from;
    if (this.config.sandboxMode && !this.config.sandboxAllowlist.includes(from)) {
      await this.telephony.hangup(event.callId);
      log('info', 'entrant refusé hors bac à sable', { phone: maskPhone(from) });
      return;
    }
    if (!this.db || !this.config.ownerId) return;
    const client = await this.repo?.findClientByPhone(this.config.ownerId, from);
    const contact = client ? null : await this.repo?.findContactByPhone(this.config.ownerId, from);
    const { data, error } = await this.db.from('tel_calls').insert({
      owner_id: this.config.ownerId,
      direction: 'inbound',
      provider: this.telephony.id,
      provider_call_id: event.callId,
      from_e164: from,
      to_e164: toE164(event.to) ?? event.to,
      client_id: client?.id ?? contact?.clientId ?? null,
      contact_id: contact?.id ?? null,
      status: 'ringing',
      is_sandbox: this.config.sandboxMode,
    }).select('id').single();
    if (error) throw new Error(error.message);
    const live = this.blank(event.callId, 'inbound');
    live.providerCallId = event.callId;
    live.callRowId = String(data.id);
    live.ownerId = this.config.ownerId;
    live.clientId = client?.id ?? contact?.clientId ?? null;
    live.contactId = contact?.id ?? null;
    live.phone = from;
    live.clientType = client?.type ?? null;
    live.canton = client?.canton ?? null;
    this.calls.set(event.callId, live);
    await this.telephony.answer(event.callId);
  }

  private async onAnswered(event: NormalizedEvent): Promise<void> {
    const live = this.calls.get(event.callId) ?? await this.hydrate(event);
    if (!live || live.machine) return;
    if (event.clientState?.kind === 'transfer') {
      const whisper = String(event.clientState.whisper ?? '');
      if (whisper) await this.telephony.speak(event.callId, whisper);
      return;
    }
    await this.db?.from('tel_calls').update({ status: 'in_progress', answered_at: new Date().toISOString(), answered_by: 'human', ai_disclosed_at: new Date().toISOString() }).eq('id', live.callRowId);
    const streamUrl = `${this.config.publicUrl.replace(/^http/, 'ws')}/media`;
    await this.telephony.startStream(event.callId, streamUrl);
    await this.openVoice(live);
  }

  private async onMachine(event: NormalizedEvent): Promise<void> {
    const live = this.calls.get(event.callId) ?? await this.hydrate(event);
    if (!live) return;
    live.machine = event.answeredBy !== 'human';
    if (live.machine) {
      live.voice?.close();
      live.voice = null;
      await this.db?.from('tel_calls').update({ answered_by: event.answeredBy ?? 'machine', status: 'voicemail' }).eq('id', live.callRowId);
    }
  }

  private async onGreetingEnded(event: NormalizedEvent): Promise<void> {
    const live = this.calls.get(event.callId);
    if (!live) return;
    const enabled = shouldLeaveVoicemail({ answeredBy: 'machine', alreadyLeft: live.voicemailLeft, enabled: true });
    if (!enabled) return;
    live.voicemailLeft = true;
    await this.telephony.speak(event.callId, DEFAULT_VOICEMAIL);
    await this.db?.from('tel_calls').update({ outcome: 'message_laisse' }).eq('id', live.callRowId);
  }

  private async onSpeakEnded(event: NormalizedEvent): Promise<void> {
    const peer = event.clientState?.peerCallId;
    if (event.clientState?.kind === 'transfer' && typeof peer === 'string') {
      await this.telephony.bridge(event.callId, peer);
    }
  }

  private async onHangup(event: NormalizedEvent): Promise<void> {
    const live = this.calls.get(event.callId);
    live?.voice?.close();
    if (live && this.repo) {
      await ensureSummary(this.toolContext(live), live.transcript.join('\n'));
      await this.db?.from('tel_calls').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', live.callRowId);
      await this.db?.from('tel_post_jobs').insert({ owner_id: live.ownerId, call_id: live.callRowId, kind: 'post_call' });
      if (live.campaignContactId) {
        await this.db?.from('tel_campaign_contacts').update({ status: 'a_rappeler', locked_at: null, next_attempt_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }).eq('id', live.campaignContactId);
      }
    }
    this.calls.delete(event.callId);
    log('info', 'appel terminé', { call: event.callId });
  }

  private async openVoice(live: LiveCall): Promise<void> {
    const kind = live.direction === 'inbound' ? 'inbound' : 'outbound';
    const instructions = this.readFile(`${kind}.md`)
      .replaceAll('{{owner_display_name}}', this.config.ownerDisplayName);
    const opening = kind === 'inbound' ? DEFAULT_INBOUND_OPENING : DEFAULT_OUTBOUND_OPENING;
    const tools = loadToolDefinitions(this.readTools());
    const session = await this.voice.open({
      voiceId: 'ara',
      provider: this.voice.id,
      instructions,
      openingLine: opening,
      speakingRate: 1,
      tools,
    });
    live.voice = session;
    session.onAudio((payload) => {
      if (live.socket?.readyState === 1) live.socket.send(JSON.stringify(telnyxMediaFrame(payload)));
    });
    session.onSpeechStarted(() => {
      if (live.socket?.readyState === 1) live.socket.send(JSON.stringify(telnyxClearFrame()));
    });
    session.onTranscript((chunk) => {
      if (!chunk.partial) live.transcript.push(`${chunk.speaker}: ${chunk.text}`);
      if (live.callRowId && this.db) {
        void this.db.from('tel_transcript_segments').insert({
          call_id: live.callRowId, owner_id: live.ownerId, seq: live.transcript.length, speaker: chunk.speaker === 'assistant' ? 'assistant' : 'interlocuteur', text: chunk.text,
        });
      }
    });
    session.onFunctionCall((call) => {
      live.batch.pushCall();
      void this.runTool(live, call.name, call.arguments, call.callId);
    });
  }

  private async runTool(live: LiveCall, name: string, rawArgs: string, callId: string): Promise<void> {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(rawArgs) as Record<string, unknown>; } catch { args = {}; }
    const result = await executeTool(name, args, this.toolContext(live));
    if (name === 'transfer_call' && result.transferred === true && typeof result.to === 'string') {
      await this.telephony.dial({
        to: result.to,
        from: this.config.telnyxFromNumber ?? this.config.twilioFromNumber ?? '',
        webhookUrl: `${this.config.publicUrl}/webhooks/${this.telephony.id}`,
        machineDetection: false,
        clientState: { kind: 'transfer', peerCallId: live.providerCallId, whisper: result.whisper },
      }).catch((error) => log('error', 'transfert', { error: error instanceof Error ? error.message : 'inconnu' }));
    }
    const messages = live.batch.pushOutput(callId, result);
    if (messages && live.voice) for (const message of messages) live.voice.sendRaw(message);
    await this.db?.from('tel_call_events').insert({
      call_id: live.callRowId, owner_id: live.ownerId, source: 'voice_ai', type: `tool.${name}`, payload: { ok: result.ok ?? null },
    });
  }

  private toolContext(live: LiveCall): ToolContext {
    if (!this.repo) throw new Error('base non configurée');
    return {
      ownerId: live.ownerId,
      callId: live.callRowId,
      now: new Date(),
      phone: live.phone,
      clientId: live.clientId,
      contactId: live.contactId,
      repo: this.repo,
      calendar: this.calendar,
      transferPhone: this.config.transferPhone,
      transferAllowed: async () => ({ allowed: this.withinTransferHours(), reason: this.withinTransferHours() ? 'ok' : 'hors_plage_horaire' }),
      slotAllowed: () => ({ allowed: this.withinTransferHours(), reason: this.withinTransferHours() ? 'ok' : 'hors_plage_horaire' }),
    };
  }

  private withinTransferHours(): boolean {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Zurich', weekday: 'short' }).format(new Date());
    if (day === 'Sat' || day === 'Sun') return false;
    return (hour >= 9 && hour < 11) || (hour >= 14 && hour < 17);
  }

  private async hydrate(event: NormalizedEvent): Promise<LiveCall | null> {
    if (!this.db) return null;
    const { data } = await this.db.from('tel_calls').select('id, owner_id, client_id, contact_id, to_e164, from_e164, direction, campaign_contact_id').eq('provider_call_id', event.callId).maybeSingle();
    if (!data) return null;
    const live = this.blank(event.callId, data.direction === 'inbound' ? 'inbound' : 'outbound');
    live.providerCallId = event.callId;
    live.callRowId = data.id;
    live.ownerId = data.owner_id;
    live.clientId = data.client_id;
    live.contactId = data.contact_id;
    live.phone = data.direction === 'inbound' ? data.from_e164 : data.to_e164;
    live.campaignContactId = data.campaign_contact_id;
    this.calls.set(event.callId, live);
    return live;
  }

  private blank(callId: string, direction: 'inbound' | 'outbound'): LiveCall {
    return {
      providerCallId: callId, callRowId: '', ownerId: this.config.ownerId ?? '', clientId: null, contactId: null, phone: '', direction,
      clientType: null, canton: null, campaignContactId: null, voice: null, socket: null, transcript: [],
      batch: new ToolBatch(), voicemailLeft: false, machine: false,
    };
  }

  private readTools(): { tools?: { type: 'function'; name: string; description: string; parameters: Record<string, unknown> }[] } {
    try {
      return JSON.parse(this.readFile('tools.json')) as { tools?: { type: 'function'; name: string; description: string; parameters: Record<string, unknown> }[] };
    } catch {
      return { tools: [] };
    }
  }

  private readFile(name: string): string {
    const candidates = [
      this.config.promptsDir ? join(this.config.promptsDir, name) : '',
      join(process.cwd(), 'prompts', name),
      join(process.cwd(), 'telephonie-ia/prompts', name),
      join(process.cwd(), '../../telephonie-ia/prompts', name),
    ].filter(Boolean);
    for (const path of candidates) {
      try { return readFileSync(path, 'utf8'); } catch { /* suivant */ }
    }
    return name.startsWith('in') ? DEFAULT_INBOUND_OPENING : DEFAULT_OUTBOUND_OPENING;
  }
}
