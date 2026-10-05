import { SlashCommandBuilder } from 'discord.js';
import { brandEmbed } from '../ui/embeds.js';
import type { Command } from './types.js';

export const ping: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Muestra la latencia de Prisma con Discord.'),

  async execute(interaction) {
    const response = await interaction.reply({
      embeds: [brandEmbed().setDescription('Midiendo…')],
      withResponse: true,
    });
    const sentAt = response.resource?.message?.createdTimestamp ?? Date.now();
    const roundTrip = sentAt - interaction.createdTimestamp;
    const gateway = interaction.client.ws.ping;

    await interaction.editReply({
      embeds: [
        brandEmbed()
          .setTitle('🏓 Pong')
          .addFields(
            { name: 'Ida y vuelta', value: `${roundTrip} ms`, inline: true },
            { name: 'Gateway', value: gateway >= 0 ? `${gateway} ms` : 'midiendo…', inline: true },
          ),
      ],
    });
  },
};
