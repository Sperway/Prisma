# Imagen oficial de Lavalink con nuestra configuración incluida.
FROM ghcr.io/lavalink-devs/lavalink:4.2.2

COPY --chown=lavalink:lavalink application.yml /opt/Lavalink/application.yml

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD ["bash", "-c", "echo > /dev/tcp/127.0.0.1/2333"]
