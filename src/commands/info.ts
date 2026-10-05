import { SlashCommandBuilder, time, TimestampStyles, version as djsVersion } from 'discord.js';
import { brandEmbed } from '../ui/embeds.js';
import { VERSION } from '../version.js';
import type { Command } from './types.js';

export const info: Command = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Estado y datos técnicos de Prisma.'),

  async execute(interaction, ctx) {
    const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    await interaction.reply({
      embeds: [
        brandEmbed()
          .setTitle('🔷 Prisma')
          .setThumbnail(interaction.client.user.displayAvatarURL())
          .addFields(
            { name: 'Versión', value: `v${VERSION}`, inline: true },
            {
              name: 'En línea desde',
              value: time(ctx.startedAt, TimestampStyles.RelativeTime),
              inline: true,
            },
            { name: 'Memoria', value: `${memoryMb} MB`, inline: true },
            { name: 'Node.js', value: process.version, inline: true },
            { name: 'discord.js', value: `v${djsVersion}`, inline: true },
          ),
      ],
    });
  },
};
