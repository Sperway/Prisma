# Arquitectura

## Visión general

Prisma es un único proceso Node.js (el **bot**) que se conecta al Gateway de Discord. A medida que se sumen funciones, se apoyará en servicios auxiliares, todos dentro del mismo proyecto Docker `prisma` y aislados del resto de la VPS.

```mermaid
flowchart LR
    subgraph Discord
        GW[Gateway]
        VC[Canales de voz]
    end

    subgraph VPS["VPS — proyecto Docker «prisma»"]
        BOT[bot<br/>Node.js + discord.js]
        LL[Lavalink]
        PG[(PostgreSQL + pgvector<br/>fase 4)]
        TTS[Piper TTS<br/>fase 3]
        LOCAL[IA local de respaldo<br/>fase 3-4]
    end

    GROQ[Groq API<br/>Whisper + LLM]

    GW <--> BOT
    VC <--> BOT
    VC <--> LL
    BOT --> LL
    BOT --> PG
    BOT --> TTS
    BOT --> GROQ
    BOT -.si Groq falla.-> LOCAL
```

Las líneas punteadas y los servicios marcados con fase todavía no existen.

## Estructura del código

```
src/
├── index.ts               Punto de entrada: configuración, cliente, eventos y apagado ordenado
├── config.ts              Variables de entorno validadas con Zod (falla rápido si falta algo)
├── logger.ts              Logs estructurados con pino (JSON en producción)
├── version.ts             Versión leída de package.json
├── health.ts              Latido en archivo para el HEALTHCHECK de Docker
├── healthcheck.ts         Script que ejecuta Docker para saber si el bot está vivo
├── commands/
│   ├── types.ts           Contratos Command y BotContext
│   ├── index.ts           Registro central de comandos
│   ├── music/             Comandos de música
│   └── *.ts               Comandos generales
├── music/
│   ├── manager.ts         Conexión con Lavalink, eventos de reproducción y panel
│   ├── panel.ts           Embed de "sonando ahora" y botones de control
│   ├── buttons.ts         Acciones de los botones del panel
│   ├── guards.ts          Validaciones comunes (canal de voz, reproductor activo)
│   ├── autoLeave.ts       Salida automática cuando el canal queda vacío
│   ├── spotify.ts         Lector de álbumes de Spotify (la API actual no lo deja a LavaSrc)
│   └── format.ts          Formato de duraciones, barra de progreso y enlaces
├── events/
│   ├── ready.ts           Al conectar: seguridad de servidores y registro de comandos
│   └── interactionCreate.ts  Despacho de slash commands con manejo de errores
└── ui/
    └── embeds.ts          Colores y embeds con la identidad de Prisma
```

## Decisiones clave del diseño

- **Un solo servidor.** Prisma solo responde en `DISCORD_GUILD_ID` y abandona cualquier otro servidor al que lo inviten. Los comandos se registran en ese servidor (no globales), así que los cambios se ven al instante.
- **Contexto inyectado.** Los comandos reciben un `BotContext` (configuración, logger, registro de comandos) en lugar de importar variables globales. Esto los hace fáciles de testear y deja un punto único para sumar servicios (música, memoria, IA).
- **Fallar rápido.** La configuración se valida al arrancar; un error de configuración corta el proceso con un mensaje claro en lugar de fallar a mitad de camino.
- **Salud sin puertos.** El estado del bot se informa a Docker escribiendo un latido en `/tmp`, sin abrir ningún puerto HTTP.
- **Errores contenidos.** Un comando que falla responde un mensaje amable al usuario y queda registrado en el log; no tumba el bot. Una excepción no capturada sí termina el proceso, porque el estado es desconocido, y Docker lo reinicia limpio.

## Música

El bot no procesa el audio de la música: le pide a **Lavalink** que busque y reproduzca, y Lavalink manda el audio directo a Discord.

```mermaid
sequenceDiagram
    participant U as Usuario
    participant B as Bot
    participant L as Lavalink
    participant D as Discord (voz)

    U->>B: /play consulta
    B->>L: Búsqueda (scsearch o enlace)
    L-->>B: Temas
    B->>B: Agrega a la cola
    B->>D: Entra al canal de voz (gateway)
    D-->>B: Datos de la sesión de voz
    B->>L: Sesión de voz + reproducir
    L->>D: Audio Opus (UDP, cifrado DAVE)
    L-->>B: Eventos (empezó, terminó, error)
    B->>U: Panel "sonando ahora" con botones
```

- La cola vive en memoria, dentro del bot: si el bot se reinicia, la cola se pierde.
- Si Lavalink se reinicia, el bot se reconecta solo cada 10 segundos.
- La contraseña entre el bot y Lavalink es interna: Lavalink no publica ningún puerto.

## Pipeline de voz (diseño previsto para la fase 3)

```mermaid
sequenceDiagram
    participant U as Usuario (voz)
    participant B as Bot
    participant S as Groq Whisper
    participant L as Groq LLM
    participant M as Memoria (pgvector)
    participant T as Piper TTS

    U->>B: Audio Opus (Discord avisa quién habla)
    B->>B: Detecta fin de frase y palabra clave «Prisma»
    B->>S: Audio de la frase
    S-->>B: Texto
    B->>M: Busca recuerdos relevantes
    M-->>B: Contexto
    B->>L: Prompt + contexto (respuesta en streaming)
    L-->>B: Texto por partes
    B->>T: Cada oración apenas está lista
    T-->>B: Audio
    B->>U: Reproduce en el canal
```

La meta de latencia es de 1 a 2 segundos desde que el usuario termina de hablar hasta que Prisma empieza a responder.
