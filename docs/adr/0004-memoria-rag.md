# 0004 — Aprendizaje con memoria (RAG), no fine-tuning

- **Estado:** Aceptado
- **Fecha:** 2026-10-05

## Contexto

Queremos que Prisma "aprenda" con el grupo: que recuerde a cada persona, los chistes internos, las reglas y la historia del servidor, y que mejore con el uso.

## Decisión

El aprendizaje se implementa como **memoria a largo plazo con búsqueda semántica (RAG)** y no reentrenando el modelo:

- **PostgreSQL + pgvector**, en una instancia propia de Prisma.
- Tipos de memoria: **por usuario** (gustos, apodos), **del servidor** (reglas, eventos, jerga) y **resúmenes** de conversaciones.
- Fuentes: comandos explícitos (`/aprender`, `/olvidar`) y extracción automática de hechos al terminar cada conversación.
- En cada respuesta se recuperan los recuerdos más relevantes y se agregan al contexto del LLM.
- Embeddings calculados **localmente** (modelo multilingüe chico en CPU), gratis y sin enviar datos afuera.
- **Personalidad** editable por los admins, guardada en la base.

## Por qué no fine-tuning

- Es caro, lento y requiere GPU. Cada cosa nueva implicaría reentrenar.
- No se puede "olvidar" un dato puntual de un modelo reentrenado. Con memoria explícita, `/olvidar` lo borra de verdad.
- La memoria funciona con cualquier LLM: si cambiamos de proveedor, Prisma conserva todo lo aprendido.

## Consecuencias

- Hay que diseñar con cuidado qué se guarda automáticamente, para no llenar la memoria de ruido.
- Privacidad: los usuarios pueden ver y borrar sus recuerdos (`/recuerdos`, `/olvidar`).
