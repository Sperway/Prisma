import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { isYouTubeUrl, parseUrl, truncate } from '../../music/format.js';
import { replyError, requireGuild } from '../../music/guards.js';
import { toRequester, trackLink } from '../../music/panel.js';
import { brandEmbed } from '../../ui/embeds.js';
import type { Command } from '../types.js';

const MAX_QUERY_LENGTH = 300;

export const play: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce un tema o playlist (SoundCloud, Spotify, Bandcamp, Twitch, Vimeo).')
    .addStringOption((option) =>
      option
        .setName('consulta')
        .setDescription('Nombre del tema o enlace')
        .setRequired(true)
        .setMaxLength(MAX_QUERY_LENGTH),
    ),

  async execute(raw, ctx) {
    const interaction = await requireGuild(raw);
    if (!interaction) return;

    const query = interaction.options.getString('consulta', true).trim();
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      await replyError(interaction, 'Entrá a un canal de voz primero.');
      return;
    }

    const url = parseUrl(query);
    if (url && isYouTubeUrl(url)) {
      await replyError(
        interaction,
        'YouTube no está disponible en Prisma. Probá con el nombre del tema o un enlace de SoundCloud, Spotify o Bandcamp.',
      );
      return;
    }

    const me = interaction.guild.members.me;
    const permissions = me ? voiceChannel.permissionsFor(me) : null;
    if (!permissions?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
      await replyError(
        interaction,
        `No tengo permiso para conectarme y hablar en ${voiceChannel}.`,
      );
      return;
    }

    if (!ctx.music.useable) {
      await replyError(
        interaction,
        'El servicio de música está iniciando. Probá en unos segundos.',
      );
      return;
    }

    const existing = ctx.music.getPlayer(interaction.guildId);
    if (existing?.queue.current && existing.voiceChannelId !== voiceChannel.id) {
      await replyError(interaction, `Ya estoy pasando música en <#${existing.voiceChannelId}>.`);
      return;
    }

    await interaction.deferReply();

    const player =
      existing ??
      ctx.music.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: ctx.config.MUSIC_DEFAULT_VOLUME,
      });
    if (!player.connected) await player.connect();

    const result = await player.search({ query }, toRequester(interaction.user));

    if (result.loadType === 'error' || result.loadType === 'empty' || result.tracks.length === 0) {
      if (!player.queue.current) await player.destroy('Búsqueda sin resultados');
      const reason =
        result.loadType === 'error'
          ? 'No pude cargar eso. Revisá el enlace o probá con otra búsqueda.'
          : `No encontré resultados para **${truncate(query, 100)}**.`;
      await replyError(interaction, reason);
      return;
    }

    const wasIdle = !player.playing && !player.queue.current;

    if (result.loadType === 'playlist') {
      await player.queue.add(result.tracks);
      await interaction.editReply({
        embeds: [
          brandEmbed().setDescription(
            `📃 Agregué **${result.tracks.length} temas** de **${truncate(result.playlist?.name ?? 'la playlist', 80)}**.`,
          ),
        ],
      });
    } else {
      const [track] = result.tracks;
      if (!track) return;
      await player.queue.add(track);
      const position = player.queue.tracks.length;
      await interaction.editReply({
        embeds: [
          brandEmbed().setDescription(
            wasIdle
              ? `▶️ Reproduciendo **${trackLink(track)}**`
              : `➕ Agregué **${trackLink(track)}** a la cola (posición ${position}).`,
          ),
        ],
      });
    }

    if (wasIdle) await player.play();
  },
};
