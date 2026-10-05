import { describe, expect, it } from 'vitest';
import { allCommands, buildCommandMap } from '../src/commands/index.js';

describe('registro de comandos', () => {
  it('no tiene nombres duplicados', () => {
    expect(() => buildCommandMap(allCommands)).not.toThrow();
  });

  it('detecta duplicados', () => {
    const command = allCommands.at(0);
    if (!command) throw new Error('No hay comandos registrados');
    expect(() => buildCommandMap([command, command])).toThrow(/duplicado/);
  });

  it.each(allCommands.map((command) => [command.data.name, command] as const))(
    '/%s cumple las reglas de Discord',
    (_name, command) => {
      const json = command.data.toJSON();
      expect(json.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(json.description.length).toBeGreaterThan(0);
      expect(json.description.length).toBeLessThanOrEqual(100);
    },
  );
});
