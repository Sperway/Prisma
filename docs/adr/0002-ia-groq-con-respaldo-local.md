# 0002 — IA gratuita: Groq con respaldo local

- **Estado:** Aceptado
- **Fecha:** 2026-10-05

## Contexto

La IA de voz necesita tres piezas: voz a texto (STT), un modelo de lenguaje (LLM) y texto a voz (TTS). Requisito: **costo cero**. La VPS no tiene GPU y su CPU está compartida con un proyecto crítico, así que correr un LLM local de calidad daría respuestas de 4 a 8 segundos y además le quitaría CPU a Sperway.

## Decisión

| Pieza | Principal                              | Respaldo                                    |
| ----- | -------------------------------------- | ------------------------------------------- |
| STT   | Groq Whisper (plan gratuito)           | whisper.cpp local (modelo chico)            |
| LLM   | Groq, modelos abiertos (plan gratuito) | Modelo local de unos 3-4B con límite de CPU |
| TTS   | Piper (local)                          | —                                           |

- Cada pieza se implementa detrás de una **interfaz de proveedor** (`SpeechToText`, `LanguageModel`, `TextToSpeech`). Cambiar de proveedor (Gemini, un modelo local o uno pago como Claude) es cuestión de configuración.
- Si Groq falla o se llega al límite de uso, el bot pasa automáticamente al respaldo local y avisa en el log.

## Consecuencias

- Latencia esperada de 1 a 2 segundos con Groq. Con el respaldo local la experiencia es más lenta, pero el bot no se queda mudo.
- Los límites del plan gratuito pueden cambiar sin aviso; la abstracción de proveedores reduce ese riesgo.
- El audio y el texto de las conversaciones pasan por los servidores de Groq. Hay que informarlo en el servidor de Discord.
- La memoria del bot es nuestra (ver ADR 0004): no depende de ningún proveedor.
