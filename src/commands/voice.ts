import { SlashCommandBuilder } from 'discord.js';
import { replyError, requireGuild } from '../music/guards.js';
import { brandEmbed } from '../ui/embeds.js';
import { JoinError } from '../voice/manager.js';
import type { Command } from './types.js';

export const charlar: Command = {
  data: new SlashCommandBuilder()
    .setName('charlar')
    .setDescription('Prisma Voz entra a tu canal para charlar: llamala diciendo "Prisma".'),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;

    if (!ctx.voice) {
      await replyError(interaction, 'La voz de Prisma no está configurada.');
      return;
    }
    if (!ctx.voice.ready) {
      await replyError(interaction, 'Prisma Voz todavía no está en el servidor o está iniciando.');
      return;
    }
    const channel = interaction.member.voice.channel;
    if (!channel) {
      await replyError(interaction, 'Entrá a un canal de voz primero.');
      return;
    }

    await interaction.deferReply();
    try {
      const textChannel = interaction.channel?.isSendable() ? interaction.channel : null;
      await ctx.voice.join(interaction.guildId, channel.id, textChannel);
    } catch (error) {
      if (!(error instanceof JoinError)) throw error;
      await replyError(interaction, error.message);
      return;
    }

    await interaction.editReply({
      embeds: [
        brandEmbed()
          .setTitle('🎙️ Prisma está escuchando')
          .setDescription(
            [
              `Estoy en ${channel}. Para hablarme, decí **"Prisma"** y lo que necesites.`,
              'Después de responderte, podés seguir hablándome unos segundos sin repetir mi nombre.',
              '',
              `-# 🔒 Mientras estoy en el canal, lo que se dice se transcribe con Groq para detectar cuándo me hablan. No se guarda nada. Me voy sola tras ${ctx.config.VOICE_IDLE_MINUTES} minutos sin que me hablen, o con \`/callar\`.`,
            ].join('\n'),
          ),
      ],
    });
  },
};

export const callar: Command = {
  data: new SlashCommandBuilder()
    .setName('callar')
    .setDescription('Prisma Voz deja de escuchar y sale del canal.'),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;

    const left = (await ctx.voice?.leave(interaction.guildId)) ?? false;
    await interaction.reply({
      embeds: [
        brandEmbed().setDescription(
          left ? '🤐 Listo, dejé de escuchar.' : 'No estaba escuchando en ningún canal.',
        ),
      ],
    });
  },
};
