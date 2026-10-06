import { z } from 'zod';

const snowflake = z
  .string({ error: 'es obligatorio' })
  .regex(/^\d{17,20}$/, 'debe ser un ID de Discord (17-20 dígitos)');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DISCORD_TOKEN: z.string({ error: 'es obligatorio' }).min(1, 'es obligatorio'),
  DISCORD_GUILD_ID: snowflake,
  HEALTH_FILE: z.string().default('/tmp/prisma-health'),

  LAVALINK_HOST: z.string().default('lavalink'),
  LAVALINK_PORT: z.coerce.number().int().positive().default(2333),
  LAVALINK_PASSWORD: z
    .string({ error: 'es obligatorio' })
    .min(16, 'debe tener al menos 16 caracteres'),
  MUSIC_DEFAULT_VOLUME: z.coerce.number().int().min(1).max(150).default(80),

  SPOTIFY_ENABLED: z.stringbool().default(false),
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  SPOTIFY_MARKET: z
    .string()
    .regex(/^[A-Z]{2}$/, 'debe ser un código de país de 2 letras (p. ej. AR)')
    .default('AR'),
});

const ConfigSchema = EnvSchema.superRefine((env, ctx) => {
  if (!env.SPOTIFY_ENABLED) return;
  for (const key of ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'] as const) {
    if (!env[key])
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: 'es obligatorio si SPOTIFY_ENABLED=true',
      });
  }
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Valida las variables de entorno. Falla rápido y con un mensaje claro si falta algo. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Configuración inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
