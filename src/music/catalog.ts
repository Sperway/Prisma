import type { Player, Track, UnresolvedTrack } from 'lavalink-client';
import type { MusicManager } from './manager.js';
import type { SoundCloudResolver } from './soundcloud.js';

/** Datos de un tema tal como se muestran (normalmente vienen de Spotify). */
export interface CatalogTrack {
  title: string;
  author?: string;
  durationMs?: number;
  artworkUrl?: string | null;
  /** Enlace que se muestra en el panel (p. ej. el de Spotify). */
  displayUri?: string;
}

export class NoPlayableVersionError extends Error {
  override name = 'NoPlayableVersionError';
}

/**
 * Crea un tema "sin resolver": se muestra con los datos del catálogo (título, artista y carátula
 * de Spotify) y recién cuando le toca sonar se busca una versión reproducible en SoundCloud.
 */
export function catalogTrack(
  music: MusicManager,
  soundcloud: SoundCloudResolver,
  meta: CatalogTrack,
  requester: unknown,
): UnresolvedTrack {
  const track = music.utils.buildUnresolvedTrack(
    {
      title: meta.title,
      ...(meta.author && { author: meta.author }),
      ...(meta.durationMs && { duration: meta.durationMs }),
      ...(meta.artworkUrl && { artworkUrl: meta.artworkUrl }),
      ...(meta.displayUri && { uri: meta.displayUri }),
    },
    requester,
  );

  const resolveFromUri = track.resolve;
  track.resolve = async function (this: UnresolvedTrack, player: Player) {
    const url = await soundcloud.findPlayable({
      title: meta.title,
      ...(meta.author && { author: meta.author }),
      ...(meta.durationMs && { durationMs: meta.durationMs }),
    });
    if (!url)
      throw new NoPlayableVersionError(`No hay una versión reproducible de "${meta.title}"`);

    // La librería resuelve buscando info.uri: se le pasa el enlace de SoundCloud elegido y,
    // ya resuelto, se vuelve a mostrar el enlace original.
    this.info.uri = url;
    await resolveFromUri.call(this, player);
    if (meta.displayUri) (this as unknown as Track).info.uri = meta.displayUri;
  };

  return track;
}
