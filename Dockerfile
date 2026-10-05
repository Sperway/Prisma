# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app

# --- Dependencias de producción ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# --- Compilación ---
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# --- Imagen final: solo lo necesario para correr, como usuario sin privilegios ---
FROM base AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "dist/healthcheck.js"]
CMD ["node", "dist/index.js"]
