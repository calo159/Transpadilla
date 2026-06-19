# ── Servicio web (Node: API + Socket.IO + frontend) ──────────────────────────
# Imagen para auto-hospedaje en un VPS (alternativa a los servicios de Render).
# Construye el frontend y el api-server, y sirve todo desde un solo contenedor.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
# Copiamos todo el monorepo (el build necesita lib/* y artifacts/*).
COPY . .
RUN pnpm install --no-frozen-lockfile --prod=false
RUN pnpm run build:prod

FROM node:22-slim AS run
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
# Copiamos el repo ya construido (incluye node_modules y los dist/).
COPY --from=build /app ./
EXPOSE 8080
# El servidor crea las tablas y arranca. DATABASE_URL, JWT_SECRET y TRAFICO_URL
# se inyectan por entorno (ver docker-compose.yml).
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
