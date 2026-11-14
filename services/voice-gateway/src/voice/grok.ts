import WebSocket from 'ws';
import { log } from '../log';
import { grokForceMessage, grokFunctionOutput, grokSessionUpdate, isBargeIn, type GrokTool } from './protocol';
import type { FunctionCallEvent, TranscriptChunk, VoiceAdapter, VoiceOpenOptions, VoiceSession } from './types';

export class GrokVoiceAdapter implements VoiceAdapter {
  readonly id = 'grok' as const;

  constructor(private readonly apiKey: string | null, private readonly model = 'grok-voice-latest') {}

  async open(opts: VoiceOpenOptions): Promise<VoiceSession> {
    if (!this.apiKey) throw new Error('XAI_API_KEY manquant');
    const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(this.model)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    const session = new GrokSession(ws);
    ws.send(JSON.stringify(grokSessionUpdate({
      voice: opts.voiceId,
      instructions: opts.instructions,
      tools: opts.tools,
      speakingRate: opts.speakingRate,
    })));
    ws.send(JSON.stringify(grokForceMessage(opts.openingLine)));
    return session;
  }
}

class GrokSession implements VoiceSession {
  private audioCb: ((b64: string) => void) | null = null;
  private speechCb: (() => void) | null = null;
  private transcriptCb: ((chunk: TranscriptChunk) => void) | null = null;
  private toolCb: ((call: FunctionCallEvent) => void) | null = null;

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => this.onMessage(data.toString()));
    ws.on('error', (error) => log('error', 'websocket xAI', { error: error.message }));
  }

  sendAudioPcmU(base64Payload: string): void {
    this.send({ type: 'input_audio_buffer.append', audio: base64Payload });
  }

  onAudio(cb: (b64: string) => void): void {
    this.audioCb = cb;
  }
  onSpeechStarted(cb: () => void): void {
    this.speechCb = cb;
  }
  onTranscript(cb: (chunk: TranscriptChunk) => void): void {
    this.transcriptCb = cb;
  }
  onFunctionCall(cb: (call: FunctionCallEvent) => void): void {
    this.toolCb = cb;
  }
  sendFunctionOutput(callId: string, output: unknown): void {
    this.send(grokFunctionOutput(callId, output));
    this.send({ type: 'response.create' });
  }
  sendRaw(message: object): void {
    this.send(message);
  }
  close(): void {
    this.ws.close();
  }

  private send(message: object): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  private onMessage(raw: string): void {
    let event: { type?: string; delta?: string; transcript?: string; name?: string; arguments?: string; call_id?: string; item_id?: string };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      return;
    }
    if (!event.type) return;
    if (event.type === 'response.output_audio.delta' || event.type === 'response.audio.delta') {
      if (event.delta) this.audioCb?.(event.delta);
      return;
    }
    if (isBargeIn(event)) {
      this.speechCb?.();
      return;
    }
    if (event.type === 'response.function_call_arguments.done' && event.name && event.call_id) {
      this.toolCb?.({ callId: event.call_id, name: event.name, arguments: event.arguments ?? '{}' });
      return;
    }
    if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.audio_transcript.done') {
      if (event.transcript) this.transcriptCb?.({ speaker: 'assistant', text: event.transcript, partial: false });
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.updated' || event.type === 'conversation.item.input_audio_transcription.completed') {
      if (event.transcript) this.transcriptCb?.({ speaker: 'interlocuteur', text: event.transcript, partial: event.type.endsWith('updated') });
    }
  }
}

export function loadToolDefinitions(json: { tools?: GrokTool[] }): GrokTool[] {
  return (json.tools ?? []).filter((tool) => tool.type === 'function' && tool.name);
}
