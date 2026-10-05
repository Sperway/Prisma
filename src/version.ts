import { readFileSync } from 'node:fs';

// Funciona igual desde src/ (tsx) y desde dist/ (producción): package.json está un nivel arriba.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export const VERSION = pkg.version;
