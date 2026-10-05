import type { Client, VoiceState } from 'discord.js';
import type { Logger } from '../logger.js';
import { brandEmbed } from '../ui/embeds.js';
import type { MusicManager } from './manager.js';

/** Tiempo que Prisma espera en un canal sin personas antes de irse. */
export const ALONE_TIMEOUT_MS = 2 * 60_000;

/**
 * Si no queda nadie con Prisma en el canal de voz, se va después de ALONE_TIMEOUT_MS.
 * Si alguien vuelve antes, se cancela.
 */
export function createAutoLeave(client: Client, music: MusicManager, logger: Logger) {
  const timers = new Map<string, NodeJS.Timeout>();

  const cancel = (guildId: string) => {
    clearTimeout(timers.get(guildId));
    timers.delete(guildId);
  };

  const humansIn = (guildId: string, channelId: string): number => {
    const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
    if (!channel?.isVoiceBased()) return 0;
    return channel.members.filter((member) => !member.user.bot).size;
  };

  return (oldState: VoiceState, newState: VoiceState) => {
    const guildId = newState.guild.id;
    const player = music.getPlayer(guildId);
    if (!player?.voiceChannelId) return cancel(guildId);

    const affectsPlayer =
      oldState.channelId === player.voiceChannelId || newState.channelId === player.voiceChannelId;
    if (!affectsPlayer) return;

    if (humansIn(guildId, player.voiceChannelId) > 0) return cancel(guildId);
    if (timers.has(guildId)) return;

    timers.set(
      guildId,
      setTimeout(() => {
        timers.delete(guildId);
        const current = music.getPlayer(guildId);
        if (!current?.voiceChannelId || humansIn(guildId, current.voiceChannelId) > 0) return;

        logger.info({ guild: guildId }, 'Canal de voz vacío: saliendo');
        const channel = current.textChannelId
          ? client.channels.cache.get(current.textChannelId)
          : undefined;
        if (channel?.isSendable()) {
          void channel
            .send({
              embeds: [brandEmbed().setDescription('👋 No queda nadie en el canal, me voy.')],
            })
            .catch(() => undefined);
        }
        void current.destroy('Canal vacío');
      }, ALONE_TIMEOUT_MS),
    );
  };
}
