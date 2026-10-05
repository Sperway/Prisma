# 🔷 Prisma

Bot de Discord privado con **música**, **IA conversacional por voz en tiempo real** y **memoria que aprende** del grupo.

> Estado: **Fase 1 — base del proyecto** (comandos básicos, infraestructura, documentación). Ver la [hoja de ruta](docs/hoja-de-ruta.md).

## Funciones

| Función                                    | Estado    |
| ------------------------------------------ | --------- |
| Comandos base (`/ping`, `/info`, `/ayuda`) | ✅ Listo  |
| Música (Lavalink, colas, playlists)        | 🔜 Fase 2 |
| Escuchar y responder por voz               | 🔜 Fase 3 |
| Memoria y aprendizaje                      | 🔜 Fase 4 |

## Stack

- **Node.js 24** + **TypeScript** + **discord.js v14**
- **Lavalink v4** para audio (fase 2)
- **Groq** (Whisper + LLM) con respaldo local, y **Piper** para la voz (fases 3 y 4)
- **PostgreSQL + pgvector** para la memoria (fase 4)
- **Docker Compose** con aislamiento estricto en la VPS

Los motivos de cada decisión están en [docs/adr](docs/adr).

## Inicio rápido (desarrollo)

```bash
npm install
cp .env.example .env   # completar DISCORD_TOKEN y DISCORD_GUILD_ID
npm run dev
```

Guía completa: [docs/desarrollo.md](docs/desarrollo.md).

## Documentación

| Documento                            | Contenido                                           |
| ------------------------------------ | --------------------------------------------------- |
| [Arquitectura](docs/arquitectura.md) | Cómo está construido Prisma y cómo fluyen los datos |
| [Desarrollo](docs/desarrollo.md)     | Configurar el entorno, scripts, agregar comandos    |
| [Despliegue](docs/despliegue.md)     | Poner Prisma en la VPS y mantenerlo                 |
| [Comandos](docs/comandos.md)         | Manual de uso para el servidor                      |
| [Hoja de ruta](docs/hoja-de-ruta.md) | Fases y estado del proyecto                         |
| [Decisiones (ADR)](docs/adr)         | Por qué se eligió cada tecnología                   |
