import { describe, expect, it } from 'vitest';
import { muxOggOpus, oggCrc, SAMPLES_PER_PACKET } from '../src/voice/ogg.js';
import { buildSystemPrompt, cleanForSpeech, splitSentences } from '../src/voice/persona.js';
import { editDistance, findWakeWord, isWakeWord } from '../src/voice/wakeword.js';

/** Lee las páginas de un archivo Ogg (para verificar lo que arma el empaquetador). */
function readPages(file: Buffer) {
  const pages = [];
  let offset = 0;
  while (offset < file.length) {
    expect(file.toString('ascii', offset, offset + 4)).toBe('OggS');
    const segmentCount = file.readUInt8(offset + 26);
    const segments = [...file.subarray(offset + 27, offset + 27 + segmentCount)];
    const size = 27 + segmentCount + segments.reduce((a, b) => a + b, 0);
    const page = Buffer.from(file.subarray(offset, offset + size));
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    pages.push({
      headerType: page.readUInt8(5),
      granule: page.readBigInt64LE(6),
      sequence: page.readUInt32LE(18),
      crcValid: oggCrc(page) === crc,
      body: page.subarray(27 + segmentCount),
      segments,
    });
    offset += size;
  }
  return pages;
}

describe('oggCrc', () => {
  it('coincide con el CRC-32 de Ogg (valor de referencia de "123456789")', () => {
    expect(oggCrc(Buffer.from('123456789'))).toBe(0x89a1897f);
  });
});

describe('muxOggOpus', () => {
  it('arma cabeceras OpusHead/OpusTags y páginas de audio válidas', () => {
    const packets = Array.from({ length: 120 }, (_, i) => Buffer.alloc(100 + (i % 7), i));
    const pages = readPages(muxOggOpus(packets));

    expect(pages[0]?.body.toString('ascii', 0, 8)).toBe('OpusHead');
    expect(pages[0]?.headerType).toBe(0x02); // inicio del flujo
    expect(pages[1]?.body.toString('ascii', 0, 8)).toBe('OpusTags');
    expect(pages.at(-1)?.headerType).toBe(0x04); // fin del flujo
    expect(pages.at(-1)?.granule).toBe(BigInt(120 * SAMPLES_PER_PACKET));
    expect(pages.every((page) => page.crcValid)).toBe(true);
    expect(pages.map((page) => page.sequence)).toEqual(pages.map((_, i) => i));

    // El audio se conserva byte a byte.
    const audio = Buffer.concat(pages.slice(2).map((page) => page.body));
    expect(audio.equals(Buffer.concat(packets))).toBe(true);
  });

  it('respeta el máximo de 255 segmentos por página y parte paquetes grandes', () => {
    const packets = Array.from({ length: 300 }, () => Buffer.alloc(600)); // 3 segmentos c/u
    const pages = readPages(muxOggOpus(packets));
    expect(pages.length).toBeGreaterThan(3);
    expect(pages.every((page) => page.segments.length <= 255)).toBe(true);
    // 600 bytes = 255 + 255 + 90
    expect(pages[2]?.segments.slice(0, 3)).toEqual([255, 255, 90]);
  });
});

describe('palabra clave', () => {
  it('calcula la distancia de edición', () => {
    expect(editDistance('prisma', 'prisma')).toBe(0);
    expect(editDistance('brisma', 'prisma')).toBe(1);
    expect(editDistance('prima', 'prisma')).toBe(1);
  });

  it('tolera errores de transcripción pero no confunde palabras reales', () => {
    for (const word of ['Prisma', 'prisma,', 'PRISMA?', 'Brisma', 'Prizma', 'Prismá']) {
      expect(isWakeWord(word, 'prisma'), word).toBe(true);
    }
    for (const word of ['prima', 'risa', 'misma', 'prisión']) {
      expect(isWakeWord(word, 'prisma'), word).toBe(false);
    }
  });

  it('extrae el pedido sin el nombre ni las muletillas', () => {
    expect(findWakeWord('Che Prisma, ¿qué tema es este?', 'prisma')).toEqual({
      request: '¿qué tema es este?',
    });
    expect(findWakeWord('¿Qué hora es, Prisma?', 'prisma')).toEqual({ request: '¿Qué hora es,' });
    expect(findWakeWord('¿Prisma?', 'prisma')).toEqual({ request: '' });
    expect(findWakeWord('hoy fui al cine con mi prima', 'prisma')).toBeNull();
  });
});

describe('persona y texto hablado', () => {
  it('limpia markdown, emojis y enlaces', () => {
    expect(cleanForSpeech('**Hola** 👋 mirá [esto](https://x.com) y https://y.com\n- listo')).toBe(
      'Hola mirá esto y listo',
    );
  });

  it('divide en oraciones y junta las muy cortas', () => {
    expect(
      splitSentences('¡Hola! Ahora suena Fito Páez. ¿Querés que ponga algo parecido después?'),
    ).toEqual(['¡Hola! Ahora suena Fito Páez.', '¿Querés que ponga algo parecido después?']);
    expect(splitSentences('Sin puntuación final')).toEqual(['Sin puntuación final']);
  });

  it('incluye quién habla y qué está sonando', () => {
    const prompt = buildSystemPrompt({
      speaker: 'Matías',
      nowPlaying: 'Mariposa Tecknicolor — Fito Páez',
      now: 'lunes',
    });
    expect(prompt).toContain('Te está hablando Matías');
    expect(prompt).toContain('Mariposa Tecknicolor — Fito Páez');
  });
});

describe('primer fragmento corto', () => {
  it('parte una primera oración larga en la primera coma', () => {
    const text =
      '¡Claro, Matías! Poné The End de The Doors, tiene esa vibra que te pega justo ahora y te va a encantar. Después seguimos.';
    const [first, second] = splitSentences(text);
    expect(first).toBe('¡Claro, Matías! Poné The End de The Doors,');
    expect(second).toBe('tiene esa vibra que te pega justo ahora y te va a encantar.');
  });
});
