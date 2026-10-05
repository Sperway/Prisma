import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const valid = {
  DISCORD_TOKEN: 'token',
  DISCORD_GUILD_ID: '123456789012345678',
  LAVALINK_PASSWORD: 'una-clave-larga-de-prueba',
};

describe('loadConfig', () => {
  it('acepta una configuración mínima y aplica valores por defecto', () => {
    const config = loadConfig(valid);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.NODE_ENV).toBe('development');
    expect(config.HEALTH_FILE).toBe('/tmp/prisma-health');
  });

  it('falla con un mensaje claro si falta el token', () => {
    expect(() => loadConfig({ DISCORD_GUILD_ID: valid.DISCORD_GUILD_ID })).toThrow(ConfigError);
    expect(() => loadConfig({ DISCORD_GUILD_ID: valid.DISCORD_GUILD_ID })).toThrow(/DISCORD_TOKEN/);
  });

  it('rechaza un ID de servidor inválido', () => {
    expect(() => loadConfig({ ...valid, DISCORD_GUILD_ID: 'abc' })).toThrow(/DISCORD_GUILD_ID/);
  });

  it('rechaza un nivel de log desconocido', () => {
    expect(() => loadConfig({ ...valid, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });
});
