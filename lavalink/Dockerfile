# Imagen oficial de Lavalink con nuestra configuración incluida.
FROM ghcr.io/lavalink-devs/lavalink:4.2.2

# La carpeta de plugins tiene que existir en la imagen (con el usuario lavalink como dueño)
# para que el volumen que se monta encima herede esos permisos.
RUN mkdir -p /opt/Lavalink/plugins

COPY --chown=lavalink:lavalink application.yml /opt/Lavalink/application.yml

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD ["bash", "-c", "echo > /dev/tcp/127.0.0.1/2333"]
