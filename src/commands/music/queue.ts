import { SlashCommandBuilder } from 'discord.js';
import { formatDuration } from '../../music/format.js';
import { replyError, requireActivePlayer, requireGuild } from '../../music/guards.js';
import { trackLink } from '../../music/panel.js';
import { brandEmbed } from '../../ui/embeds.js';
import type { Command } from '../types.js';

const PAGE_SIZE = 10;

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

    const tracks = player.queue.tracks;
    const pages = Math.max(1, Math.ceil(tracks.length / PAGE_SIZE));
    const page = Math.min(interaction.options.getInteger('pagina') ?? 1, pages);
    const start = (page - 1) * PAGE_SIZE;

    const lines = tracks
      .slice(start, start + PAGE_SIZE)
      .map(
        (track, i) =>
          `\`${start + i + 1}.\` ${trackLink(track)} · ${formatDuration(track.info.duration ?? 0)}`,
      );

    await interaction.reply({
      embeds: [
        brandEmbed()
          .setTitle('📜 Cola')
          .setDescription(
            [
              `**Sonando:** ${trackLink(current)}`,
              '',
              ...(lines.length ? lines : ['_Nada más en cola._']),
            ].join('\n'),
          )
          .setFooter({
            text: `Página ${page}/${pages} · ${tracks.length} temas · ${formatDuration(player.queue.utils.totalDuration())} en total`,
          }),
      ],
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
