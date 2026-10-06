import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type VoiceConnection,
} from '@discordjs/voice';
import {
  Client,
  Events,
  GatewayIntentBits,
  OAuth2Scopes,
  PermissionFlagsBits,
  type Client as MainClient,
  type SendableChannels,
} from 'discord.js';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { MusicManager } from '../music/manager.js';
import { brandEmbed } from '../ui/embeds.js';
import { PiperTts } from './ai.js';
import { GroqClient } from './groq.js';
import { VoiceSession } from './session.js';

interface ActiveSession {
  session: VoiceSession;
  channelId: string;
  textChannel: SendableChannels | null;
  lastActivity: number;
}

export class JoinError extends Error {
  override name = 'JoinError';
}

/**
 * Prisma Voz: segundo bot que escucha y habla (ADR 0006). Corre en el mismo proceso que el bot
 * principal; los mensajes de texto los publica el bot principal.
 */
export class VoiceManager {
  readonly client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly groq: GroqClient;
  private readonly tts: PiperTts;
  private readonly log: Logger;
  private idleTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: Config & { VOICE_DISCORD_TOKEN: string; GROQ_API_KEY: string },
    private readonly mainClient: MainClient,
    private readonly music: MusicManager,
    logger: Logger,
  ) {
    this.log = logger.child({ module: 'voice' });
    this.groq = new GroqClient({
      apiKey: config.GROQ_API_KEY,
      sttModel: config.GROQ_STT_MODEL,
      chatModel: config.GROQ_CHAT_MODEL,
    });
    this.tts = new PiperTts(config.TTS_URL);

    this.client.once(Events.ClientReady, (ready) => void this.onReady(ready));
    this.client.on(Events.GuildCreate, (guild) => {
      if (guild.id !== config.DISCORD_GUILD_ID) void guild.leave();
    });
    this.client.on(Events.VoiceStateUpdate, (oldState) => {
      const active = this.sessions.get(oldState.guild.id);
      if (!active || oldState.channelId !== active.channelId) return;
      if (this.humansIn(oldState.guild.id, active.channelId) === 0) {
        void this.leave(oldState.guild.id, 'No queda nadie en el canal, me voy. 👋');
      }
    });
    this.client.on(Events.Error, (error) => this.log.error({ err: error }, 'Error de Prisma Voz'));
  }

  async start(): Promise<void> {
    await this.client.login(this.config.VOICE_DISCORD_TOKEN);
    this.idleTimer = setInterval(() => this.checkIdle(), 30_000);
    this.idleTimer.unref();
  }

  private async onReady(client: Client<true>): Promise<void> {
    this.log.info({ user: client.user.tag }, 'Prisma Voz conectado');
    for (const guild of client.guilds.cache.values()) {
      if (guild.id !== this.config.DISCORD_GUILD_ID) await guild.leave();
    }
    if (!client.guilds.cache.has(this.config.DISCORD_GUILD_ID)) {
      const invite = client.generateInvite({
        scopes: [OAuth2Scopes.Bot],
        permissions: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
        ],
        guild: this.config.DISCORD_GUILD_ID,
        disableGuildSelect: true,
      });
      this.log.warn(
        { invite },
        'Prisma Voz todavía no está en el servidor. Invitalo con este enlace',
      );
    }
  }

  get ready(): boolean {
    return this.client.isReady() && this.client.guilds.cache.has(this.config.DISCORD_GUILD_ID);
  }

  activeChannel(guildId: string): string | null {
    return this.sessions.get(guildId)?.channelId ?? null;
  }

  private humansIn(guildId: string, channelId: string): number {
    const channel = this.client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
    return channel?.isVoiceBased() ? channel.members.filter((m) => !m.user.bot).size : 0;
  }

  async join(guildId: string, channelId: string, textChannel: SendableChannels | null) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new JoinError('Prisma Voz no está en el servidor.');
    const channel = guild.channels.cache.get(channelId);
    const me = guild.members.me;
    if (!channel?.isVoiceBased() || !me) throw new JoinError('No encuentro ese canal de voz.');
    if (!channel.permissionsFor(me).has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      throw new JoinError(`Prisma Voz no tiene permiso para entrar y hablar en ${channel}.`);
    }

    await this.leave(guildId);
    const connection: VoiceConnection = joinVoiceChannel({
      guildId,
      channelId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false, // tiene que escuchar
      selfMute: false,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      connection.destroy();
      throw new JoinError('No pude conectarme al canal de voz. Probá de nuevo.');
    }

    const active: ActiveSession = {
      channelId,
      textChannel,
      lastActivity: Date.now(),
      session: new VoiceSession({
        guildId,
        connection,
        stt: this.groq,
        llm: this.groq,
        tts: this.tts,
        music: this.music,
        logger: this.log,
        wakeWord: this.config.VOICE_WAKE_WORD,
        resolveSpeaker: (userId) => this.resolveSpeaker(guildId, userId),
        onActivity: () => {
          active.lastActivity = Date.now();
        },
      }),
    };
    this.sessions.set(guildId, active);

    // Si Discord corta la conexión y no se recupera en 5 s, se cierra la sesión.
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        void this.leave(guildId);
      }
    });
    this.log.info({ guild: guildId, channel: channelId }, 'Sesión de voz iniciada');
  }

  private async resolveSpeaker(guildId: string, userId: string): Promise<string | null> {
    const guild = this.mainClient.guilds.cache.get(guildId);
    const member = await guild?.members.fetch(userId).catch(() => null);
    if (!member || member.user.bot) return null;
    return member.displayName;
  }

  async leave(guildId: string, farewell?: string): Promise<boolean> {
    const active = this.sessions.get(guildId);
    if (!active) return false;
    this.sessions.delete(guildId);
    active.session.destroy();
    if (farewell) {
      await active.textChannel
        ?.send({ embeds: [brandEmbed().setDescription(farewell)] })
        .catch(() => undefined);
    }
    this.log.info({ guild: guildId }, 'Sesión de voz terminada');
    return true;
  }

  private checkIdle(): void {
    const limit = this.config.VOICE_IDLE_MINUTES * 60_000;
    for (const [guildId, active] of this.sessions) {
      if (Date.now() - active.lastActivity > limit) {
        void this.leave(
          guildId,
          `Hace ${this.config.VOICE_IDLE_MINUTES} minutos que nadie me habla, me voy. Usá \`/charlar\` para llamarme.`,
        );
      }
    }
  }

  async destroy(): Promise<void> {
    clearInterval(this.idleTimer);
    for (const guildId of [...this.sessions.keys()]) await this.leave(guildId);
    await this.client.destroy();
  }
}
