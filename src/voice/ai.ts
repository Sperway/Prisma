/**
 * Interfaces de proveedor de IA (ADR 0002): cada pieza se puede cambiar —Groq, un modelo local,
 * otro servicio— sin tocar la lógica de la conversación.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SpeechToText {
  /** Transcribe un audio Ogg Opus. */
  transcribe(audio: Buffer, options: { language: string; prompt?: string }): Promise<string>;
}

export interface LanguageModel {
  chat(messages: ChatMessage[], options: { maxTokens: number }): Promise<string>;
}

export interface TextToSpeech {
  /** Devuelve audio Ogg Opus a 48 kHz, listo para reproducir en Discord. */
  synthesize(text: string): Promise<Buffer>;
}

/** Cliente del servicio de voz propio (tts/server.py, Piper). */
export class PiperTts implements TextToSpeech {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async synthesize(text: string): Promise<Buffer> {
    const response = await this.fetchFn(`${this.baseUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`El servicio de voz respondió ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}
