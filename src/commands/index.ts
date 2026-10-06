import { ayuda } from './ayuda.js';
import { info } from './info.js';
import { detener, mezclar, pausa, repetir, saltar, sonando, volumen } from './music/controls.js';
import { play } from './music/play.js';
import { cola, quitar } from './music/queue.js';
import { ping } from './ping.js';
import { callar, charlar } from './voice.js';
import type { Command } from './types.js';

/** Registro central: para agregar un comando, crealo en esta carpeta y sumalo acá. */
export const allCommands: readonly Command[] = [
  // General
  ayuda,
  info,
  ping,
  // Música
  play,
  pausa,
  saltar,
  detener,
  sonando,
  cola,
  quitar,
  volumen,
  repetir,
  mezclar,
  // Voz
  charlar,
  callar,
];

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
