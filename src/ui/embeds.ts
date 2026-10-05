import { EmbedBuilder } from 'discord.js';

export const Colors = {
  brand: 0x7c5cff,
  success: 0x3ecf8e,
  warning: 0xf5a524,
  error: 0xef4444,
} as const;

/** Embed base con la identidad visual de Prisma. */
export function brandEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.brand);
}

export function errorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.error).setDescription(`❌ ${description}`);
}
