import Fastify, { type FastifyRequest } from 'fastify';
import { WebSocketServer, type RawData } from 'ws';
import { GoogleCalendarAdapter } from './calendar/google';
import { OutlookCalendarAdapter } from './calendar/outlook';
import { nullCalendar, type CalendarAdapter } from './calendar/types';
import { CallRuntime } from './calls/runtime';
import { loadConfig, type GatewayConfig } from './config';
import { checkOutboundSql, createServiceClient, SupabaseTelephonyRepo } from './db';
import { processClaim, startDialer, type ClaimedContact } from './dialer/worker';
import { log } from './log';
import { maskPhone } from './compliance/phone';
import { TelnyxProvider } from './telephony/telnyx';
import { TwilioProvider, twimlStream } from './telephony/twilio';
import type { TelephonyProvider } from './telephony/types';
import { EuPipelineAdapter } from './voice/types';
import { GrokVoiceAdapter } from './voice/grok';

type WithRaw = FastifyRequest & { rawBody?: Buffer };

export function buildServer(config: GatewayConfig = loadConfig()) {
  const app = Fastify({ logger: false });
  const db = config.supabaseUrl && config.supabaseServiceKey
    ? createServiceClient(config.supabaseUrl, config.supabaseServiceKey)
    : null;
  const repo = db ? new SupabaseTelephonyRepo(db) : null;
  const telephony: TelephonyProvider = config.telephonyProvider === 'twilio'
    ? new TwilioProvider({ accountSid: config.twilioAccountSid, authToken: config.twilioAuthToken })
    : new TelnyxProvider({ apiKey: config.telnyxApiKey, publicKey: config.telnyxPublicKey, connectionId: config.telnyxConnectionId });
  const voice = config.voiceProvider === 'eu_pipeline'
    ? new EuPipelineAdapter({ sttUrl: config.euSttUrl ?? undefined, llmUrl: config.euLlmUrl ?? undefined, ttsUrl: config.euTtsUrl ?? undefined })
    : new GrokVoiceAdapter(config.xaiApiKey, config.xaiModel);
  const calendar: CalendarAdapter = config.googleClientId
    ? new GoogleCalendarAdapter({
      clientId: config.googleClientId, clientSecret: config.googleClientSecret,
      refreshToken: config.googleRefreshToken, calendarId: config.googleCalendarId,
    })
    : config.outlookAccessToken
      ? new OutlookCalendarAdapter(config.outlookAccessToken)
      : nullCalendar;
  const runtime = new CallRuntime(config, db, repo, telephony, voice, calendar);

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    const raw = body as Buffer;
    (req as WithRaw).rawBody = raw;
    try { done(null, JSON.parse(raw.toString('utf8') || '{}')); }
    catch (error) { done(error as Error, undefined); }
  });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer' }, (req, body, done) => {
    (req as WithRaw).rawBody = body as Buffer;
    done(null, body);
  });

  app.get('/health', async () => ({
    ok: true,
    sandbox: config.sandboxMode,
    telephony: telephony.id,
    voice: voice.id,
    recording: false,
    database: Boolean(db),
  }));

  app.get('/twiml/stream', async (_req, reply) => {
    const stream = `${config.publicUrl.replace(/^http/, 'ws')}/media`;
    return reply.type('text/xml').send(twimlStream(stream));
  });

  app.post('/webhooks/telnyx', async (req, reply) => handleWebhook(req as WithRaw, reply, 'telnyx'));
  app.post('/webhooks/twilio', async (req, reply) => handleWebhook(req as WithRaw, reply, 'twilio'));

  async function handleWebhook(req: WithRaw, reply: { code: (n: number) => { send: (b: unknown) => unknown } }, provider: 'telnyx' | 'twilio') {
    const raw = req.rawBody ?? Buffer.from('');
    const url = `${config.publicUrl}${req.url}`;
    const headers = req.headers as Record<string, string | string[] | undefined>;
    if (!telephony.verifyWebhook(raw, headers, url)) {
      log('warn', 'signature webhook refusée', { provider });
      return reply.code(401).send({ error: 'signature' });
    }
    const body = provider === 'twilio'
      ? Object.fromEntries(new URLSearchParams(raw.toString('utf8')))
      : req.body;
    const event = telephony.parseEvent(body);
    if (!event) return reply.code(200).send({ ok: true, ignored: true });
    if (db) {
      const { error } = await db.from('tel_webhook_events').insert({ provider, event_id: event.eventId, payload: body });
      if (error && !/duplicate|23505/i.test(error.message)) {
        log('error', 'journal webhook', { error: error.message });
        return reply.code(500).send({ error: 'journal' });
      }
      if (error) return reply.code(200).send({ ok: true, duplicate: true });
    }
    await runtime.onEvent(event);
    if (db) await db.from('tel_webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider', provider).eq('event_id', event.eventId);
    return reply.code(200).send({ ok: true });
  }

  const wss = new WebSocketServer({ noServer: true });
  app.server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/media') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      let callId = url.searchParams.get('call') ?? '';
      ws.on('message', (data: RawData) => {
        let frame: { event?: string; media?: { payload?: string }; start?: { call_control_id?: string }; stream_id?: string };
        try { frame = JSON.parse(data.toString()) as typeof frame; } catch { return; }
        if (frame.event === 'start') {
          callId = frame.start?.call_control_id ?? callId;
          if (callId) runtime.attachSocket(callId, ws);
          log('info', 'flux média ouvert', { call: callId });
        } else if (frame.event === 'media' && frame.media?.payload && callId) {
          void runtime.onCallerAudio(callId, frame.media.payload);
        }
      });
    });
  });

  const stopDialer = startDialer(async () => {
    if (!db || !config.ownerId) return;
    const { data, error } = await db.rpc('tel_claim_due_contacts', { p_limit: 2 });
    if (error) {
      log('error', 'file d’appels', { error: error.message });
      return;
    }
    const from = config.telephonyProvider === 'twilio' ? config.twilioFromNumber : config.telnyxFromNumber;
    for (const row of (data ?? []) as ClaimedContact[]) {
      await processClaim({
        row, db, telephony, sandboxMode: config.sandboxMode, allowlist: config.sandboxAllowlist,
        from, webhookUrl: `${config.publicUrl}/webhooks/${telephony.id}`,
      });
    }
    await db.rpc('tel_release_stale_locks', { p_minutes: 15 });
  }, config.dialerIntervalMs);

  app.addHook('onClose', async () => stopDialer());

  return { app, config, db, check: checkOutboundSql, mask: maskPhone };
}

export async function start() {
  const built = buildServer();
  if (built.config.sandboxMode && built.config.sandboxAllowlist.length === 0) {
    log('warn', 'bac à sable actif sans SANDBOX_ALLOWLIST : aucune composition');
  }
  if (built.config.recordingEnabled) {
    log('warn', 'RECORDING_ENABLED est ignoré : v1 ne stocke pas d’audio');
  }
  if (built.db && built.config.ownerId) {
    const seeded = await built.db.rpc('tel_seed_default_windows', { p_owner: built.config.ownerId });
    if (seeded.error) log('warn', 'plages par défaut non semées', { error: seeded.error.message });
  }
  await built.app.listen({ port: built.config.port, host: '0.0.0.0' });
  log('info', 'voice gateway en écoute', { port: built.config.port, sandbox: built.config.sandboxMode, telephony: built.config.telephonyProvider, voice: built.config.voiceProvider });
}
