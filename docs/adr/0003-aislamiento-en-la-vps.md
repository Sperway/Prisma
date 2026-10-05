# 0003 — Aislamiento en la VPS compartida

- **Estado:** Aceptado
- **Fecha:** 2026-10-05

## Contexto

Prisma corre en la misma VPS que **Sperway**, un proyecto crítico de unos 28 contenedores (API, PostgreSQL, Caddy, OSRM, monitoreo). La VPS tiene 22 GB de RAM, **no tiene swap** y la suma de los límites de memoria de Sperway ya ocupa casi toda la RAM. Si se agota la memoria, el kernel empieza a matar procesos y podría elegir uno de Sperway.

## Decisión

1. **Proyecto Docker propio** (`name: prisma`) en `~/prisma`, con red y volúmenes propios. No compartimos la base de datos, el Valkey ni el Caddy de Sperway.
2. **Sin puertos publicados.** El bot solo abre conexiones salientes (Discord, Groq). No hay que tocar el firewall (ufw) ni Caddy.
3. **Límites duros** por contenedor: `mem_limit` (igual a `memswap_limit`), `cpus` y `pids_limit`. Presupuesto total de Prisma: 6 GB de RAM y 3 CPU.
4. **`oom_score_adj: 800`**: si el sistema se queda sin RAM, el kernel mata primero los procesos de Prisma.
5. **Endurecimiento:** sistema de archivos de solo lectura, `/tmp` en memoria, `cap_drop: ALL`, `no-new-privileges` y usuario sin privilegios.
6. **Logs rotados** (10 MB × 3 por servicio) para no llenar el disco.
7. Los comandos operativos se ejecutan siempre con `docker compose` desde `~/prisma`, que solo ve el proyecto `prisma`.

## Consecuencias

- Prisma puede caerse por falta de memoria en un pico, pero Sperway queda protegido. Es el compromiso buscado.
- Al sumar servicios (Lavalink, Postgres, Piper, IA local), cada uno tiene que declarar sus límites dentro del presupuesto.
- El Promtail de Sperway puede recolectar también los logs de Prisma. Es inofensivo, y hasta útil para verlos en Grafana.
