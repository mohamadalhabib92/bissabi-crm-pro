export type GrokTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** session.update pour Grok Voice : µ-law 8 kHz, VAD serveur, voix choisie sur la persona. */
export function grokSessionUpdate(opts: {
  voice: string;
  instructions: string;
  tools: GrokTool[];
  speakingRate?: number;
}) {
  return {
    type: 'session.update' as const,
    session: {
      voice: opts.voice,
      instructions: opts.instructions,
      turn_detection: { type: 'server_vad' },
      audio: {
        input: { format: { type: 'audio/pcmu', rate: 8000 } },
        output: { format: { type: 'audio/pcmu', rate: 8000 }, speed: opts.speakingRate ?? 1 },
      },
      tools: opts.tools,
    },
  };
}

export function grokAppendAudio(base64Payload: string) {
  return { type: 'input_audio_buffer.append' as const, audio: base64Payload };
}

export function grokForceMessage(text: string) {
  return {
    type: 'conversation.item.create' as const,
    item: {
      type: 'force_message',
      role: 'assistant',
      interruptible: false,
      content: [{ type: 'output_text', text }],
    },
  };
}

export function grokFunctionOutput(callId: string, output: unknown) {
  return {
    type: 'conversation.item.create' as const,
    item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
  };
}

export function telnyxMediaFrame(base64Payload: string) {
  return { event: 'media' as const, media: { payload: base64Payload } };
}

export function telnyxClearFrame() {
  return { event: 'clear' as const };
}

export function isBargeIn(event: { type?: string }): boolean {
  return event.type === 'input_audio_buffer.speech_started';
}

/** response.create n'est émis qu'une fois tous les outils parallèles rendus. */
export class ToolBatch {
  private pending = 0;
  private outputs: object[] = [];

  pushCall(): void {
    this.pending += 1;
  }

  pushOutput(callId: string, output: unknown): object[] | null {
    this.outputs.push(grokFunctionOutput(callId, output));
    this.pending -= 1;
    if (this.pending > 0) return null;
    const batch = [...this.outputs, { type: 'response.create' }];
    this.outputs = [];
    this.pending = 0;
    return batch;
  }
}
