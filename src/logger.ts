import { pino, type Logger } from 'pino';
import type { Config } from './config.js';

export type { Logger };

/**
 * En producción escribe JSON (una línea por evento) para que Docker lo rote y sea fácil de filtrar.
 * En desarrollo usa pino-pretty para que se lea cómodo en la terminal.
 */
export function createLogger(config: Pick<Config, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: config.LOG_LEVEL,
    base: { app: 'prisma' },
    redact: ['token', '*.token', 'headers.authorization'],
    ...(config.NODE_ENV === 'development' && {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,app' },
      },
    }),
  });
}
