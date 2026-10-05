import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { Player } from 'lavalink-client';
import { errorEmbed } from '../ui/embeds.js';
import type { MusicManager } from './manager.js';

export type MusicInteraction = ChatInputCommandInteraction<'cached'> | ButtonInteraction<'cached'>;

export async function replyError(
  interaction: MusicInteraction | ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  const payload = { embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral } as const;
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

/**
 * Devuelve el reproductor si hay algo sonando y el usuario está en el mismo canal de voz.
 * Si no, responde con un error y devuelve null.
 */
export async function requireActivePlayer(
  interaction: MusicInteraction,
  music: MusicManager,
): Promise<Player | null> {
  const player = music.getPlayer(interaction.guildId);
  if (!player?.queue.current) {
    await replyError(interaction, 'No hay nada sonando.');
    return null;
  }
  if (interaction.member.voice.channelId !== player.voiceChannelId) {
    await replyError(interaction, `Tenés que estar en <#${player.voiceChannelId}> para hacer eso.`);
    return null;
  }
  return player;
}

/** Para comandos que solo tienen sentido en un servidor (con caché). */
export async function requireGuild(
  interaction: ChatInputCommandInteraction,
): Promise<ChatInputCommandInteraction<'cached'> | null> {
  if (interaction.inCachedGuild()) return interaction;
  await replyError(interaction, 'Este comando solo funciona en el servidor.');
  return null;
}
