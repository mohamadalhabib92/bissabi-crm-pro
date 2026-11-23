import { verifyTwilioSignature } from './signature';
import type { DialInput, NormalizedEvent, TelephonyProvider } from './types';

type TwilioConfig = {
  accountSid: string | null;
  authToken: string | null;
  baseUrl?: string;
};

/** Adaptateur secondaire. Le flux média passe par le TwiML `<Connect><Stream>` servi par le gateway. */
export class TwilioProvider implements TelephonyProvider {
  readonly id = 'twilio' as const;

  constructor(private readonly cfg: TwilioConfig) {}

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, url: string): boolean {
    if (!this.cfg.authToken) return false;
    const header = headers['x-twilio-signature'] ?? headers['X-Twilio-Signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    const params = Object.fromEntries(new URLSearchParams(rawBody.toString('utf8')));
    return verifyTwilioSignature({ authToken: this.cfg.authToken, url, params, signature });
  }

  parseEvent(body: unknown): NormalizedEvent | null {
    const params = body as Record<string, string>;
    const callId = params.CallSid;
    if (!callId) return null;
    const status = params.CallStatus ?? '';
    let type: NormalizedEvent['type'] = 'other';
    if (status === 'ringing' || params.Direction) type = status === 'in-progress' ? 'answered' : 'initiated';
    if (status === 'in-progress') type = 'answered';
    if (status === 'completed' || status === 'busy' || status === 'no-answer' || status === 'failed' || status === 'canceled') type = 'hangup';
    const amd = params.AnsweredBy ?? '';
    return {
      eventId: `${callId}:${status}:${params.SequenceNumber ?? params.Timestamp ?? ''}`,
      rawType: status || 'twilio',
      type,
      callId,
      from: params.From ?? '',
      to: params.To ?? '',
      direction: (params.Direction ?? '').includes('inbound') ? 'inbound' : 'outbound',
      answeredBy: /machine/i.test(amd) ? 'machine' : /human/i.test(amd) ? 'human' : /fax/i.test(amd) ? 'fax' : undefined,
    };
  }

  async dial(input: DialInput): Promise<{ providerCallId: string }> {
    const sid = this.requiredSid();
    const body = new URLSearchParams({
      To: input.to,
      From: input.from,
      Url: `${input.webhookUrl.replace(/\/webhooks\/twilio$/, '')}/twiml/stream`,
      StatusCallback: input.webhookUrl,
      MachineDetection: input.machineDetection ? 'DetectMessageEnd' : 'Enable',
    });
    const res = await fetch(`${this.cfg.baseUrl ?? 'https://api.twilio.com'}/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${this.cfg.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const json = await res.json() as { sid?: string; message?: string };
    if (!res.ok || !json.sid) throw new Error(`Twilio dial ${res.status}: ${json.message ?? 'sans sid'}`);
    return { providerCallId: json.sid };
  }

  async answer(): Promise<void> {
    return undefined;
  }
  async hangup(callId: string): Promise<void> {
    const sid = this.requiredSid();
    await fetch(`${this.cfg.baseUrl ?? 'https://api.twilio.com'}/2010-04-01/Accounts/${sid}/Calls/${callId}.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${this.cfg.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Status: 'completed' }),
    });
  }
  async startStream(): Promise<void> {
    return undefined;
  }
  async speak(): Promise<void> {
    throw new Error('Twilio : la lecture répondeur passe par le TwiML, pas par speak Telnyx.');
  }
  async bridge(): Promise<void> {
    throw new Error('Twilio : le pont d’appel n’est pas branché dans cette version (adaptateur secondaire).');
  }

  private requiredSid(): string {
    if (!this.cfg.accountSid || !this.cfg.authToken) throw new Error('Identifiants Twilio manquants');
    return this.cfg.accountSid;
  }
}

export function twimlStream(streamUrl: string): string {
  const safe = streamUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${safe}"/></Connect></Response>`;
}
