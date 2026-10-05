import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
  type User,
} from 'discord.js';
import type { Player, RepeatMode, Track, UnresolvedTrack } from 'lavalink-client';
import { brandEmbed } from '../ui/embeds.js';
import { formatDuration, progressBar, truncate } from './format.js';

declare module 'lavalink-client' {
  /** Quién pidió cada tema (se guarda con toRequester al buscar). */
  interface TrackRequester {
    id: string;
    username: string;
  }
}

export function toRequester(user: User): { id: string; username: string } {
  return { id: user.id, username: user.username };
}

export const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Desactivado',
  track: 'Tema actual',
  queue: 'Toda la cola',
};

export function trackLink(track: Track | UnresolvedTrack): string {
  const title = truncate(track.info.title.replace(/[[\]]/g, ''), 80);
  return track.info.uri ? `[${title}](${track.info.uri})` : title;
}

function durationLabel(track: Track | UnresolvedTrack): string {
  return track.info.isStream ? '🔴 En vivo' : formatDuration(track.info.duration ?? 0);
}

/** Embed de "sonando ahora". Con showProgress agrega la barra de progreso. */
export function nowPlayingEmbed(player: Player, track: Track, showProgress = false): EmbedBuilder {
  const embed = brandEmbed()
    .setAuthor({ name: '🎶 Sonando ahora' })
    .setDescription(`**${trackLink(track)}**\n${truncate(track.info.author, 80)}`)
    .addFields(
      { name: 'Duración', value: durationLabel(track), inline: true },
      {
        name: 'Pedido por',
        value: track.requester ? `<@${track.requester.id}>` : '—',
        inline: true,
      },
      { name: 'En cola', value: String(player.queue.tracks.length), inline: true },
    );

  if (track.info.artworkUrl) embed.setThumbnail(track.info.artworkUrl);
  if (showProgress && !track.info.isStream) {
    embed.addFields({
      name: '​',
      value: `${formatDuration(player.position)} ${progressBar(player.position, track.info.duration)} ${formatDuration(track.info.duration)}`,
    });
  }

  const extras = [`Volumen ${player.volume}%`, `Repetir: ${REPEAT_LABELS[player.repeatMode]}`];
  if (player.paused) extras.unshift('⏸ En pausa');
  return embed.setFooter({ text: `${extras.join(' · ')} · Fuente: ${track.info.sourceName}` });
}

export const ButtonIds = {
  toggle: 'music:toggle',
  skip: 'music:skip',
  stop: 'music:stop',
  loop: 'music:loop',
  shuffle: 'music:shuffle',
} as const;

export function controlsRow(player: Player): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ButtonIds.toggle)
      .setEmoji(player.paused ? '▶️' : '⏸️')
      .setStyle(player.paused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(ButtonIds.skip).setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(ButtonIds.stop).setEmoji('⏹️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(ButtonIds.loop)
      .setEmoji(player.repeatMode === 'track' ? '🔂' : '🔁')
      .setStyle(player.repeatMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(ButtonIds.shuffle)
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Orden de rotación del botón de repetir. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'queue' : mode === 'queue' ? 'track' : 'off';
}
