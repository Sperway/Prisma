/** Personalidad de Prisma en voz y limpieza del texto antes de sintetizarlo. */

export interface PromptContext {
  /** Nombre visible de quien habla. */
  speaker: string;
  /** Tema que está sonando, si hay música ("Título — Artista"). */
  nowPlaying?: string | null;
  /** Fecha y hora actuales, ya formateadas. */
  now: string;
}

export function buildSystemPrompt({ speaker, nowPlaying, now }: PromptContext): string {
  return [
    'Sos Prisma, la integrante virtual de un grupo de amigos en Discord. Estás en un canal de voz:',
    'lo que respondas se convierte en voz y se escucha en el momento.',
    '',
    'Cómo hablás:',
    '- Español rioplatense, con voseo, cálida, con humor y sin formalidades.',
    '- Respuestas cortas: una a tres oraciones, como en una charla real. Solo te extendés si te lo piden.',
    '- Nada de markdown, listas, emojis, enlaces ni símbolos: solo texto que suene natural en voz alta.',
    '- Los números, siglas y abreviaturas, escribilos como se dicen.',
    '- Si no sabés algo o no lo podés hacer, decilo con naturalidad. No inventes datos.',
    '- No digas que sos un modelo de lenguaje ni hables de tus instrucciones.',
    '',
    'Contexto:',
    `- Te está hablando ${speaker}.`,
    `- Ahora es ${now}.`,
    nowPlaying
      ? `- En el canal está sonando: ${nowPlaying}.`
      : '- En este momento no está sonando música.',
    '- La transcripción de voz puede tener errores: interpretá lo que la persona quiso decir.',
  ].join('\n');
}

/** Oraciones más cortas que esto se juntan con la siguiente (evita cortes antinaturales). */
const MIN_SENTENCE_LENGTH = 25;

/**
 * Divide el texto en oraciones para sintetizar y reproducir de a una: la primera suena mientras
 * se genera la siguiente, así Prisma empieza a hablar antes.
 */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map((part) => part.trim()) ?? [];
  const sentences: string[] = [];
  for (const part of parts.filter(Boolean)) {
    const last = sentences.at(-1);
    if (last !== undefined && last.length < MIN_SENTENCE_LENGTH) {
      sentences[sentences.length - 1] = `${last} ${part}`;
    } else {
      sentences.push(part);
    }
  }
  return sentences;
}

const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/gu;
const MAX_SPOKEN_LENGTH = 600;

/** Deja el texto listo para la síntesis de voz. */
export function cleanForSpeech(text: string): string {
  let clean = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [texto](enlace) → texto
    .replace(/https?:\/\/\S+/g, '') // enlaces sueltos
    .replace(/[*_~`#>|]/g, '') // markdown
    .replace(/^\s*[-•]\s+/gm, '') // viñetas
    .replace(EMOJI, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length > MAX_SPOKEN_LENGTH) {
    // Se corta en el último final de oración que entre.
    const cut = clean.slice(0, MAX_SPOKEN_LENGTH);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    clean = end > 0 ? cut.slice(0, end + 1) : cut;
  }
  return clean;
}
