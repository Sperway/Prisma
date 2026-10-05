// Ejecutado por el HEALTHCHECK de Docker: sale con 0 si el bot está vivo y conectado.
import { readFile } from 'node:fs/promises';
import { isHeartbeatFresh } from './health.js';

const file = process.env.HEALTH_FILE ?? '/tmp/prisma-health';

try {
  process.exit(isHeartbeatFresh(await readFile(file, 'utf8')) ? 0 : 1);
} catch {
  process.exit(1);
}
