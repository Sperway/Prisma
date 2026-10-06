import { Client, Events, GatewayIntentBits } from 'discord.js';
import { allCommands, buildCommandMap } from './commands/index.js';
import type { BotContext } from './commands/types.js';
import { ConfigError, loadConfig } from './config.js';
import { handleInteraction } from './events/interactionCreate.js';
import { handleReady } from './events/ready.js';
import { startHeartbeat } from './health.js';
import { createLogger } from './logger.js';
import { createAutoLeave } from './music/autoLeave.js';
import { createMusicManager } from './music/manager.js';
import { SpotifyClient } from './music/spotify.js';
import { createSearch, createSuggestionProvider } from './music/suggestions.js';
import { VERSION } from './version.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger(config);
  logger.info({ version: VERSION, env: config.NODE_ENV }, 'Iniciando Prisma');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  const music = createMusicManager(client, config, logger);
  const spotify =
    config.SPOTIFY_ENABLED && config.SPOTIFY_CLIENT_ID && config.SPOTIFY_CLIENT_SECRET
      ? new SpotifyClient(
          config.SPOTIFY_CLIENT_ID,
          config.SPOTIFY_CLIENT_SECRET,
          config.SPOTIFY_MARKET,
        )
      : null;
  const search = createSearch(music, spotify, logger);
  const ctx: BotContext = {
    config,
    logger,
    music,
    spotify,
    search,
    suggest: createSuggestionProvider(search, logger),
    startedAt: new Date(),
    commands: buildCommandMap(allCommands),
  };

  client.once(Events.ClientReady, (readyClient) => {
    handleReady(readyClient, ctx).catch((error: unknown) =>
      logger.error({ err: error }, 'Error en la inicialización'),
    );
  });
  client.on(Events.InteractionCreate, (interaction) => void handleInteraction(interaction, ctx));
  client.on(Events.GuildCreate, (guild) => {
    if (guild.id === config.DISCORD_GUILD_ID) return;
    logger.warn({ guild: guild.id, name: guild.name }, 'Servidor no autorizado: saliendo');
    void guild.leave();
  });
  client.on(Events.VoiceStateUpdate, createAutoLeave(client, music, logger));
  client.on(Events.Warn, (message) => logger.warn(message));
  client.on(Events.Error, (error) => logger.error({ err: error }, 'Error del cliente de Discord'));

  const stopHeartbeat = startHeartbeat(client, config.HEALTH_FILE, logger);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Apagando Prisma');
    stopHeartbeat();
    await client.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Promesa rechazada'));
  process.on('uncaughtException', (error) => {
    // Estado desconocido: mejor morir y que Docker reinicie limpio.
    logger.fatal({ err: error }, 'Excepción no capturada');
    process.exit(1);
  });

  await client.login(config.DISCORD_TOKEN);
}

await main();
