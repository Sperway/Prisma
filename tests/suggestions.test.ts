import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/logger.js';
import type { MusicManager } from '../src/music/manager.js';
import type { SpotifyClient } from '../src/music/spotify.js';
import { createSearch, toChoice, type SearchHit } from '../src/music/suggestions.js';

const logger = createLogger({ LOG_LEVEL: 'fatal', NODE_ENV: 'test' });

const hit = (overrides: Partial<SearchHit> = {}): SearchHit => ({
  title: 'Mariposa Tecknicolor',
  author: 'Fito Páez',
  durationMs: 245_000,
  isStream: false,
  url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  ...overrides,
});

describe('toChoice', () => {
  it('muestra título, autor y duración, y envía el enlace', () => {
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
});

describe('createSearch', () => {
  const soundcloudTrack = {
    info: {
      title: 'Tema en SoundCloud',
      author: 'Alguien',
      duration: 180_000,
      isStream: false,
      uri: 'https://soundcloud.com/alguien/tema',
    },
  };
  const music = {
    nodeManager: {
      leastUsedNodes: () => [{ search: vi.fn(async () => ({ tracks: [soundcloudTrack] })) }],
    },
  } as unknown as MusicManager;

  const spotifyWith = (impl: () => Promise<unknown>) =>
    ({ searchTracks: vi.fn(impl) }) as unknown as SpotifyClient;

  it('usa el catálogo de Spotify cuando hay resultados', async () => {
    const spotify = spotifyWith(async () => [
      {
        id: '4uLU6hMCjMI75M1A2tKUQC',
        title: 'Mariposa Tecknicolor',
        author: 'Fito Páez',
        durationMs: 245_000,
      },
    ]);
    const [first] = await createSearch(music, spotify, logger)('fito');
    expect(first?.url).toBe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  });

  it('cae a SoundCloud si Spotify falla, no encuentra nada o no está configurado', async () => {
    const failing = spotifyWith(async () => {
      throw new Error('429');
    });
    const empty = spotifyWith(async () => []);
    for (const spotify of [failing, empty, null]) {
      const [first] = await createSearch(music, spotify, logger)('fito');
      expect(first?.url).toBe('https://soundcloud.com/alguien/tema');
    }
  });
});
