import { writeFile } from 'node:fs/promises';
import type { Client } from 'discord.js';
import type { Logger } from './logger.js';

export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Si el latido tiene más de esto, el contenedor se considera no saludable. */
export const HEARTBEAT_MAX_AGE_MS = 60_000;

/**
 * Escribe un latido en un archivo mientras la conexión con Discord esté viva.
 * El HEALTHCHECK de Docker (healthcheck.ts) lee ese archivo; no hace falta abrir ningún puerto.
 */
export function startHeartbeat(client: Client, file: string, logger: Logger): () => void {
  const beat = async () => {
    if (!client.isReady()) return;
    try {
      await writeFile(file, String(Date.now()));
    } catch (error) {
      logger.warn({ err: error }, 'No se pudo escribir el latido');
    }
  };
  void beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

export function isHeartbeatFresh(contents: string, now = Date.now()): boolean {
  const last = Number(contents);
  return Number.isFinite(last) && now - last < HEARTBEAT_MAX_AGE_MS;
}
