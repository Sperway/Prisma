/**
 * Cliente de Groq (API compatible con OpenAI): voz a texto con Whisper y respuestas con un LLM.
 * Implementa las interfaces de proveedor de ai.ts para poder cambiarlo por otro (ADR 0002).
 */
import type { ChatMessage, LanguageModel, SpeechToText } from './ai.js';

const API_URL = 'https://api.groq.com/openai/v1';

export class GroqError extends Error {
  override name = 'GroqError';
  constructor(
    message: string,
    readonly status: number,
    /** Segundos sugeridos por Groq antes de reintentar (en errores 429). */
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export interface GroqOptions {
  apiKey: string;
  sttModel: string;
  chatModel: string;
  fetchFn?: typeof fetch;
}

export class GroqClient implements SpeechToText, LanguageModel {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: GroqOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private async post(path: string, body: FormData | string, json: boolean): Promise<unknown> {
    const response = await this.fetchFn(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        ...(json && { 'Content-Type': 'application/json' }),
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after')) || undefined;
      const detail = (await response.text()).slice(0, 300);
      throw new GroqError(
        `Groq respondió ${response.status}: ${detail}`,
        response.status,
        retryAfter,
      );
    }
    return response.json();
  }

  async transcribe(audio: Buffer, { language, prompt }: { language: string; prompt?: string }) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/ogg' }), 'voz.ogg');
    form.append('model', this.options.sttModel);
    form.append('language', language);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    // El "prompt" orienta a Whisper: ayuda a que escriba bien el nombre "Prisma".
    if (prompt) form.append('prompt', prompt);
    const result = (await this.post('/audio/transcriptions', form, false)) as { text: string };
    return result.text.trim();
  }

  async chat(messages: ChatMessage[], { maxTokens }: { maxTokens: number }) {
    const result = (await this.post(
      '/chat/completions',
      JSON.stringify({
        model: this.options.chatModel,
        messages,
        temperature: 0.7,
        max_completion_tokens: maxTokens,
        // Modelos de razonamiento (gpt-oss): razonar poco para responder rápido y sin mostrarlo.
        ...(this.options.chatModel.startsWith('openai/gpt-oss') && {
          reasoning_effort: 'low',
          include_reasoning: false,
        }),
      }),
      true,
    )) as { choices: { message: { content: string | null } }[] };
    return result.choices[0]?.message.content?.trim() ?? '';
  }
}
