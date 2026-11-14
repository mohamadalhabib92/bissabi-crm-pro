export type CallDirection = 'inbound' | 'outbound';

export type NormalizedEvent = {
  eventId: string;
  rawType: string;
  type: 'initiated' | 'answered' | 'hangup' | 'machine' | 'greeting_ended' | 'speak_ended' | 'other';
  callId: string;
  from: string;
  to: string;
  direction: CallDirection;
  answeredBy?: 'human' | 'machine' | 'fax' | 'unknown';
  clientState?: Record<string, unknown>;
};

export type DialInput = {
  to: string;
  from: string;
  webhookUrl: string;
  clientState?: Record<string, unknown>;
  machineDetection: boolean;
};

export interface TelephonyProvider {
  readonly id: 'telnyx' | 'twilio';
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, url: string): boolean;
  parseEvent(body: unknown): NormalizedEvent | null;
  dial(input: DialInput): Promise<{ providerCallId: string }>;
  answer(callId: string): Promise<void>;
  hangup(callId: string): Promise<void>;
  startStream(callId: string, streamUrl: string): Promise<void>;
  speak(callId: string, text: string, language?: string): Promise<void>;
  bridge(callId: string, otherCallId: string): Promise<void>;
}

export function encodeClientState(state: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

export function decodeClientState(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'string') return undefined;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
