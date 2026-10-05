import { SlashCommandBuilder } from 'discord.js';
import { requireActivePlayer, requireGuild } from '../../music/guards.js';
import { refreshPanel } from '../../music/manager.js';
import { nowPlayingEmbed, REPEAT_LABELS, trackLink } from '../../music/panel.js';
import { brandEmbed } from '../../ui/embeds.js';
import type { Command } from '../types.js';

export const pausa: Command = {
  data: new SlashCommandBuilder().setName('pausa').setDescription('Pausa o reanuda la música.'),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = await requireActivePlayer(interaction, ctx.music);
    if (!player) return;

    if (player.paused) await player.resume();
    else await player.pause();
    await refreshPanel(interaction.client, player);
    await interaction.reply({
      embeds: [brandEmbed().setDescription(player.paused ? '⏸️ En pausa.' : '▶️ Reanudado.')],
    });
  },
};

export const saltar: Command = {
  data: new SlashCommandBuilder().setName('saltar').setDescription('Salta al siguiente tema.'),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = await requireActivePlayer(interaction, ctx.music);
    if (!player?.queue.current) return;

    const skipped = player.queue.current;
    // Sin temas en cola, skip() fallaría: se detiene el actual y se dispara el fin de cola.
    if (player.queue.tracks.length === 0) await player.stopPlaying(false, false);
    else await player.skip();
    await interaction.reply({
      embeds: [brandEmbed().setDescription(`⏭️ Salté **${trackLink(skipped)}**.`)],
    });
  },
};

export const detener: Command = {
  data: new SlashCommandBuilder()
    .setName('detener')
    .setDescription('Detiene la música, vacía la cola y saca a Prisma del canal.'),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = await requireActivePlayer(interaction, ctx.music);
    if (!player) return;

    await player.destroy(`Detenido por ${interaction.user.username}`);
    await interaction.reply({ embeds: [brandEmbed().setDescription('⏹️ Música detenida.')] });
  },
};

export const sonando: Command = {
  data: new SlashCommandBuilder().setName('sonando').setDescription('Muestra el tema actual.'),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = ctx.music.getPlayer(interaction.guildId);
    const track = player?.queue.current;
    if (!player || !track) {
      await interaction.reply({ embeds: [brandEmbed().setDescription('No hay nada sonando.')] });
      return;
    }
    await interaction.reply({ embeds: [nowPlayingEmbed(player, track, true)] });
  },
};

export const volumen: Command = {
  data: new SlashCommandBuilder()
    .setName('volumen')
    .setDescription('Cambia el volumen de la música.')
    .addIntegerOption((option) =>
      option
        .setName('nivel')
        .setDescription('De 1 a 150 (100 es el volumen original)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(150),
    ),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = await requireActivePlayer(interaction, ctx.music);
    if (!player) return;

    const level = interaction.options.getInteger('nivel', true);
    await player.setVolume(level);
    await refreshPanel(interaction.client, player);
    await interaction.reply({ embeds: [brandEmbed().setDescription(`🔊 Volumen: **${level}%**`)] });
  },
};

export const repetir: Command = {
  data: new SlashCommandBuilder()
    .setName('repetir')
    .setDescription('Cambia el modo de repetición.')
    .addStringOption((option) =>
      option
        .setName('modo')
        .setDescription('Qué repetir')
        .setRequired(true)
        .addChoices(
          { name: 'Desactivado', value: 'off' },
          { name: 'Tema actual', value: 'track' },
          { name: 'Toda la cola', value: 'queue' },
        ),
    ),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = await requireActivePlayer(interaction, ctx.music);
    if (!player) return;

    const mode = interaction.options.getString('modo', true) as keyof typeof REPEAT_LABELS;
    await player.setRepeatMode(mode);
    await refreshPanel(interaction.client, player);
    await interaction.reply({
      embeds: [brandEmbed().setDescription(`🔁 Repetir: **${REPEAT_LABELS[mode]}**`)],
    });
  },
};

export const mezclar: Command = {
  data: new SlashCommandBuilder().setName('mezclar').setDescription('Mezcla la cola al azar.'),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;
    const player = await requireActivePlayer(interaction, ctx.music);
    if (!player) return;

    if (player.queue.tracks.length < 2) {
      await interaction.reply({
        embeds: [brandEmbed().setDescription('Hacen falta al menos 2 temas en cola para mezclar.')],
      });
      return;
    }
    await player.queue.shuffle();
    await interaction.reply({
      embeds: [brandEmbed().setDescription(`🔀 Mezclé ${player.queue.tracks.length} temas.`)],
    });
  },
};
