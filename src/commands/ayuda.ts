import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { brandEmbed } from '../ui/embeds.js';
import type { Command } from './types.js';

export const ayuda: Command = {
  data: new SlashCommandBuilder().setName('ayuda').setDescription('Lista los comandos de Prisma.'),

  async execute(interaction, ctx) {
    const lines = [...ctx.commands.values()]
      .map((command) => command.data.toJSON())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((json) => `**/${json.name}** — ${json.description}`);

    await interaction.reply({
      embeds: [brandEmbed().setTitle('📖 Comandos').setDescription(lines.join('\n'))],
      flags: MessageFlags.Ephemeral,
    });
  },
};
