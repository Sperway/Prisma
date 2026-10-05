# Desarrollo

## Requisitos

- Node.js 24 (ver `.nvmrc`)
- Una aplicación de bot **de pruebas** en el [Discord Developer Portal](https://discord.com/developers/applications). Conviene que sea distinta de la de producción, para no pisar los comandos del bot real.
- Un servidor de Discord de pruebas

## Crear la aplicación del bot

1. Developer Portal → **New Application** → nombre.
2. Pestaña **Bot**:
   - **Reset Token** y guardalo en un lugar seguro. Nunca lo subas al repo ni lo compartas por chat.
   - Desactivá **Public Bot**, así nadie más puede invitarlo.
3. Por ahora no hace falta ningún _Privileged Gateway Intent_.
4. En Discord, activá **Modo desarrollador** (Ajustes → Avanzado), hacé clic derecho en tu servidor → **Copiar ID del servidor**.

## Configuración local

```bash
npm install
cp .env.example .env
```

Completá `DISCORD_TOKEN` y `DISCORD_GUILD_ID` en `.env` y arrancá:

```bash
npm run dev
```

Si el bot todavía no está en el servidor, en el log aparece un **enlace de invitación** listo para usar. Al conectarse, los comandos se registran solos.

## Scripts

| Script              | Qué hace                                    |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Corre el bot con recarga automática         |
| `npm run build`     | Compila TypeScript a `dist/`                |
| `npm start`         | Corre la versión compilada                  |
| `npm test`          | Ejecuta los tests (Vitest)                  |
| `npm run typecheck` | Verifica los tipos                          |
| `npm run lint`      | ESLint                                      |
| `npm run format`    | Formatea con Prettier                       |
| `npm run check`     | Todo lo anterior (lo mismo que corre la CI) |

## Agregar un comando

1. Creá `src/commands/micomando.ts`:

   ```ts
   import { SlashCommandBuilder } from 'discord.js';
   import { brandEmbed } from '../ui/embeds.js';
   import type { Command } from './types.js';

   export const micomando: Command = {
     data: new SlashCommandBuilder().setName('micomando').setDescription('Qué hace.'),
     async execute(interaction, ctx) {
       await interaction.reply({ embeds: [brandEmbed().setDescription('¡Hola!')] });
     },
   };
   ```

2. Sumalo a `allCommands` en `src/commands/index.ts`.
3. Reiniciá el bot: se registra solo en el servidor.

Los tests de `tests/commands.test.ts` validan automáticamente que el nombre y la descripción cumplan las reglas de Discord.

## Convenciones

- Textos visibles para el usuario en **español**.
- Logs estructurados: `logger.info({ dato }, 'Mensaje')`, nunca `console.log` (ESLint lo prohíbe).
- Imports con extensión `.js` (requisito de ESM en Node).
- Commits en español, en imperativo y con un prefijo de tipo: `feat: agrega /cola`, `fix: …`, `docs: …`, `chore: …`.
