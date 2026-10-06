import { Readable } from 'node:stream';
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  entersState,
  NoSubscriberBehavior,
  StreamType,
  type VoiceConnection,
} from '@discordjs/voice';
import type { Logger } from '../logger.js';
import type { MusicManager } from '../music/manager.js';
import type { ChatMessage, LanguageModel, SpeechToText, TextToSpeech } from './ai.js';
import { GroqError } from './groq.js';
import { muxOggOpus } from './ogg.js';
import { buildSystemPrompt, cleanForSpeech, splitSentences } from './persona.js';
import { findWakeWord } from './wakeword.js';

/** Fin de frase: tanto silencio después de hablar. */
const END_OF_SPEECH_MS = 800;
/** Frases más cortas que esto se ignoran (toses, ruidos). 30 paquetes × 20 ms = 0,6 s. */
const MIN_PACKETS = 30;
/** Tope por frase: 30 s. */
const MAX_PACKETS = 1_500;
/** Después de responder, la misma persona puede seguir hablando sin decir "Prisma". */
export const FOLLOW_UP_MS = 15_000;
/** Turnos de conversación que se recuerdan dentro de la sesión. */
const HISTORY_TURNS = 10;
/** La música baja a esta fracción del volumen mientras Prisma habla. */
const DUCK_RATIO = 0.25;

export interface VoiceSessionDeps {
  guildId: string;
  connection: VoiceConnection;
  stt: SpeechToText;
  llm: LanguageModel;
  tts: TextToSpeech;
  music: MusicManager;
  logger: Logger;
  wakeWord: string;
  /** Nombre visible de un usuario, o null si es un bot (se ignora). */
  resolveSpeaker: (userId: string) => Promise<string | null>;
  /** Se llama con cada interacción real, para el control de inactividad. */
  onActivity: () => void;
}

export class VoiceSession {
  private readonly player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  private readonly history: ChatMessage[] = [];
  private readonly followUps = new Map<string, number>();
  private busy = false;
  private readonly log: Logger;

  constructor(private readonly deps: VoiceSessionDeps) {
    this.log = deps.logger.child({ module: 'voice', guild: deps.guildId });
    deps.connection.subscribe(this.player);
    deps.connection.receiver.speaking.on('start', (userId) => this.listen(userId));
    this.player.on('error', (error) => this.log.warn({ err: error }, 'Error reproduciendo voz'));
  }

  /** Graba lo que dice un usuario hasta que hace silencio. */
  private listen(userId: string): void {
    const { receiver } = this.deps.connection;
    if (receiver.subscriptions.has(userId)) return;

    const packets: Buffer[] = [];
    const stream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: END_OF_SPEECH_MS },
    });
    stream.on('data', (packet: Buffer) => {
      if (packets.length < MAX_PACKETS) packets.push(packet);
    });
    stream.once('end', () => void this.handleUtterance(userId, packets));
    stream.once('error', (error) => this.log.debug({ err: error }, 'Error recibiendo audio'));
  }

  private async handleUtterance(userId: string, packets: Buffer[]): Promise<void> {
    if (packets.length < MIN_PACKETS || this.busy) return;

    const speaker = await this.deps.resolveSpeaker(userId);
    if (!speaker) return;

    let transcript: string;
    try {
      transcript = await this.deps.stt.transcribe(muxOggOpus(packets), {
        language: 'es',
        prompt: `Conversación con Prisma.`,
      });
    } catch (error) {
      this.log.warn({ err: error }, 'Falló la transcripción');
      return;
    }
    if (!transcript) return;

    const inFollowUp = (this.followUps.get(userId) ?? 0) > Date.now();
    const match = findWakeWord(transcript, this.deps.wakeWord);
    const request = match ? match.request : inFollowUp ? transcript : null;
    this.log.debug({ user: userId, transcript, addressed: request !== null }, 'Frase transcripta');
    if (request === null || this.busy) return;

    this.busy = true;
    this.deps.onActivity();
    const started = performance.now();
    try {
      const reply = request ? await this.think(speaker, request) : '¿Sí? Te escucho.';
      const thinkMs = Math.round(performance.now() - started);
      await this.speak(reply);
      this.followUps.set(userId, Date.now() + FOLLOW_UP_MS);
      this.log.info({ user: userId, thinkMs }, 'Respuesta por voz');
    } catch (error) {
      this.log.warn({ err: error }, 'No se pudo responder');
      const message =
        error instanceof GroqError && error.status === 429
          ? 'Llegué al límite de uso por ahora. Probá de nuevo en un ratito.'
          : 'Uy, se me trabó algo. ¿Me lo repetís?';
      await this.speak(message).catch(() => undefined);
    } finally {
      this.busy = false;
    }
  }

  private async think(speaker: string, request: string): Promise<string> {
    const current = this.deps.music.getPlayer(this.deps.guildId)?.queue.current;
    const system = buildSystemPrompt({
      speaker,
      nowPlaying: current ? `${current.info.title} — ${current.info.author}` : null,
      now: new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'full',
        timeStyle: 'short',
      }),
    });

    const userMessage: ChatMessage = { role: 'user', content: `${speaker}: ${request}` };
    const reply = await this.deps.llm.chat(
      [{ role: 'system', content: system }, ...this.history, userMessage],
      { maxTokens: 300 },
    );

    this.history.push(userMessage, { role: 'assistant', content: reply });
    this.history.splice(0, Math.max(0, this.history.length - HISTORY_TURNS * 2));
    return reply || 'Mmm, no sé qué decirte.';
  }

  /** Sintetiza y reproduce. La música baja mientras Prisma habla. */
  private async speak(text: string): Promise<void> {
    const sentences = splitSentences(cleanForSpeech(text));
    if (sentences.length === 0) return;

    // Tubería: mientras suena una oración, ya se está sintetizando la siguiente.
    const synthesize = (i: number) => {
      const sentence = sentences[i];
      if (sentence === undefined) return null;
      // Si falla una oración del medio, se corta ahí (sin rechazos sin manejar).
      return this.deps.tts.synthesize(sentence).catch((error: unknown) => {
        if (i === 0) throw error;
        this.log.warn({ err: error }, 'Falló la síntesis de una oración');
        return null;
      });
    };
    let next = synthesize(0);
    const first = await next;
    if (!first) return;

    const restoreMusic = await this.duckMusic();
    try {
      let audio: Buffer | null = first;
      for (let i = 0; audio; i++) {
        next = synthesize(i + 1);
        await this.play(audio);
        audio = next ? await next : null;
      }
    } finally {
      await restoreMusic();
    }
  }

  private async play(audio: Buffer): Promise<void> {
    this.player.play(createAudioResource(Readable.from(audio), { inputType: StreamType.OggOpus }));
    await entersState(this.player, AudioPlayerStatus.Playing, 5_000);
    await entersState(this.player, AudioPlayerStatus.Idle, 120_000);
  }

  private async duckMusic(): Promise<() => Promise<void>> {
    const musicPlayer = this.deps.music.getPlayer(this.deps.guildId);
    if (!musicPlayer?.playing || musicPlayer.paused) return async () => undefined;
    const original = musicPlayer.volume;
    await musicPlayer.setVolume(Math.max(1, Math.round(original * DUCK_RATIO)));
    return async () => {
      // Si alguien cambió el volumen mientras Prisma hablaba, se respeta.
      const current = this.deps.music.getPlayer(this.deps.guildId);
      if (current && current.volume === Math.max(1, Math.round(original * DUCK_RATIO))) {
        await current.setVolume(original);
      }
    };
  }

  destroy(): void {
    this.player.stop(true);
    this.deps.connection.destroy();
  }
}
