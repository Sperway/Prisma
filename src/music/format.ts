/** Utilidades puras de formato para la música (sin dependencias de Discord: fáciles de testear). */

/** 65_000 → "1:05"; 3_725_000 → "1:02:05". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Barra de progreso de texto: "▬▬▬▬🔘▬▬▬▬▬". */
export function progressBar(position: number, duration: number, size = 14): string {
  if (duration <= 0) return '▬'.repeat(size);
  const ratio = Math.min(1, Math.max(0, position / duration));
  const index = Math.min(size - 1, Math.floor(ratio * size));
  return '▬'.repeat(index) + '🔘' + '▬'.repeat(size - index - 1);
}

/** Recorta un texto para que entre en los límites de Discord. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;

/** Devuelve la URL si el texto es un enlace http(s); si no, null (es una búsqueda). */
export function parseUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: URL): boolean {
  return YOUTUBE_HOST.test(url.hostname);
}
