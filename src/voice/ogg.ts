/**
 * Empaquetador Ogg Opus mínimo (RFC 7845).
 *
 * Discord entrega la voz de cada usuario como paquetes Opus de 20 ms. Para transcribirla basta
 * con meterlos en un contenedor Ogg —que Groq Whisper acepta— sin decodificar ni recodificar:
 * así el bot no necesita librerías nativas de audio y gasta casi nada de CPU.
 */

/** Muestras por paquete: Discord usa tramas de 20 ms a 48 kHz. */
export const SAMPLES_PER_PACKET = 960;
const MAX_SEGMENTS_PER_PAGE = 255;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/** CRC-32 de Ogg (polinomio 0x04c11db7, sin reflejar). */
export function oggCrc(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ byte) & 0xff] ?? 0)) >>> 0;
  }
  return crc;
}

/** Tabla de "lacing": cada paquete se parte en segmentos de 255 bytes más el resto. */
function lacing(length: number): number[] {
  const segments = new Array<number>(Math.floor(length / 255)).fill(255);
  segments.push(length % 255);
  return segments;
}

interface PageOptions {
  packets: Buffer[];
  granule: bigint;
  serial: number;
  sequence: number;
  headerType: number;
}

function buildPage({ packets, granule, serial, sequence, headerType }: PageOptions): Buffer {
  const segments = packets.flatMap((packet) => lacing(packet.length));
  const header = Buffer.alloc(27 + segments.length);
  header.write('OggS', 0, 'ascii');
  header.writeUInt8(0, 4); // versión
  header.writeUInt8(headerType, 5);
  header.writeBigInt64LE(granule, 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header.writeUInt32LE(0, 22); // CRC: se calcula con este campo en cero
  header.writeUInt8(segments.length, 26);
  segments.forEach((size, i) => header.writeUInt8(size, 27 + i));

  const page = Buffer.concat([header, ...packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

function opusHead(channels: number): Buffer {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'ascii');
  head.writeUInt8(1, 8); // versión
  head.writeUInt8(channels, 9);
  head.writeUInt16LE(0, 10); // pre-skip
  head.writeUInt32LE(48_000, 12); // frecuencia de muestreo original
  head.writeInt16LE(0, 16); // ganancia
  head.writeUInt8(0, 18); // mapeo de canales: mono/estéreo
  return head;
}

function opusTags(): Buffer {
  const vendor = Buffer.from('prisma', 'utf8');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0, 'ascii');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length); // sin comentarios
  return tags;
}

/** Arma un archivo .ogg a partir de paquetes Opus (Discord: estéreo, 20 ms por paquete). */
export function muxOggOpus(packets: readonly Buffer[], channels = 2): Buffer {
  const serial = 0x50524953; // "PRIS"
  const pages: Buffer[] = [
    buildPage({
      packets: [opusHead(channels)],
      granule: 0n,
      serial,
      sequence: 0,
      headerType: 0x02,
    }),
    buildPage({ packets: [opusTags()], granule: 0n, serial, sequence: 1, headerType: 0 }),
  ];

  let sequence = 2;
  let samples = 0n;
  let current: Buffer[] = [];
  let currentSegments = 0;

  const flush = (last: boolean) => {
    if (current.length === 0) return;
    pages.push(
      buildPage({
        packets: current,
        granule: samples,
        serial,
        sequence: sequence++,
        headerType: last ? 0x04 : 0,
      }),
    );
    current = [];
    currentSegments = 0;
  };

  for (const packet of packets) {
    const segments = lacing(packet.length).length;
    if (currentSegments + segments > MAX_SEGMENTS_PER_PAGE) flush(false);
    current.push(packet);
    currentSegments += segments;
    samples += BigInt(SAMPLES_PER_PACKET);
  }
  flush(true);

  return Buffer.concat(pages);
}
