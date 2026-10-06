import { Events, type Client, type Message, type SendableChannels } from 'discord.js';
import { LavalinkManager, type Player } from 'lavalink-client';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { brandEmbed, errorEmbed } from '../ui/embeds.js';
import { NoPlayableVersionError } from './catalog.js';
import { nowPlayingPanel, trackLink } from './panel.js';

/** Si la cola termina y nadie agrega nada, Prisma se va del canal después de este tiempo. */
export const IDLE_DISCONNECT_MS = 3 * 60_000;
const PANEL_KEY = 'panelMessageId';
/** Cada cuánto se actualiza la barra de progreso del panel mientras suena un tema. */
export const PANEL_REFRESH_MS = 15_000;
const progressTimers = new Map<string, NodeJS.Timeout>();

function stopProgress(guildId: string): void {
  clearInterval(progressTimers.get(guildId));
  progressTimers.delete(guildId);
}

export type MusicManager = LavalinkManager;

function textChannelOf(client: Client, player: Player): SendableChannels | null {
  if (!player.textChannelId) return null;
  const channel = client.channels.cache.get(player.textChannelId);
  return channel?.isSendable() ? channel : null;
}

async function deletePanel(client: Client, player: Player): Promise<void> {
  stopProgress(player.guildId);
  const messageId = player.get<string | undefined>(PANEL_KEY);
  if (!messageId) return;
  player.set(PANEL_KEY, undefined);
  const channel = textChannelOf(client, player);
  await channel?.messages.delete(messageId).catch(() => undefined);
}

/** Actualiza el panel existente (p. ej. tras pausar o cambiar el modo de repetición). */
export async function refreshPanel(client: Client, player: Player): Promise<void> {
  const messageId = player.get<string | undefined>(PANEL_KEY);
  const track = player.queue.current;
  const channel = textChannelOf(client, player);
  if (!messageId || !track || !channel) return;
  await channel.messages.edit(messageId, nowPlayingPanel(player, track)).catch(() => undefined);
}

/** Mantiene la barra de progreso al día (no edita mientras está en pausa). */
function startProgress(client: Client, player: Player): void {
  stopProgress(player.guildId);
  const timer = setInterval(() => {
    if (player.paused || !player.playing) return;
    void refreshPanel(client, player);
  }, PANEL_REFRESH_MS);
  timer.unref();
  progressTimers.set(player.guildId, timer);
}

export function createMusicManager(client: Client, config: Config, logger: Logger): MusicManager {
  const log = logger.child({ module: 'music' });

  const manager = new LavalinkManager({
    nodes: [
      {
        id: 'principal',
        host: config.LAVALINK_HOST,
        port: config.LAVALINK_PORT,
        authorization: config.LAVALINK_PASSWORD,
        // Lavalink puede reiniciarse (actualizaciones, OOM): reintentar siempre.
        retryAmount: Infinity,
        retryDelay: 10_000,
      },
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
    autoSkip: true,
    queueOptions: { maxPreviousTracks: 10 },
    playerOptions: {
      defaultSearchPlatform: 'scsearch',
      // Los temas del catálogo conservan título, artista y carátula de Spotify al resolverse.
      useUnresolvedData: true,
      // Si alguien desconecta a Prisma del canal, se respeta: se destruye el reproductor.
      onDisconnect: { destroyPlayer: true },
      onEmptyQueue: { destroyAfterMs: IDLE_DISCONNECT_MS },
    },
  });

  client.on(Events.Raw, (packet) => void manager.sendRawData(packet));

  manager.nodeManager
    .on('connect', (node) => log.info({ node: node.id }, 'Conectado a Lavalink'))
    .on('reconnecting', (node) => log.warn({ node: node.id }, 'Reconectando a Lavalink'))
    .on('disconnect', (node, reason) =>
      log.warn({ node: node.id, reason }, 'Desconectado de Lavalink'),
    )
    .on('error', (node, error) => log.error({ node: node.id, err: error }, 'Error de Lavalink'));

  manager
    .on('trackStart', async (player, track) => {
      if (!track) return;
      log.info({ guild: player.guildId, title: track.info.title }, 'Reproduciendo');
      await deletePanel(client, player);
      const channel = textChannelOf(client, player);
      const message: Message | undefined = await channel
        ?.send(nowPlayingPanel(player, track))
        .catch((error: unknown) => {
          log.warn({ err: error }, 'No se pudo publicar el panel');
          return undefined;
        });
      if (message) {
        player.set(PANEL_KEY, message.id);
        startProgress(client, player);
      }
    })
    .on('trackError', async (player, track, payload) => {
      // Si falló la resolución (buscar la versión en SoundCloud), la librería pasa el Error;
      // si falló Lavalink al reproducir, pasa el evento con "exception".
      const resolveError =
        (payload as unknown) instanceof Error ? (payload as unknown as Error) : null;
      log.warn(
        {
          guild: player.guildId,
          title: track?.info.title,
          ...(resolveError ? { err: resolveError } : { exception: payload.exception }),
        },
        'Error reproduciendo',
      );
      const name = track ? trackLink(track) : 'el tema';
      const reason =
        resolveError instanceof NoPlayableVersionError
          ? `No encontré una versión reproducible de ${name}.`
          : `No pude reproducir ${name}.`;
      await textChannelOf(client, player)
        ?.send({ embeds: [errorEmbed(`${reason} Paso al siguiente.`)] })
        .catch(() => undefined);
    })
    .on('trackStuck', (player, track) =>
      log.warn({ guild: player.guildId, title: track?.info.title }, 'Tema trabado, saltando'),
    )
    .on('queueEnd', async (player) => {
      await deletePanel(client, player);
      const minutes = IDLE_DISCONNECT_MS / 60_000;
      await textChannelOf(client, player)
        ?.send({
          embeds: [
            brandEmbed().setDescription(
              `✅ Terminó la cola. Si nadie agrega nada, me voy en ${minutes} minutos.`,
            ),
          ],
        })
        .catch(() => undefined);
    })
    .on('playerDestroy', async (player, reason) => {
      log.info({ guild: player.guildId, reason }, 'Reproductor destruido');
      await deletePanel(client, player);
    });

  return manager;
}
