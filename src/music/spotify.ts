/**
 * Cliente mínimo de la Web API de Spotify (credenciales de aplicación).
 *
 * Existe porque, desde las restricciones de febrero de 2026, LavaSrc no puede cargar álbumes:
 * usa el endpoint de búsqueda en lote (GET /tracks?ids=), que Spotify eliminó. Acá leemos el
 * álbum con los endpoints que siguen disponibles y cada tema se resuelve recién al sonar.
 * Ver docs/adr/0005-fuentes-de-musica.md.
 */

const ACCOUNTS_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';
/** Tope de temas por álbum (los álbumes más largos se cortan acá). */
export const MAX_ALBUM_TRACKS = 200;

const SPOTIFY_HOST = /^open\.spotify\.com$/i;
const PATH = /^\/(?:intl-[a-z-]+\/)?(album|playlist|track|artist)\/([A-Za-z0-9]{22})/i;

export type SpotifyLinkType = 'album' | 'playlist' | 'track' | 'artist';

export function parseSpotifyLink(url: URL): { type: SpotifyLinkType; id: string } | null {
  if (!SPOTIFY_HOST.test(url.hostname)) return null;
  const match = PATH.exec(url.pathname);
  if (!match?.[1] || !match[2]) return null;
  return { type: match[1].toLowerCase() as SpotifyLinkType, id: match[2] };
}

export interface SpotifyAlbumTrack {
  id: string;
  title: string;
  author: string;
  durationMs: number;
}

export interface SpotifyAlbum {
  name: string;
  artist: string;
  artworkUrl: string | null;
  tracks: SpotifyAlbumTrack[];
}

interface TrackPage {
  items: { id: string | null; name: string; duration_ms: number; artists: { name: string }[] }[];
  next: string | null;
}

export class SpotifyError extends Error {
  override name = 'SpotifyError';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class SpotifyClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async getToken(): Promise<string> {
    // Margen de 60 s para no usar un token a punto de vencer.
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;

    const response = await this.fetchFn(ACCOUNTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new SpotifyError('No se pudo autenticar con Spotify', response.status);
    }
    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async get<T>(url: string): Promise<T> {
    const response = await this.fetchFn(url, {
      headers: { Authorization: `Bearer ${await this.getToken()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new SpotifyError(`Spotify respondió ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  }

  async getAlbum(id: string): Promise<SpotifyAlbum> {
    const album = await this.get<{
      name: string;
      artists: { name: string }[];
      images: { url: string }[];
      tracks: TrackPage;
    }>(`${API_URL}/albums/${encodeURIComponent(id)}`);

    const tracks: SpotifyAlbumTrack[] = [];
    let page: TrackPage | null = album.tracks;
    while (page) {
      for (const item of page.items) {
        if (!item.id) continue; // temas no disponibles en el catálogo
        tracks.push({
          id: item.id,
          title: item.name,
          author: item.artists.map((artist) => artist.name).join(', '),
          durationMs: item.duration_ms,
        });
      }
      page =
        page.next && tracks.length < MAX_ALBUM_TRACKS ? await this.get<TrackPage>(page.next) : null;
    }

    return {
      name: album.name,
      artist: album.artists.map((artist) => artist.name).join(', '),
      artworkUrl: album.images[0]?.url ?? null,
      tracks: tracks.slice(0, MAX_ALBUM_TRACKS),
    };
  }
}
