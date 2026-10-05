# 0005 — Fuentes de música: sin YouTube y sin URLs arbitrarias

- **Estado:** Aceptado
- **Fecha:** 2026-10-05

## Contexto

YouTube es la fuente más usada por los bots de música, pero bloquea seguido a los servidores, obliga a mantener plugins y cuentas de Google, y sus términos de uso no lo permiten. Por otro lado, la fuente `http` de Lavalink reproduce cualquier URL, lo que hace que la VPS se conecte a donde el usuario quiera.

## Decisión

- **Sin YouTube**: fuente desactivada y enlaces de YouTube rechazados con un mensaje claro.
- **SoundCloud** es la fuente principal y la búsqueda por defecto (`scsearch`). Se filtran los fragmentos de 30 segundos de los temas Go+.
- **Bandcamp, Twitch y Vimeo** se aceptan por enlace.
- **Spotify** es opcional, con el plugin LavaSrc: se leen los metadatos y el audio se busca en SoundCloud. Requiere una app de Spotify cuyo dueño tenga **Premium**.
- Con las restricciones de la API de Spotify de febrero de 2026 (apps en modo desarrollo), verificado el 2026-10-05:
  - **Temas sueltos:** funcionan con LavaSrc.
  - **Álbumes:** LavaSrc 4.8.3 falla (usa `GET /tracks?ids=`, que fue eliminado). El bot los lee por su cuenta con `GET /albums/{id}` (`src/music/spotify.ts`) y encola cada tema sin resolver: se busca recién cuando le toca sonar.
  - **Playlists y artistas:** no se pueden leer (Spotify solo devuelve el contenido de playlists propias del usuario autenticado). El bot responde con un mensaje explicativo.
- **Fuente `http` desactivada**: permitiría que cualquier miembro haga que la VPS descargue una URL arbitraria, lo que expone su IP real (Sperway la protege detrás de Cloudflare) y abre la puerta a peticiones a servicios internos (SSRF).

## Consecuencias

- El catálogo depende de SoundCloud: hay temas que no están o solo existen en versiones subidas por usuarios.
- No se pueden reproducir radios por URL directa. Si más adelante se quieren, se puede hacer una lista blanca de emisoras.
- Si Spotify cambia las condiciones de su API, solo se pierden los enlaces de Spotify; el resto sigue funcionando.
- Si se vence el Premium de la cuenta dueña de la app, los enlaces de Spotify dejan de funcionar hasta renovarlo.
- Cuando LavaSrc se adapte a la nueva API, se puede quitar el lector de álbumes propio.
