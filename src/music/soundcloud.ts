/**
 * Buscador de versiones reproducibles en SoundCloud.
 *
 * Por qué existe: desde 2026 muchas subidas oficiales de SoundCloud (sellos discográficos) ya
 * no entregan MP3 —la consulta del stream devuelve 404— y solo ofrecen AAC, que Lavalink
 * (lavaplayer 2.2.x) no sabe reproducir. Si se elige "el primer resultado" a ciegas, esos temas
 * fallan. Acá se buscan candidatos, se descartan los que Lavalink no podría reproducir y se
 * elige el que mejor coincide en título, artista y duración.
 * Ver docs/adr/0005-fuentes-de-musica.md.
 */

const API_URL = 'https://api-v2.soundcloud.com';
const SITE_URL = 'https://soundcloud.com/';
const CLIENT_ID_TTL_MS = 6 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
/** Cuántos candidatos se prueban como máximo (cada prueba es una consulta a SoundCloud). */
const MAX_PROBES = 6;
const MIN_SCORE = 0.35;
/** Segundo intento (solo por título) cuando no aparece ninguna versión reproducible. */
const FALLBACK_MIN_SCORE = 0.25;

/** Palabras que indican una versión distinta de la original. */
const VARIANT_WORDS = [
  'remix',
  'cover',
  'live',
  'vivo',
  'karaoke',
  'instrumental',
  'acapella',
  'acustico',
  'acoustic',
  'sped',
  'slowed',
  'nightcore',
  'reverb',
  '8d',
  'bit',
  'mashup',
  'bootleg',
];
/** Palabras que no aportan para comparar títulos. */
const NOISE_WORDS = new Set([
  'feat',
  'ft',
  'featuring',
  'official',
  'oficial',
  'audio',
  'video',
  'lyrics',
  'letra',
  'remaster',
  'remastered',
  'version',
  'prod',
  'the',
  'el',
  'la',
  'los',
  'las',
  'de',
  'y',
]);

export interface TrackQuery {
  title: string;
  author?: string;
  durationMs?: number;
}

interface Transcoding {
  url: string;
  format: { protocol: string; mime_type: string };
}

export interface SoundCloudCandidate {
  title: string;
  permalink_url: string;
  duration: number;
  policy?: string;
  streamable?: boolean;
  user?: { username?: string };
  publisher_metadata?: { artist?: string } | null;
  media?: { transcodings?: Transcoding[] };
}

/**
 * Quita del título lo que agrega Spotify y no suele estar en SoundCloud:
 * "Here Comes The Sun - Remastered 2009" → "Here Comes The Sun",
 * "Tema (feat. Alguien)" → "Tema", "Bzrp Music Sessions, Vol. 52/66" → "Bzrp Music Sessions, Vol. 52".
 */
