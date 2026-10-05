import type { ApplicationCommandOptionChoiceData } from 'discord.js';
import type { Track } from 'lavalink-client';
import type { Logger } from '../logger.js';
import { formatDuration, parseUrl, truncate } from './format.js';
import type { MusicManager } from './manager.js';

/** Discord limita las opciones de autocompletado a 25, con nombre y valor de 100 caracteres. */
const MAX_CHOICES = 10;
const MAX_LENGTH = 100;
const MIN_QUERY_LENGTH = 2;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 200;
/** Discord descarta respuestas de autocompletado que tardan más de 3 s. */
const SEARCH_TIMEOUT_MS = 2_500;

/** Convierte un resultado en una opción: se muestra "Título — Autor (3:45)" y se envía el enlace. */
export function toChoice(track: Track): ApplicationCommandOptionChoiceData<string> {
  const { title, author, duration, isStream, uri } = track.info;
  const suffix = ` (${isStream ? 'en vivo' : formatDuration(duration)})`;
  const name = truncate(`${title} — ${author}`, MAX_LENGTH - suffix.length) + suffix;
  // Si el enlace no entra en el límite, se envía el texto y /play vuelve a buscarlo.
  const value = uri && uri.length <= MAX_LENGTH ? uri : truncate(`${title} ${author}`, MAX_LENGTH);
  return { name, value };
}

/**
 * Sugerencias para el autocompletado de /play, buscadas en SoundCloud.
 * Discord pide sugerencias en cada tecla: se cachean para no repetir búsquedas.
 */
export function createSuggestionProvider(music: MusicManager, logger: Logger) {
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

    const node = music.nodeManager.leastUsedNodes('playingPlayers')[0];
    if (!node) return [];

    try {
      const result = await Promise.race([
        node.search({ query, source: 'scsearch' }, null),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tiempo de búsqueda agotado')), SEARCH_TIMEOUT_MS),
        ),
      ]);
      const choices = result.tracks.slice(0, MAX_CHOICES).map(toChoice);
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
