import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/logger.js';
import type { SoundCloudResolver } from '../src/music/soundcloud.js';
import type { SpotifyClient } from '../src/music/spotify.js';
import { createSearch, toChoice, type SearchHit } from '../src/music/suggestions.js';

const logger = createLogger({ LOG_LEVEL: 'fatal', NODE_ENV: 'test' });

const hit = (overrides: Partial<SearchHit> = {}): SearchHit => ({
  title: 'Mariposa Tecknicolor',
  author: 'Fito Páez',
  durationMs: 245_000,
  isStream: false,
  artworkUrl: null,
  url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  ...overrides,
});

describe('toChoice', () => {
  it('muestra título, autor y duración, y envía el enlace de Spotify', () => {
    expect(toChoice(hit())).toEqual({
      name: 'Mariposa Tecknicolor — Fito Páez (4:05)',
      value: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    });
  });

  it('respeta el límite de 100 caracteres de Discord', () => {
    const choice = toChoice(
      hit({ title: 'a'.repeat(150), url: `https://x.com/${'b'.repeat(120)}` }),
    );
    expect(choice.name.length).toBeLessThanOrEqual(100);
    expect(choice.name.endsWith('(4:05)')).toBe(true);
    expect(choice.value.length).toBeLessThanOrEqual(100);
    expect(choice.value.startsWith('http')).toBe(false); // enlace largo: se envía el texto
  });

  it('marca las transmisiones en vivo', () => {
    expect(toChoice(hit({ isStream: true })).name).toContain('(en vivo)');
  });

  it('las opciones de SoundCloud envían texto para que /play busque una versión reproducible', () => {
    expect(toChoice(hit({ url: null })).value).toBe('Mariposa Tecknicolor Fito Páez');
  });
});

describe('createSearch', () => {
  const soundcloud = {
    search: vi.fn(async () => [
      {
        title: 'Tema en SoundCloud',
        duration: 180_000,
        permalink_url: 'https://soundcloud.com/a/t',
        user: { username: 'Alguien' },
      },
    ]),
  } as unknown as SoundCloudResolver;

  const spotifyWith = (impl: () => Promise<unknown>) =>
    ({ searchTracks: vi.fn(impl) }) as unknown as SpotifyClient;

  it('usa el catálogo de Spotify cuando hay resultados', async () => {
    const spotify = spotifyWith(async () => [
      {
        id: '4uLU6hMCjMI75M1A2tKUQC',
        title: 'Mariposa Tecknicolor',
        author: 'Fito Páez',
        durationMs: 245_000,
        artworkUrl: 'https://img/a.jpg',
      },
    ]);
    const [first] = await createSearch(soundcloud, spotify, logger)('fito');
    expect(first).toMatchObject({
      url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
      artworkUrl: 'https://img/a.jpg',
    });
  });

  it('cae a SoundCloud si Spotify falla, no encuentra nada o no está configurado', async () => {
    const failing = spotifyWith(async () => {
      throw new Error('429');
    });
    const empty = spotifyWith(async () => []);
    for (const spotify of [failing, empty, null]) {
      const [first] = await createSearch(soundcloud, spotify, logger)('fito');
      expect(first).toMatchObject({ title: 'Tema en SoundCloud', author: 'Alguien', url: null });
    }
  });
});
