# Despliegue en la VPS

> ⚠️ **La VPS es compartida con Sperway, un proyecto crítico.** Todos los comandos de esta guía actúan **solo** sobre el proyecto Docker `prisma`. Nunca uses `docker compose down` fuera de `~/prisma`, ni `docker system prune`, ni toques los contenedores, las redes o los volúmenes `sperway*`.

## Datos de la VPS

| Recurso   | Valor                                                      |
| --------- | ---------------------------------------------------------- |
| SO        | Ubuntu 22.04, Docker 29, Compose v5                        |
| Hardware  | 8 vCPU, 22 GB de RAM, **sin swap**, sin GPU                |
| Acceso    | `ssh sperway-vps` (usuario `ubuntu`, en el grupo `docker`) |
| Ubicación | `~/prisma`                                                 |

Presupuesto de recursos de Prisma (todas las fases): **6 GB de RAM y 3 CPU como máximo**. Hoy, en la fase 1, son 512 MB y 1 CPU.

## Primera instalación

### 1. Clave de despliegue (solo lectura)

En la VPS:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/prisma_deploy -N "" -C "prisma-deploy@vps"
cat ~/.ssh/prisma_deploy.pub
```

En GitHub: repositorio → **Settings → Deploy keys → Add deploy key**. Pegá la clave pública y **no** marques _Allow write access_.

Agregá a `~/.ssh/config` de la VPS:

```
Host github-prisma
    HostName github.com
    User git
    IdentityFile ~/.ssh/prisma_deploy
    IdentitiesOnly yes
```

### 2. Clonar y configurar

```bash
git clone github-prisma:Sperway/Prisma.git ~/prisma
cd ~/prisma
cp .env.example .env
chmod 600 .env
nano .env   # DISCORD_TOKEN y DISCORD_GUILD_ID
```

### 3. Levantar

```bash
cd ~/prisma
docker compose up -d --build
docker compose logs -f bot
```

Si el bot todavía no está en el servidor, el log muestra el enlace de invitación.

## Actualizar a una nueva versión

```bash
cd ~/prisma
git pull --ff-only
docker compose up -d --build
docker compose logs --tail 50 bot
```

`up -d --build` reemplaza solo los contenedores que cambiaron, con unos segundos de corte del bot.

## Volver a una versión anterior

```bash
cd ~/prisma
git log --oneline -10          # elegir el commit
git checkout <commit>
docker compose up -d --build
```

Para volver a la última versión: `git checkout main && git pull --ff-only` y otra vez `docker compose up -d --build`.

## Operación diaria

| Tarea                             | Comando (desde `~/prisma`)                                            |
| --------------------------------- | --------------------------------------------------------------------- |
| Estado y salud                    | `docker compose ps`                                                   |
| Logs en vivo                      | `docker compose logs -f bot`                                          |
| Consumo de recursos               | `docker stats --no-stream $(docker compose ps -q)`                    |
| Reiniciar                         | `docker compose restart bot`                                          |
| Detener (solo Prisma)             | `docker compose down`                                                 |
| Limpiar imágenes viejas de Prisma | `docker image prune --filter label=com.docker.compose.project=prisma` |

## Verificar que Sperway no se vio afectado

Después de cualquier cambio en la VPS:

```bash
docker ps --filter name=sperway --format 'table {{.Names}}\t{{.Status}}'
free -h
```

Todos los contenedores `sperway-*` tienen que seguir `Up` (y `healthy` donde corresponda).

## Cómo se protege a Sperway

Ver [ADR 0003](adr/0003-aislamiento-en-la-vps.md). En resumen: proyecto y red propios, sin puertos publicados, límites de memoria, CPU y procesos, `oom_score_adj` alto (ante falta de RAM muere primero Prisma), sistema de archivos de solo lectura, sin capacidades de Linux y logs rotados (máximo 30 MB por servicio).
