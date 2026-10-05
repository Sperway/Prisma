import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Track, UnresolvedTrack } from 'lavalink-client';
import { isYouTubeUrl, parseUrl, truncate } from '../../music/format.js';
import { replyError, requireGuild } from '../../music/guards.js';
import { toRequester, trackLink } from '../../music/panel.js';
import { parseSpotifyLink } from '../../music/spotify.js';
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

    const spotifyLink = url ? parseSpotifyLink(url) : null;
    if (spotifyLink && !ctx.spotify) {
      await replyError(interaction, 'Los enlaces de Spotify no están activados.');
      return;
    }
    if (spotifyLink?.type === 'playlist' || spotifyLink?.type === 'artist') {
      await replyError(
        interaction,
        'Spotify ya no permite que los bots lean playlists ni artistas. Probá con un tema o un álbum de Spotify, o con una playlist de SoundCloud.',
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

    const requester = toRequester(interaction.user);
    let tracks: (Track | UnresolvedTrack)[] = [];
    let collectionName: string | null = null;
    let failed = false;

    if (spotifyLink?.type === 'album' && ctx.spotify) {
      // LavaSrc no puede cargar álbumes con la API actual de Spotify: se leen acá y cada tema
      // se resuelve (Spotify → SoundCloud) recién cuando le toca sonar.
      try {
        const album = await ctx.spotify.getAlbum(spotifyLink.id);
        collectionName = `${album.name} — ${album.artist}`;
        tracks = album.tracks.map((track) =>
          ctx.music.utils.buildUnresolvedTrack(
            {
              title: track.title,
              author: track.author,
              duration: track.durationMs,
              uri: `https://open.spotify.com/track/${track.id}`,
              artworkUrl: album.artworkUrl,
              sourceName: 'spotify',
            },
            requester,
          ),
        );
      } catch (error) {
        ctx.logger.warn(
          { err: error, album: spotifyLink.id },
          'No se pudo cargar el álbum de Spotify',
        );
        failed = true;
      }
    } else {
      const result = await player.search({ query }, requester);
      failed = result.loadType === 'error';
      if (result.loadType === 'playlist') {
        tracks = result.tracks;
        collectionName = result.playlist?.name ?? 'la playlist';
      } else {
        tracks = result.tracks.slice(0, 1);
      }
    }

    if (tracks.length === 0) {
      if (!player.queue.current) await player.destroy('Búsqueda sin resultados');
      await replyError(
        interaction,
        failed
          ? 'No pude cargar eso. Revisá el enlace o probá con otra búsqueda.'
          : `No encontré resultados para **${truncate(query, 100)}**.`,
      );
      return;
    }

    const wasIdle = !player.playing && !player.queue.current;
    await player.queue.add(tracks);

    const [first] = tracks;
    const description =
      collectionName !== null
        ? `📃 Agregué **${tracks.length} temas** de **${truncate(collectionName, 80)}**.`
        : wasIdle
          ? `▶️ Reproduciendo **${first ? trackLink(first) : ''}**`
          : `➕ Agregué **${first ? trackLink(first) : ''}** a la cola (posición ${player.queue.tracks.length}).`;
    await interaction.editReply({ embeds: [brandEmbed().setDescription(description)] });

    if (wasIdle) await player.play();
  },
};
