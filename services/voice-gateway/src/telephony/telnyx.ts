import { log } from '../log';
import { verifyTelnyxSignature } from './signature';
import { decodeClientState, type DialInput, type NormalizedEvent, type TelephonyProvider } from './types';

type TelnyxConfig = {
  apiKey: string | null;
  publicKey: string | null;
  connectionId: string | null;
  baseUrl?: string;
};

export class TelnyxProvider implements TelephonyProvider {
  readonly id = 'telnyx' as const;
  private readonly baseUrl: string;

  constructor(private readonly cfg: TelnyxConfig) {
    this.baseUrl = cfg.baseUrl ?? 'https://api.telnyx.eu/v2';
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    if (!this.cfg.publicKey) {
      log('error', 'webhook Telnyx refusé : TELNYX_PUBLIC_KEY absente');
      return false;
    }
    const header = (name: string) => {
      const value = headers[name] ?? headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };
    return verifyTelnyxSignature({
      rawBody,
      timestamp: header('telnyx-timestamp'),
      signature: header('telnyx-signature-ed25519'),
      publicKeyBase64: this.cfg.publicKey,
    });
  }

  parseEvent(body: unknown): NormalizedEvent | null {
    const data = (body as { data?: { id?: string; event_type?: string; payload?: Record<string, unknown> } })?.data;
    if (!data?.event_type || !data.payload) return null;
    const payload = data.payload;
    const callId = String(payload.call_control_id ?? '');
    if (!callId) return null;
    const rawType = data.event_type;
    const result = String(payload.result ?? payload.machine_detection_result ?? '');
    let type: NormalizedEvent['type'] = 'other';
    if (rawType === 'call.initiated') type = 'initiated';
    else if (rawType === 'call.answered') type = 'answered';
    else if (rawType === 'call.hangup') type = 'hangup';
    else if (rawType.includes('machine.detection') || rawType.includes('machine.premium')) type = 'machine';
    else if (rawType.includes('greeting.ended') || rawType.includes('machine.greeting')) type = 'greeting_ended';
    else if (rawType === 'call.speak.ended') type = 'speak_ended';
    const direction = String(payload.direction ?? '').includes('incoming') ? 'inbound' : 'outbound';
    let answeredBy: NormalizedEvent['answeredBy'];
    if (/human/i.test(result)) answeredBy = 'human';
    else if (/machine|voicemail/i.test(result)) answeredBy = 'machine';
    else if (/fax/i.test(result)) answeredBy = 'fax';
    return {
      eventId: String(data.id ?? `${rawType}:${callId}:${payload.occurred_at ?? ''}`),
      rawType,
      type,
      callId,
      from: String(payload.from ?? ''),
      to: String(payload.to ?? ''),
      direction,
      answeredBy,
      clientState: decodeClientState(payload.client_state),
    };
  }

  async dial(input: DialInput): Promise<{ providerCallId: string }> {
    const json = await this.command('/calls', {
      connection_id: this.requiredConnection(),
      to: input.to,
      from: input.from,
      webhook_url: input.webhookUrl,
      timeout_secs: 30,
      answering_machine_detection: input.machineDetection ? 'detect_beep' : 'disabled',
      client_state: input.clientState ? Buffer.from(JSON.stringify(input.clientState)).toString('base64url') : undefined,
    });
    const id = json?.data?.call_control_id;
    if (!id) throw new Error('Telnyx : call_control_id absent');
    return { providerCallId: String(id) };
  }

  answer(callId: string) {
    return this.action(callId, 'answer', {});
  }
  hangup(callId: string) {
    return this.action(callId, 'hangup', {});
  }
  startStream(callId: string, streamUrl: string) {
    return this.action(callId, 'streaming_start', {
      stream_url: streamUrl,
      stream_track: 'inbound_track',
      stream_bidirectional_mode: 'rtp',
      stream_bidirectional_codec: 'PCMU',
    });
  }
  speak(callId: string, text: string, language = 'fr-FR') {
    return this.action(callId, 'speak', { payload: text, voice: 'female', language });
  }
  bridge(callId: string, otherCallId: string) {
    return this.action(callId, 'bridge', { call_control_id: otherCallId });
  }

  private requiredConnection(): string {
    if (!this.cfg.connectionId) throw new Error('TELNYX_CONNECTION_ID manquant');
    return this.cfg.connectionId;
  }

  private async action(callId: string, name: string, body: unknown): Promise<void> {
    await this.command(`/calls/${encodeURIComponent(callId)}/actions/${name}`, body);
  }

  private async command(path: string, body: unknown): Promise<{ data?: { call_control_id?: string } }> {
    if (!this.cfg.apiKey) throw new Error('TELNYX_API_KEY manquant');
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Telnyx ${path} ${res.status}: ${text.slice(0, 280)}`);
    return text ? JSON.parse(text) as { data?: { call_control_id?: string } } : {};
  }
}
