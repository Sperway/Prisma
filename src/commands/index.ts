import { ayuda } from './ayuda.js';
import { info } from './info.js';
import { ping } from './ping.js';
import type { Command } from './types.js';

/** Registro central: para agregar un comando, crealo en esta carpeta y sumalo acá. */
export const allCommands: readonly Command[] = [ayuda, info, ping];

export function buildCommandMap(commands: readonly Command[]): ReadonlyMap<string, Command> {
  const map = new Map<string, Command>();
  for (const command of commands) {
    if (map.has(command.data.name)) {
      throw new Error(`Comando duplicado: /${command.data.name}`);
    }
    map.set(command.data.name, command);
  }
  return map;
}
