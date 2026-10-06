import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Track, UnresolvedTrack } from 'lavalink-client';
import { catalogTrack, NoPlayableVersionError, type CatalogTrack } from '../../music/catalog.js';
import { isYouTubeUrl, parseUrl, truncate } from '../../music/format.js';
import { replyError, requireGuild } from '../../music/guards.js';
import { toRequester, trackLink } from '../../music/panel.js';
import { parseSpotifyLink, spotifyTrackUrl } from '../../music/spotify.js';
import { brandEmbed } from '../../ui/embeds.js';
import type { Command } from '../types.js';

const MAX_QUERY_LENGTH = 300;

export const play: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce un tema o álbum (Spotify, SoundCloud, Bandcamp, Twitch, Vimeo).')
    .addStringOption((option) =>
      option
        .setName('consulta')
        .setDescription('Escribí para ver resultados, o pegá un enlace')
        .setRequired(true)
        .setMaxLength(MAX_QUERY_LENGTH)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction, ctx) {
    await interaction.respond(await ctx.suggest(interaction.options.getFocused()));
  },

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

    const fromCatalog = (meta: CatalogTrack) =>
      catalogTrack(ctx.music, ctx.soundcloud, meta, requester);

    try {
      if (spotifyLink?.type === 'album' && ctx.spotify) {
        const album = await ctx.spotify.getAlbum(spotifyLink.id);
        collectionName = `${album.name} — ${album.artist}`;
        tracks = album.tracks.map((track) =>
          fromCatalog({ ...track, displayUri: spotifyTrackUrl(track.id) }),
        );
      } else if (spotifyLink?.type === 'track' && ctx.spotify) {
        const track = await ctx.spotify.getTrack(spotifyLink.id);
        tracks = [fromCatalog({ ...track, displayUri: spotifyTrackUrl(track.id) })];
      } else if (url) {
        // Otros enlaces (SoundCloud, Bandcamp, Twitch, Vimeo): los carga Lavalink directamente.
        const result = await player.search({ query }, requester);
        failed = result.loadType === 'error';
        if (result.loadType === 'playlist') {
          tracks = result.tracks;
          collectionName = result.playlist?.name ?? 'la playlist';
        } else {
          tracks = result.tracks.slice(0, 1);
        }
      } else {
        // Texto libre: el mejor resultado del catálogo (Spotify, o SoundCloud como respaldo).
        const [top] = await ctx.search(query);
        tracks = [
          fromCatalog(
            top
              ? {
                  title: top.title,
                  author: top.author,
                  durationMs: top.durationMs,
                  artworkUrl: top.artworkUrl,
                  ...(top.url && { displayUri: top.url }),
                }
              : { title: query },
          ),
        ];
      }
    } catch (error) {
      ctx.logger.warn({ err: error, query }, 'No se pudo cargar la consulta');
      failed = true;
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
    const [first] = tracks;

    // Si no hay nada sonando, el primer tema se resuelve ya: si no se puede reproducir, se
    // avisa en la respuesta (y no con un error en el canal después).
    if (wasIdle && first && ctx.music.utils.isUnresolvedTrack(first)) {
      try {
        await first.resolve(player);
      } catch (error) {
        const known = error instanceof NoPlayableVersionError;
        ctx.logger.warn({ err: error, query }, 'No se pudo resolver el primer tema');
        if (tracks.length === 1) {
          if (!player.queue.current) await player.destroy('Tema no reproducible');
          await replyError(
            interaction,
            known
              ? `No encontré una versión de **${truncate(first.info.title, 80)}** que se pueda reproducir. Probá con otra versión o con otro tema.`
              : 'No pude cargar ese tema. Probá de nuevo.',
          );
          return;
        }
        tracks.shift(); // de un álbum: se saltea el primero y sigue el resto
      }
    }

    await player.queue.add(tracks);
    const description =
      collectionName !== null
        ? `📃 Agregué **${tracks.length} temas** de **${truncate(collectionName, 80)}**.`
        : wasIdle
          ? `▶️ Reproduciendo **${first ? trackLink(first) : ''}**`
          : `➕ Agregué **${first ? trackLink(first) : ''}** a la cola (posición ${player.queue.tracks.length}).`;
    await interaction.editReply({ embeds: [brandEmbed().setDescription(description)] });

    if (wasIdle) {
      try {
        await player.play();
      } catch (error) {
        // Si ningún tema de la cola se pudo resolver, la librería no tiene qué reproducir.
        ctx.logger.warn({ err: error, query }, 'No se pudo iniciar la reproducción');
        if (!player.queue.current) await player.destroy('Nada reproducible');
      }
    }
  },
};
