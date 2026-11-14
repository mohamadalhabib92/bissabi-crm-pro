import type { GrokTool } from './protocol';

export type VoiceOpenOptions = {
  voiceId: string;
  provider: 'grok' | 'eu_pipeline';
  instructions: string;
  openingLine: string;
  speakingRate: number;
  tools: GrokTool[];
};

export type TranscriptChunk = { speaker: 'assistant' | 'interlocuteur'; text: string; partial: boolean };

export type FunctionCallEvent = { callId: string; name: string; arguments: string };

export interface VoiceSession {
  sendAudioPcmU(base64Payload: string): void;
  onAudio(cb: (base64Payload: string) => void): void;
  onSpeechStarted(cb: () => void): void;
  onTranscript(cb: (chunk: TranscriptChunk) => void): void;
  onFunctionCall(cb: (call: FunctionCallEvent) => void): void;
  sendFunctionOutput(callId: string, output: unknown): void;
  sendRaw(message: object): void;
  close(): void;
}

export interface VoiceAdapter {
  readonly id: 'grok' | 'eu_pipeline';
  open(opts: VoiceOpenOptions): Promise<VoiceSession>;
}

export class EuPipelineNotReady extends Error {
  constructor() {
    super('Pipeline STT+LLM+TTS hébergé dans l’UE non branché (EU_STT_URL, EU_LLM_URL, EU_TTS_URL).');
    this.name = 'EuPipelineNotReady';
  }
}

/** Contrat réservé au plan B. Aucun audio n'est envoyé tant que l'adaptateur n'est pas implémenté. */
export function euPipelineContract(env: { sttUrl?: string; llmUrl?: string; ttsUrl?: string }) {
  return {
    stt: { method: 'POST' as const, url: env.sttUrl ?? null, body: { audio_base64: '<pcmu>', sample_rate: 8000 } },
    llm: { method: 'POST' as const, url: env.llmUrl ?? null, body: { messages: [], tools: [] } },
    tts: { method: 'POST' as const, url: env.ttsUrl ?? null, body: { text: '', voice_id: '', format: 'audio/pcmu' } },
    ready: Boolean(env.sttUrl && env.llmUrl && env.ttsUrl),
  };
}

export class EuPipelineAdapter implements VoiceAdapter {
  readonly id = 'eu_pipeline' as const;
  constructor(private readonly urls: { sttUrl?: string; llmUrl?: string; ttsUrl?: string }) {}
  async open(): Promise<VoiceSession> {
    if (!euPipelineContract(this.urls).ready) throw new EuPipelineNotReady();
    throw new Error('Adaptateur UE : URLs présentes, échange audio non implémenté dans cette version.');
  }
}
