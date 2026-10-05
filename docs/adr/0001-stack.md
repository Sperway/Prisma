# 0001 — Stack: TypeScript + discord.js + Lavalink

- **Estado:** Aceptado
- **Fecha:** 2026-10-05

## Contexto

Prisma necesita comandos, reproducción de música estable las 24 horas y, sobre todo, **recibir y enviar audio** en canales de voz para la IA conversacional. La recepción de audio no está documentada oficialmente por Discord y desde 2026 requiere el cifrado de extremo a extremo DAVE.

## Decisión

- **Node.js 24 LTS + TypeScript (modo estricto)**.
- **discord.js v14** y **@discordjs/voice**: es la librería más usada y mantenida, y `@discordjs/voice` ya implementa DAVE (con `@snazzah/davey`) y la recepción de audio por usuario.
- **Lavalink v4** para la música: un servidor de audio aparte que maneja la búsqueda, la decodificación y el streaming. El bot solo envía órdenes.
- **Zod** para validar la configuración, **pino** para los logs, **Vitest** para los tests y **ESLint + Prettier** para el estilo.

## Alternativas descartadas

- **Python (discord.py / py-cord):** buena opción para IA, pero su soporte de recepción de voz y de DAVE va por detrás.
- **Reproducir música desde el propio bot (ffmpeg + yt-dlp):** más simple al principio, pero mezcla el trabajo pesado de audio con la lógica del bot y es menos estable.

## Consecuencias

- Lavalink suma un contenedor Java (unos 512 MB a 1 GB de RAM), que entra en el presupuesto de la VPS.
- YouTube cambia seguido sus protecciones y el plugin `youtube-source` necesitará actualizaciones periódicas.
- Usamos **TypeScript 6.0** y no la 7.0 hasta que `typescript-eslint` la soporte.
