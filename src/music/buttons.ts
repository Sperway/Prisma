import type { ButtonInteraction } from 'discord.js';
import type { Logger } from '../logger.js';
import { requireActivePlayer } from './guards.js';
import type { MusicManager } from './manager.js';
import { ButtonIds, controlsRow, nextRepeatMode, nowPlayingEmbed } from './panel.js';

/** Maneja los botones del panel de música. Devuelve false si el botón no es de música. */
export async function handleMusicButton(
  interaction: ButtonInteraction,
  music: MusicManager,
  logger: Logger,
): Promise<boolean> {
  if (!interaction.customId.startsWith('music:')) return false;
  if (!interaction.inCachedGuild()) return true;

  const player = await requireActivePlayer(interaction, music);
  if (!player) return true;

  logger.info({ button: interaction.customId, user: interaction.user.id }, 'Botón de música');

  switch (interaction.customId) {
    case ButtonIds.toggle:
      if (player.paused) await player.resume();
      else await player.pause();
      break;
    case ButtonIds.skip:
      // El panel se reemplaza solo cuando arranca el siguiente tema (o termina la cola).
      await interaction.deferUpdate();
      if (player.queue.tracks.length === 0) await player.stopPlaying(false, false);
      else await player.skip();
      return true;
    case ButtonIds.stop:
      await interaction.deferUpdate();
      await player.destroy(`Detenido por ${interaction.user.username}`);
      return true;
    case ButtonIds.loop:
      await player.setRepeatMode(nextRepeatMode(player.repeatMode));
      break;
    case ButtonIds.shuffle:
      await player.queue.shuffle();
      break;
    default:
      return true;
  }

  const track = player.queue.current;
  if (track) {
    await interaction.update({
      embeds: [nowPlayingEmbed(player, track)],
      components: [controlsRow(player)],
    });
  }
  return true;
}
