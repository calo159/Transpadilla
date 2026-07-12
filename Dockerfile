# ── Servicio web (Node: API + Socket.IO + frontend) ──────────────────────────
# Imagen para auto-hospedaje en un VPS (alternativa a los servicios de Render).
# Construye el frontend y el api-server, y sirve todo desde un solo contenedor.

# Node 24 (alineado con CI y CLAUDE.md — antes esta imagen usaba 22, distinto al
# resto del proyecto) pineado a DIGEST (no a tag mutable): reproducibilidad del
# build. Para actualizar: `docker manifest inspect node:24-slim` y reemplazar el
# sha256 (o dejar que Dependabot/Renovate lo proponga si se configura para Docker).
FROM node:24-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5 AS build
WORKDIR /app
RUN corepack enable
# Copiamos todo el monorepo (el build necesita packages/* y apps/*).
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm run build:prod

FROM node:24-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5 AS run
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
# Copiamos el repo ya construido (incluye node_modules y los dist/), con
# ownership del usuario no-root "node" (viene incluido en la imagen base).
COPY --from=build --chown=node:node /app ./
# No correr como root dentro del contenedor: reduce el impacto de un RCE.
USER node
EXPOSE 8080
# El servidor crea las tablas y arranca. DATABASE_URL y JWT_SECRET se inyectan
# por entorno (ver docker-compose.yml).
CMD ["pnpm", "--filter", "@workspace/api", "start"]
