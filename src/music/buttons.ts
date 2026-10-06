import { MessageFlags, type ButtonInteraction } from 'discord.js';
import type { Player } from 'lavalink-client';
import type { Logger } from '../logger.js';
import { replyError, requireActivePlayer } from './guards.js';
import type { MusicManager } from './manager.js';
import {
  ButtonIds,
  MAX_VOLUME,
  nextRepeatMode,
  nowPlayingPanel,
  queueEmbed,
  VOLUME_STEP,
} from './panel.js';

/** Como en Spotify: pasados estos segundos, ⏮️ reinicia el tema en lugar de ir al anterior. */
const RESTART_THRESHOLD_MS = 5_000;

/**
 * ⏮️: reinicia el tema si ya avanzó; si no, vuelve al anterior.
 * Devuelve false si no hay tema anterior.
 */
async function previous(player: Player): Promise<boolean> {
  if (player.position > RESTART_THRESHOLD_MS) {
    await player.seek(0);
    return true;
  }
  const track = await player.queue.shiftPrevious();
  if (!track) return false;
  await player.queue.add(track, 0);
  await player.skip();
  return true;
}

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
    // Acciones que cambian de tema: el panel se reemplaza solo cuando arranca el siguiente.
    case ButtonIds.skip:
      await interaction.deferUpdate();
      if (player.queue.tracks.length === 0) await player.stopPlaying(false, false);
      else await player.skip();
      return true;
    case ButtonIds.stop:
      await interaction.deferUpdate();
      await player.destroy(`Detenido por ${interaction.user.username}`);
      return true;
    case ButtonIds.previous:
      if (!(await previous(player))) {
        await replyError(interaction, 'No hay un tema anterior.');
        return true;
      }
      if (interaction.replied || interaction.deferred) return true;
      break;

    case ButtonIds.queue:
      await interaction.reply({ embeds: [queueEmbed(player)], flags: MessageFlags.Ephemeral });
      return true;

    // Acciones que solo cambian el estado: se actualiza el panel en el momento.
    case ButtonIds.toggle:
      if (player.paused) await player.resume();
      else await player.pause();
      break;
    case ButtonIds.volumeDown:
      await player.setVolume(Math.max(VOLUME_STEP, player.volume - VOLUME_STEP));
      break;
    case ButtonIds.volumeUp:
      await player.setVolume(Math.min(MAX_VOLUME, player.volume + VOLUME_STEP));
      break;
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
  if (track) await interaction.update(nowPlayingPanel(player, track));
  else await interaction.deferUpdate();
  return true;
}
