# 0005 — Fuentes de música: sin YouTube y sin URLs arbitrarias

- **Estado:** Aceptado
- **Fecha:** 2026-10-05

## Contexto

YouTube es la fuente más usada por los bots de música, pero bloquea seguido a los servidores, obliga a mantener plugins y cuentas de Google, y sus términos de uso no lo permiten. Por otro lado, la fuente `http` de Lavalink reproduce cualquier URL, lo que hace que la VPS se conecte a donde el usuario quiera.

## Decisión

- **Sin YouTube**: fuente desactivada y enlaces de YouTube rechazados con un mensaje claro.
- **SoundCloud** es la fuente principal y la búsqueda por defecto (`scsearch`). Se filtran los fragmentos de 30 segundos de los temas Go+.
- **Bandcamp, Twitch y Vimeo** se aceptan por enlace.
- **Spotify** es opcional y aporta **solo el catálogo** (búsqueda, títulos, artistas, carátulas): Spotify no entrega audio a bots. El bot lo usa directamente (`src/music/spotify.ts`), sin el plugin LavaSrc. Requiere una app de Spotify cuyo dueño tenga **Premium**.
- Con las restricciones de la API de Spotify de febrero de 2026 (apps en modo desarrollo), verificado el 2026-10-05:
  - **Búsqueda, temas sueltos y álbumes:** funcionan (`GET /search`, `GET /tracks/{id}`, `GET /albums/{id}`). LavaSrc 4.8.3 no podía cargar álbumes porque usa `GET /tracks?ids=`, que fue eliminado; por eso se dejó de usar.
  - **Playlists y artistas:** no se pueden leer (Spotify solo devuelve el contenido de playlists propias del usuario autenticado). El bot responde con un mensaje explicativo.
- **Elección de la versión de SoundCloud** (`src/music/soundcloud.ts`), verificado el 2026-10-05: muchas subidas oficiales de sellos ya no entregan MP3 (la consulta del stream da 404) y solo ofrecen AAC, que lavaplayer 2.2.x no soporta ([issue #189](https://github.com/lavalink-devs/lavaplayer/issues/189), sin solución). Tomar "el primer resultado" hacía fallar justamente los temas oficiales. El bot busca candidatos, **prueba que Lavalink pueda reproducirlos** (mismo orden de formatos que lavaplayer: HLS Opus, HLS MP3, MP3 progresivo) y elige el de mejor puntaje por título, artista y duración, penalizando remixes, covers y versiones en vivo no pedidos. Cada tema se resuelve recién cuando le toca sonar y conserva título, artista y carátula de Spotify.
- **Fuente `http` desactivada**: permitiría que cualquier miembro haga que la VPS descargue una URL arbitraria, lo que expone su IP real (Sperway la protege detrás de Cloudflare) y abre la puerta a peticiones a servicios internos (SSRF).

## Consecuencias

- El catálogo depende de SoundCloud: hay temas que no están o solo existen en versiones subidas por usuarios.
- No se pueden reproducir radios por URL directa. Si más adelante se quieren, se puede hacer una lista blanca de emisoras.
- Si Spotify cambia las condiciones de su API, solo se pierden los enlaces de Spotify; el resto sigue funcionando.
- Si se vence el Premium de la cuenta dueña de la app, los enlaces de Spotify dejan de funcionar hasta renovarlo.
- Algunos temas pueden sonar en una versión no oficial (subida por un usuario) cuando la oficial no es reproducible. Si lavaplayer agrega soporte para AAC, se puede volver a preferir la versión oficial.
- Resolver cada tema suma alrededor de un segundo entre canción y canción.
