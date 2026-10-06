import { SlashCommandBuilder } from 'discord.js';
import { replyError, requireActivePlayer, requireGuild } from '../../music/guards.js';
import { queueEmbed, trackLink } from '../../music/panel.js';
import { brandEmbed } from '../../ui/embeds.js';
import type { Command } from '../types.js';

export const cola: Command = {
  data: new SlashCommandBuilder()
    .setName('cola')
    .setDescription('Muestra los próximos temas.')
    .addIntegerOption((option) =>
      option.setName('pagina').setDescription('Página de la cola').setMinValue(1),
    ),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = ctx.music.getPlayer(interaction.guildId);
    const current = player?.queue.current;
    if (!player || !current) {
      await interaction.reply({ embeds: [brandEmbed().setDescription('La cola está vacía.')] });
      return;
    }

    await interaction.reply({
      embeds: [queueEmbed(player, interaction.options.getInteger('pagina') ?? 1)],
    });
  },
};

export const quitar: Command = {
  data: new SlashCommandBuilder()
    .setName('quitar')
    .setDescription('Quita un tema de la cola.')
    .addIntegerOption((option) =>
      option
        .setName('posicion')
        .setDescription('Posición en la cola (ver /cola)')
        .setRequired(true)
        .setMinValue(1),
    ),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = await requireActivePlayer(interaction, ctx.music);
    if (!player) return;

    const position = interaction.options.getInteger('posicion', true);
    const track = player.queue.tracks[position - 1];
    if (!track) {
      await replyError(interaction, `No hay ningún tema en la posición ${position}.`);
      return;
    }
    await player.queue.splice(position - 1, 1);
    await interaction.reply({
      embeds: [brandEmbed().setDescription(`🗑️ Quité **${trackLink(track)}** de la cola.`)],
    });
  },
};