export function simplifyTitle(title: string): string {
  return title
    .replace(/\s*[([](?:feat|ft|with|con)\.?\s[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*(?:remaster|version|versión|edit|mono|stereo)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*(?:remaster|version|versión|edit|mono|stereo|from|de la película).*$/i, '')
    .replace(/\s*\/\s*\d+\b/g, '')
    .trim();
}

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((word) => word.length > 0 && !NOISE_WORDS.has(word));
}

function coverage(wanted: string[], haystack: Set<string>): number {
  if (wanted.length === 0) return 1;
  return wanted.filter((word) => haystack.has(word)).length / wanted.length;
}

/** Puntaje de 0 a 1 (puede ser negativo si es una variante no pedida). */
export function scoreCandidate(query: TrackQuery, candidate: SoundCloudCandidate): number {
  const titleWords = new Set(tokens(candidate.title));
  const allWords = new Set([
    ...titleWords,
    ...tokens(candidate.user?.username ?? ''),
    ...tokens(candidate.publisher_metadata?.artist ?? ''),
  ]);

  const firstArtist = query.author?.split(',')[0] ?? '';
  let score = 0.6 * coverage(tokens(simplifyTitle(query.title)), titleWords);
  score += 0.3 * coverage(tokens(firstArtist), allWords);

  if (query.durationMs) {
    const diff = Math.abs(candidate.duration - query.durationMs);
    score += 0.1 * (1 - Math.min(diff / 30_000, 1));
    if (diff > 45_000) score -= 0.2; // probablemente otra versión o un fragmento
  } else {
    score += 0.05;
  }

  const wantedText = normalize(simplifyTitle(query.title));
  const candidateText = normalize(candidate.title);
  const unwantedVariant = VARIANT_WORDS.some(
    (word) => candidateText.split(' ').includes(word) && !wantedText.split(' ').includes(word),
  );
  if (unwantedVariant) score -= 0.3;

  return score;
}

/**
 * El formato que elegiría lavaplayer (mismo orden que DefaultSoundCloudFormatHandler):
 * HLS Opus, HLS MP3, MP3 progresivo. AAC no está soportado.
 */
export function pickLavaplayerFormat(transcodings: Transcoding[]): Transcoding | undefined {
  const order: [string, string][] = [
    ['hls', 'audio/ogg'],
    ['hls', 'audio/mpeg'],
    ['progressive', 'audio/mpeg'],
  ];
  for (const [protocol, mime] of order) {
    const found = transcodings.find(
      (t) => t.format.protocol === protocol && t.format.mime_type === mime,
    );
    if (found) return found;
  }
  return undefined;
}

export class SoundCloudResolver {
  private clientId: { value: string; fetchedAt: number } | null = null;

  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  private async request(url: string): Promise<Response> {
    return this.fetchFn(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  }

  /** SoundCloud no tiene API pública: se usa el client_id de su web (igual que Lavalink). */
  private async getClientId(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.clientId && Date.now() - this.clientId.fetchedAt < CLIENT_ID_TTL_MS) {
      return this.clientId.value;
    }
    const html = await (await this.request(SITE_URL)).text();
    const scripts = [...html.matchAll(/<script crossorigin src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of scripts.reverse()) {
      if (!src) continue;
      const match = /client_id:"([A-Za-z0-9]{32})"/.exec(await (await this.request(src)).text());
      if (match?.[1]) {
        this.clientId = { value: match[1], fetchedAt: Date.now() };
        return match[1];
      }
    }
    throw new Error('No se pudo obtener el client_id de SoundCloud');
  }

  private async api(path: string): Promise<Response> {
    const withId = async (refresh: boolean) => {
      const separator = path.includes('?') ? '&' : '?';
      return this.request(`${path}${separator}client_id=${await this.getClientId(refresh)}`);
    };
    const response = await withId(false);
    // client_id vencido: se renueva una vez.
    return response.status === 401 || response.status === 403 ? withId(true) : response;
  }

  async search(query: string, limit = 10): Promise<SoundCloudCandidate[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await this.api(`${API_URL}/search/tracks?${params}`);
    if (!response.ok) throw new Error(`SoundCloud respondió ${response.status}`);
    return ((await response.json()) as { collection: SoundCloudCandidate[] }).collection;
  }

  /** ¿Lavalink podría reproducir este tema? Se prueba la consulta del stream que haría Lavalink. */
  async isPlayable(candidate: SoundCloudCandidate): Promise<boolean> {
    if (candidate.streamable === false) return false;
    if (candidate.policy === 'BLOCK' || candidate.policy === 'SNIP') return false;
    const format = pickLavaplayerFormat(candidate.media?.transcodings ?? []);
    if (!format) return false;
    try {
      return (await this.api(format.url)).ok;
    } catch {
      return false;
    }
  }

  /** Elige el mejor candidato reproducible de una búsqueda. */
  private async bestPlayable(
    text: string,
    query: TrackQuery,
    minScore: number,
  ): Promise<string | null> {
    const candidates = (await this.search(text))
      .map((candidate) => ({ candidate, score: scoreCandidate(query, candidate) }))
      .filter(({ score }) => score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PROBES);

    // Se prueban en paralelo (menos espera) y se respeta el orden por puntaje.
    const playable = await Promise.all(
      candidates.map(({ candidate }) => this.isPlayable(candidate)),
    );
    return candidates.find((_, i) => playable[i])?.candidate.permalink_url ?? null;
  }

  /** Devuelve el enlace de la mejor versión reproducible, o null si no hay ninguna. */
  async findPlayable(query: TrackQuery): Promise<string | null> {
    const title = simplifyTitle(query.title);
    const withArtist = [title, query.author?.split(',')[0]].filter(Boolean).join(' ');
    return (
      (await this.bestPlayable(withArtist, query, MIN_SCORE)) ??
      // Si la versión oficial no es reproducible, suele haber subidas de usuarios con otro
      // formato de título: se busca solo por título y con un criterio más flexible.
      (withArtist === title ? null : await this.bestPlayable(title, query, FALLBACK_MIN_SCORE))
    );
  }
}
