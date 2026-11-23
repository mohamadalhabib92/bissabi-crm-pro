import { toE164 } from './compliance/phone';

export type GatewayConfig = {
  port: number;
  publicUrl: string;
  sandboxMode: boolean;
  sandboxAllowlist: string[];
  transferPhone: string | null;
  ownerId: string | null;
  ownerDisplayName: string;
  telephonyProvider: 'telnyx' | 'twilio';
  voiceProvider: 'grok' | 'eu_pipeline';
  recordingEnabled: boolean;
  supabaseUrl: string | null;
  supabaseServiceKey: string | null;
  telnyxApiKey: string | null;
  telnyxPublicKey: string | null;
  telnyxConnectionId: string | null;
  telnyxFromNumber: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioFromNumber: string | null;
  xaiApiKey: string | null;
  xaiModel: string;
  euSttUrl: string | null;
  euLlmUrl: string | null;
  euTtsUrl: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
  outlookAccessToken: string | null;
  dialerIntervalMs: number;
  promptsDir: string;
};

function clean(name: string): string | null {
  const value = (process.env[name] ?? '').trim();
  if (!value || value.startsWith('YOUR_')) return null;
  return value;
}

function flag(name: string, fallback: boolean): boolean {
  const value = (process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const allow = (clean('SANDBOX_ALLOWLIST') ?? '')
    .split(',')
    .map((n) => toE164(n.trim()))
    .filter((n): n is string => !!n);
  const transfer = clean('TRANSFER_PHONE_NUMBER');
  const telephony = clean('TELEPHONY_PROVIDER') === 'twilio' ? 'twilio' : 'telnyx';
  const voice = clean('VOICE_PROVIDER') === 'eu_pipeline' ? 'eu_pipeline' : 'grok';
  return {
    port: Number(clean('PORT') ?? 8080),
    publicUrl: (clean('PUBLIC_GATEWAY_URL') ?? 'http://localhost:8080').replace(/\/$/, ''),
    sandboxMode: flag('SANDBOX_MODE', true),
    sandboxAllowlist: allow,
    transferPhone: transfer ? toE164(transfer) : null,
    ownerId: clean('BISSABI_OWNER_ID'),
    ownerDisplayName: clean('OWNER_DISPLAY_NAME') ?? 'le responsable Bissabi',
    telephonyProvider: telephony,
    voiceProvider: voice,
    recordingEnabled: flag('RECORDING_ENABLED', false),
    supabaseUrl: clean('SUPABASE_URL'),
    supabaseServiceKey: clean('SUPABASE_SERVICE_ROLE_KEY'),
    telnyxApiKey: clean('TELNYX_API_KEY'),
    telnyxPublicKey: clean('TELNYX_PUBLIC_KEY'),
    telnyxConnectionId: clean('TELNYX_CONNECTION_ID'),
    telnyxFromNumber: clean('TELNYX_FROM_NUMBER') ? toE164(clean('TELNYX_FROM_NUMBER') as string) : null,
    twilioAccountSid: clean('TWILIO_ACCOUNT_SID'),
    twilioAuthToken: clean('TWILIO_AUTH_TOKEN'),
    twilioFromNumber: clean('TWILIO_FROM_NUMBER') ? toE164(clean('TWILIO_FROM_NUMBER') as string) : null,
    xaiApiKey: clean('XAI_API_KEY'),
    xaiModel: clean('XAI_VOICE_MODEL') ?? 'grok-voice-latest',
    euSttUrl: clean('EU_STT_URL'),
    euLlmUrl: clean('EU_LLM_URL'),
    euTtsUrl: clean('EU_TTS_URL'),
    googleClientId: clean('GOOGLE_CLIENT_ID'),
    googleClientSecret: clean('GOOGLE_CLIENT_SECRET'),
    googleRefreshToken: clean('GOOGLE_REFRESH_TOKEN'),
    googleCalendarId: clean('GOOGLE_CALENDAR_ID'),
    outlookAccessToken: clean('OUTLOOK_ACCESS_TOKEN'),
    dialerIntervalMs: Number(clean('DIALER_INTERVAL_MS') ?? 20000),
    promptsDir: clean('PROMPTS_DIR') ?? '',
  };
}
