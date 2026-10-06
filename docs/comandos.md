# Comandos

Manual de uso de Prisma para los miembros del servidor.

## General

| Comando  | Descripción                                             |
| -------- | ------------------------------------------------------- |
| `/ayuda` | Lista todos los comandos (solo lo ves vos)              |
| `/info`  | Versión, tiempo en línea y consumo de memoria de Prisma |
| `/ping`  | Latencia con Discord                                    |

## Música

Para usar la música tenés que estar en un canal de voz. Para controlar algo que ya está sonando, tenés que estar en **el mismo** canal que Prisma.

| Comando            | Descripción                                              |
| ------------------ | -------------------------------------------------------- |
| `/play consulta`   | Busca un tema o carga un enlace y lo agrega a la cola    |
| `/pausa`           | Pausa o reanuda                                          |
| `/saltar`          | Pasa al siguiente tema                                   |
| `/detener`         | Corta la música, vacía la cola y saca a Prisma del canal |
| `/sonando`         | Muestra el tema actual con la barra de progreso          |
| `/cola [pagina]`   | Lista los próximos temas                                 |
| `/quitar posicion` | Quita un tema de la cola                                 |
| `/volumen nivel`   | Volumen de 1 a 150 (100 es el original)                  |
| `/repetir modo`    | Desactivado, tema actual o toda la cola                  |
| `/mezclar`         | Mezcla la cola al azar                                   |

### Búsqueda con sugerencias

Al escribir `/play`, Prisma muestra hasta 10 resultados mientras tipeás (por ejemplo, `/play fito`). Los resultados salen del **catálogo de Spotify**, que es mucho más completo; si Spotify no está disponible, salen de SoundCloud. Elegí uno de la lista para reproducir exactamente ese tema, o apretá Enter para reproducir el primer resultado. Si pegás un enlace, no se muestran sugerencias.

El audio se busca en SoundCloud con el título y el artista, así que en algunos temas puede sonar otra versión (en vivo, remasterizada o subida por un usuario).

### Panel de control

Cada vez que arranca un tema, Prisma publica una tarjeta con la carátula, el título, una barra de progreso que se actualiza cada 15 segundos, el estado (volumen, repetición, temas en cola, fuente, quién lo pidió), el próximo tema y los controles:

| Botón | Acción                                                                  |
| ----- | ----------------------------------------------------------------------- |
| ⏮️    | Vuelve al tema anterior (si el actual pasó los 5 segundos, lo reinicia) |
| ⏸️ ▶️ | Pausar / reanudar                                                       |
| ⏭️    | Saltar                                                                  |
| ⏹️    | Detener y salir                                                         |
| 🔉 🔊 | Bajar / subir el volumen de a 10%                                       |
| 🔁 🔂 | Rotar la repetición: desactivado → cola → tema actual                   |
| 🔀    | Mezclar la cola                                                         |
| 📜    | Ver la cola (solo lo ves vos)                                           |

### Qué se puede reproducir

| Fuente     | Búsqueda por nombre | Enlaces                                    |
| ---------- | ------------------- | ------------------------------------------ |
| SoundCloud | ✅ (por defecto)    | Temas, playlists, perfiles                 |
| Spotify    | —                   | Temas y álbumes (no playlists ni artistas) |
| Bandcamp   | —                   | Temas y álbumes                            |
| Twitch     | —                   | Transmisiones en vivo                      |
| Vimeo      | —                   | Videos                                     |

- **YouTube no está disponible**, por decisión del proyecto.
- Los enlaces de Spotify se reproducen buscando el mismo tema en SoundCloud, así que puede haber diferencias de versión.
- Las **playlists y artistas de Spotify no funcionan**: desde febrero de 2026 Spotify no deja que los bots lean su contenido. Como alternativa, usá playlists de SoundCloud.
- Los temas exclusivos de SoundCloud Go+ se descartan, porque solo dan un fragmento de 30 segundos.

### Salida automática

- Si se termina la cola y nadie agrega nada, Prisma se va a los **3 minutos**.
- Si no queda nadie en el canal de voz, se va a los **2 minutos**.

## Voz e IA _(fase 3)_

Próximamente: Prisma se une al canal de voz y responde cuando lo llaman por su nombre.

## Memoria _(fase 4)_

Próximamente: `/aprender`, `/olvidar`, `/recuerdos`.
