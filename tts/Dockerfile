# Servicio de texto a voz de Prisma: Piper + ffmpeg (para entregar Ogg Opus a 48 kHz).
FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir piper-tts==1.8.0

# La voz se descarga al construir la imagen: el servicio arranca sin depender de internet.
ARG PIPER_VOICE=es_AR-daniela-high
ENV PIPER_VOICE=${PIPER_VOICE} \
    PIPER_VOICES_DIR=/voices \
    PYTHONUNBUFFERED=1
RUN mkdir /voices && python -m piper.download_voices "${PIPER_VOICE}" --data-dir /voices

COPY server.py /app/server.py
USER nobody
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=3)"]
CMD ["python", "/app/server.py"]
