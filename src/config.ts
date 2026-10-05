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
});

export type Config = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Valida las variables de entorno. Falla rápido y con un mensaje claro si falta algo. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Configuración inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
