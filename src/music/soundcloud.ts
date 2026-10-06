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
/** Puntaje mínimo para considerar un candidato. */
const MIN_SCORE = 0.35;
/** Desde este puntaje es "la misma versión"; por debajo, una versión alternativa (remix, cover…). */
export const EXACT_SCORE = 0.6;

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
  'edit',
  'mix',
  'extended',
  'retro',
  'covers',
  'tribute',
  'tributo',
  'ingles',
  'english',
  'motivation',
  'workout',
  'gym',
  'type',
  'beat',
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

export interface PlayableMatch {
  url: string;
  title: string;
  author: string;
  score: number;
  /** false: es una versión alternativa (remix, cover, en vivo…) porque no hay otra reproducible. */
  exact: boolean;
}

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

/**
 * Puntaje de 0 a 1 (puede ser negativo si es una variante no pedida):
 * - 45 %: cuántas palabras del título pedido aparecen en el del candidato.
 * - 20 %: si aparece el artista (en el título, el usuario o los metadatos del sello).
 * - 15 %: cuántas palabras del candidato son "esperables" (título + artista): castiga títulos
 *   con agregados como "gym motivation rocky…" o "dj edit extended".
 * - 20 %: cercanía de la duración.
 */
export function scoreCandidate(query: TrackQuery, candidate: SoundCloudCandidate): number {
  const wantedTitle = tokens(simplifyTitle(query.title));
  const wantedArtist = tokens(query.author?.split(',')[0] ?? '');
  const allArtists = tokens(query.author ?? '');

  const candidateTitle = tokens(candidate.title);
  const titleWords = new Set(candidateTitle);
  // El enlace también delata al usuario: "The Best of Oasis" → soundcloud.com/oasis-garage-band-cover.
  const uploaderSlug = candidate.permalink_url.split('/')[3] ?? '';
  const uploaderWords = [
    ...tokens(candidate.user?.username ?? ''),
    ...tokens(candidate.publisher_metadata?.artist ?? ''),
    ...tokens(uploaderSlug),
  ];

  let score = 0.45 * coverage(wantedTitle, titleWords);
  score += 0.2 * coverage(wantedArtist, new Set([...candidateTitle, ...uploaderWords]));

  const expected = new Set([...wantedTitle, ...allArtists]);
  const expectedShare =
    candidateTitle.length === 0
      ? 0
      : candidateTitle.filter((word) => expected.has(word)).length / candidateTitle.length;
  score += 0.15 * expectedShare;

  if (query.durationMs) {
    const diff = Math.abs(candidate.duration - query.durationMs);
    score += 0.2 * (1 - Math.min(diff / 20_000, 1));
    if (diff > 30_000) score -= 0.2; // casi seguro otra versión, un fragmento o una mezcla
  } else {
    score += 0.1;
  }

  // Variantes no pedidas: se buscan en el título y en el usuario ("oasis garage band cover").
  const wanted = new Set(normalize(simplifyTitle(query.title)).split(' '));
  const candidateWords = new Set([...normalize(candidate.title).split(' '), ...uploaderWords]);
  if (VARIANT_WORDS.some((word) => candidateWords.has(word) && !wanted.has(word))) score -= 0.35;

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

  /** El mejor candidato reproducible de una búsqueda (por puntaje), o null. */
  private async bestPlayable(text: string, query: TrackQuery): Promise<PlayableMatch | null> {
    const candidates = (await this.search(text))
      .map((candidate) => ({ candidate, score: scoreCandidate(query, candidate) }))
      .filter(({ score }) => score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PROBES);

    // Se prueban en paralelo (menos espera) y se respeta el orden por puntaje.
    const playable = await Promise.all(
      candidates.map(({ candidate }) => this.isPlayable(candidate)),
    );
    const best = candidates.find((_, i) => playable[i]);
    if (!best) return null;
    return {
      url: best.candidate.permalink_url,
      title: best.candidate.title,
      author: best.candidate.publisher_metadata?.artist ?? best.candidate.user?.username ?? '',
      score: best.score,
      exact: best.score >= EXACT_SCORE,
    };
  }

  /**
   * La mejor versión reproducible: primero buscando por título y artista; si no aparece una
   * exacta, también solo por título (las subidas de usuarios suelen tener otro formato).
   * Si solo hay alternativas, devuelve la de mejor puntaje marcada como no exacta.
   */
  async findPlayable(query: TrackQuery): Promise<PlayableMatch | null> {
    const title = simplifyTitle(query.title);
    const withArtist = [title, query.author?.split(',')[0]].filter(Boolean).join(' ');

    const first = await this.bestPlayable(withArtist, query);
    if (first?.exact || withArtist === title) return first;

    const second = await this.bestPlayable(title, query);
    if (!first) return second;
    if (!second) return first;
    return second.score > first.score ? second : first;
  }
}
