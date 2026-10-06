/** Detección de la palabra clave ("Prisma") en lo que transcribió Whisper. */

function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]/g, '');
}

/** Distancia de edición (Levenshtein) entre dos palabras cortas. */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = temp;
    }
  }
  return row[b.length] ?? 0;
}

/**
 * ¿La palabra es la palabra clave? Tolera un error de transcripción ("brisma", "prizma"),
 * pero exige el mismo largo aproximado para no confundirla con palabras reales como "prima".
 */
export function isWakeWord(word: string, wakeWord: string): boolean {
  const normalized = normalizeWord(word);
  const target = normalizeWord(wakeWord);
  if (normalized === target) return true;
  return normalized.length >= target.length && editDistance(normalized, target) <= 1;
}

export interface WakeMatch {
  /** Lo que se le pidió a Prisma (sin la palabra clave). Puede quedar vacío ("¿Prisma?"). */
  request: string;
}

/**
 * Busca la palabra clave en la transcripción. Si aparece, devuelve el pedido sin ella:
 * "Che Prisma, ¿qué tema es este?" → "¿qué tema es este?".
 */
export function findWakeWord(transcript: string, wakeWord: string): WakeMatch | null {
  const words = transcript.split(/\s+/).filter(Boolean);
  const index = words.findIndex((word) => isWakeWord(word, wakeWord));
  if (index === -1) return null;

  const before = words.slice(0, index);
  const after = words.slice(index + 1);
  // Muletillas típicas antes del nombre ("che", "oye", "hola") no son parte del pedido.
  const fillers = new Set(['che', 'oye', 'hola', 'ey', 'eh', 'dale', 'bueno', 'a', 've']);
  const keptBefore = before.filter((word) => !fillers.has(normalizeWord(word)));

  const request = [...keptBefore, ...after]
    .join(' ')
    .replace(/^[\s,.;:!¡]+/, '')
    .trim();
  return { request };
}
