import type { ApplicationCommandOptionChoiceData } from 'discord.js';
import type { Logger } from '../logger.js';
import { formatDuration, parseUrl, truncate } from './format.js';
import type { MusicManager } from './manager.js';
import { spotifyTrackUrl, type SpotifyClient } from './spotify.js';

/** Discord limita las opciones de autocompletado a 25, con nombre y valor de 100 caracteres. */
const MAX_CHOICES = 10;
const MAX_LENGTH = 100;
const MIN_QUERY_LENGTH = 2;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 200;
/** Discord descarta respuestas de autocompletado que tardan más de 3 s. */
const SEARCH_TIMEOUT_MS = 2_500;

/** Resultado de búsqueda, independiente de la fuente (Spotify o SoundCloud). */
export interface SearchHit {
  title: string;
  author: string;
  durationMs: number;
  isStream: boolean;
  /** Enlace que /play sabe reproducir. */
  url: string;
}

/** Convierte un resultado en una opción: se muestra "Título — Autor (3:45)" y se envía el enlace. */
export function toChoice(hit: SearchHit): ApplicationCommandOptionChoiceData<string> {
  const suffix = ` (${hit.isStream ? 'en vivo' : formatDuration(hit.durationMs)})`;
  const name = truncate(`${hit.title} — ${hit.author}`, MAX_LENGTH - suffix.length) + suffix;
  // Si el enlace no entra en el límite, se envía el texto y /play vuelve a buscarlo.
  const value =
    hit.url.length <= MAX_LENGTH ? hit.url : truncate(`${hit.title} ${hit.author}`, MAX_LENGTH);
  return { name, value };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tiempo de búsqueda agotado')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Busca temas: primero en el catálogo de Spotify (más completo) y, si no está configurado,
 * falla o no encuentra nada, en SoundCloud.
 */
export function createSearch(music: MusicManager, spotify: SpotifyClient | null, logger: Logger) {
  const searchSpotify = async (query: string): Promise<SearchHit[]> => {
    if (!spotify) return [];
    try {
      const tracks = await spotify.searchTracks(query, MAX_CHOICES);
      return tracks.map((track) => ({
        title: track.title,
        author: track.author,
        durationMs: track.durationMs,
        isStream: false,
        url: spotifyTrackUrl(track.id),
      }));
    } catch (error) {
      logger.warn({ err: error, query }, 'Falló la búsqueda en Spotify; uso SoundCloud');
      return [];
    }
  };

  const searchSoundCloud = async (query: string): Promise<SearchHit[]> => {
    const node = music.nodeManager.leastUsedNodes('playingPlayers')[0];
    if (!node) return [];
    const result = await node.search({ query, source: 'scsearch' }, null);
    return result.tracks.slice(0, MAX_CHOICES).map((track) => ({
      title: track.info.title,
      author: track.info.author,
      durationMs: track.info.duration,
      isStream: track.info.isStream,
      url: track.info.uri,
    }));
  };

  return async function search(query: string): Promise<SearchHit[]> {
    const spotifyHits = await searchSpotify(query);
    return spotifyHits.length > 0 ? spotifyHits : searchSoundCloud(query);
  };
}

export type Search = ReturnType<typeof createSearch>;

/**
 * Sugerencias para el autocompletado de /play.
 * Discord pide sugerencias en cada tecla: se cachean para no repetir búsquedas.
 */
export function createSuggestionProvider(search: Search, logger: Logger) {
  const cache = new Map<
    string,
    { choices: ApplicationCommandOptionChoiceData<string>[]; at: number }
  >();

  return async function suggest(
    input: string,
  ): Promise<ApplicationCommandOptionChoiceData<string>[]> {
    const query = input.trim();
    if (query.length < MIN_QUERY_LENGTH || parseUrl(query)) return [];

    const key = query.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.choices;

    try {
      const choices = (await withTimeout(search(query), SEARCH_TIMEOUT_MS)).map(toChoice);
      if (cache.size >= CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { choices, at: Date.now() });
      return choices;
    } catch (error) {
      logger.debug({ err: error, query }, 'Falló la búsqueda para autocompletar');
      return [];
    }
  };
}

export type SuggestionProvider = ReturnType<typeof createSuggestionProvider>;
