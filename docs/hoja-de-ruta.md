# Hoja de ruta

## ✅ Fase 1 — Base

- Proyecto TypeScript con lint, formato, tests y CI
- Configuración validada, logs estructurados, apagado ordenado
- Comandos `/ping`, `/info`, `/ayuda`
- Restricción a un único servidor
- Docker Compose aislado y endurecido para la VPS compartida
- Documentación y ADRs

## 🔜 Fase 2 — Música

- Lavalink v4 como servicio aparte (con límites de memoria)
- Fuentes: YouTube (plugin `youtube-source`), Spotify, SoundCloud y Deezer (LavaSrc)
- Cola, pausa, saltar, volumen, repetir, mezclar
- Panel con botones en el canal
- Salida automática cuando el canal queda vacío

## 🔜 Fase 3 — Voz (prueba de concepto y luego producción)

- Recepción de audio por usuario (incluido el cifrado DAVE de Discord)
- Detección de fin de frase y palabra clave «Prisma»
- Voz a texto con Groq Whisper; respaldo local con whisper.cpp
- Respuesta con LLM de Groq en streaming
- Texto a voz con Piper (local, gratis)
- Convivencia con la música: bajar el volumen mientras Prisma habla
- Aviso y consentimiento en el servidor; comando para no participar

## 🔜 Fase 4 — Cerebro y memoria

- PostgreSQL + pgvector (instancia propia, no la de la VPS)
- Memoria por usuario y del servidor, con búsqueda semántica (RAG)
- `/aprender`, `/olvidar`, `/recuerdos`
- Resúmenes automáticos de conversaciones
- Personalidad configurable por los admins
- Modelo local de respaldo si Groq no responde o se alcanza el límite

## 🔜 Fase 5 — Producción

- Despliegue automatizado (GitHub Actions → VPS)
- Backups de la base de datos
- Métricas y alertas
