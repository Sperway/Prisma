import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { parseSpotifyLink, SpotifyClient, SpotifyError } from '../src/music/spotify.js';

const ID = '2noRn2Aes5aoNVsU6iWThc';

describe('parseSpotifyLink', () => {
  it.each([
    [`https://open.spotify.com/album/${ID}`, 'album'],
    [`https://open.spotify.com/intl-es/album/${ID}?si=abc`, 'album'],
    [`https://open.spotify.com/track/${ID}`, 'track'],
    [`https://open.spotify.com/playlist/${ID}`, 'playlist'],
    [`https://open.spotify.com/artist/${ID}`, 'artist'],
  ])('%s → %s', (link, type) => {
    expect(parseSpotifyLink(new URL(link))).toEqual({ type, id: ID });
  });

  it('ignora otros dominios y rutas', () => {
    expect(parseSpotifyLink(new URL(`https://soundcloud.com/album/${ID}`))).toBeNull();
    expect(parseSpotifyLink(new URL('https://open.spotify.com/user/alguien'))).toBeNull();
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const track = (id: string | null, name: string) => ({
  id,
  name,
  duration_ms: 200_000,
  artists: [{ name: 'Daft Punk' }],
});

describe('SpotifyClient.getAlbum', () => {
  it('lee el álbum, pagina los temas y reutiliza el token', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('accounts.spotify.com')) {
        return json({ access_token: 'tok', expires_in: 3600 });
      }
      if (url.endsWith(`/albums/${ID}`)) {
        return json({
          name: 'Discovery',
          artists: [{ name: 'Daft Punk' }],
          images: [{ url: 'https://img/cover.jpg' }],
          tracks: {
            items: [track('a', 'One More Time'), track(null, 'No disponible')],
            next: 'https://api.spotify.com/v1/albums/x/tracks?offset=2',
          },
        });
      }
      return json({ items: [track('b', 'Aerodynamic')], next: null });
    });

    const client = new SpotifyClient('id', 'secret', 'AR', fetchFn);
    const album = await client.getAlbum(ID);

    expect(album).toMatchObject({
      name: 'Discovery',
      artist: 'Daft Punk',
      artworkUrl: 'https://img/cover.jpg',
    });
    expect(album.tracks.map((t) => t.title)).toEqual(['One More Time', 'Aerodynamic']);

    await client.getAlbum(ID);
    const tokenCalls = fetchFn.mock.calls.filter(([url]) => String(url).includes('accounts'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('informa errores de la API con su código', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('accounts')
        ? json({ access_token: 'tok', expires_in: 3600 })
        : json({ error: { status: 403 } }, 403),
    );
    const error = await new SpotifyClient('id', 'secret', 'AR', fetchFn)
      .getAlbum(ID)
      .catch((e) => e);
    expect(error).toBeInstanceOf(SpotifyError);
    expect(error.status).toBe(403);
  });
});

describe('SpotifyClient.searchTracks', () => {
  it('busca temas en el mercado configurado y descarta los no disponibles', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      String(input).includes('accounts')
        ? json({ access_token: 'tok', expires_in: 3600 })
        : json({ tracks: { items: [track('a', 'Mariposa Tecknicolor'), track(null, 'X')] } }),
    );
    const results = await new SpotifyClient('id', 'secret', 'AR', fetchFn).searchTracks(
      'fito paez',
      50,
    );

    expect(results).toEqual([
      {
        id: 'a',
        title: 'Mariposa Tecknicolor',
        author: 'Daft Punk',
        durationMs: 200_000,
        artworkUrl: null,
      },
    ]);
    const searchUrl = new URL(String(fetchFn.mock.calls[1]?.[0]));
    expect(searchUrl.searchParams.get('q')).toBe('fito paez');
    expect(searchUrl.searchParams.get('market')).toBe('AR');
    expect(searchUrl.searchParams.get('limit')).toBe('10'); // tope de Spotify
  });
});

describe('configuración de Spotify', () => {
  const base = {
    DISCORD_TOKEN: 'token',
    DISCORD_GUILD_ID: '123456789012345678',
    LAVALINK_PASSWORD: 'una-clave-larga-de-prueba',
  };

  it('está desactivado por defecto', () => {
    expect(loadConfig(base).SPOTIFY_ENABLED).toBe(false);
  });

  it('exige credenciales si está activado', () => {
    expect(() => loadConfig({ ...base, SPOTIFY_ENABLED: 'true' })).toThrow(/SPOTIFY_CLIENT_ID/);
    expect(
      loadConfig({
        ...base,
        SPOTIFY_ENABLED: 'true',
        SPOTIFY_CLIENT_ID: 'x',
        SPOTIFY_CLIENT_SECRET: 'y',
      }).SPOTIFY_ENABLED,
    ).toBe(true);
  });
});
