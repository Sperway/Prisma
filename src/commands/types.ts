import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import type { MusicManager } from '../music/manager.js';
import type { SpotifyClient } from '../music/spotify.js';

/** Dependencias compartidas que reciben todos los comandos. */
export interface BotContext {
  config: Config;
  logger: Logger;
  music: MusicManager;
  /** null si Spotify no está configurado. */
  spotify: SpotifyClient | null;
  startedAt: Date;
  commands: ReadonlyMap<string, Command>;
}

export interface Command {
  /** Definición del slash command (normalmente un SlashCommandBuilder). */
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(interaction: ChatInputCommandInteraction, ctx: BotContext): Promise<void>;
}
