# @workspace/api — Backend

Un **único servicio Node** (Express + Socket.IO) que expone la API REST, el tiempo real
por WebSockets, el cálculo de ETA y —en producción— sirve el frontend ya construido
(mismo dominio, sin CORS). Se empaqueta con esbuild a `dist/index.mjs`.

## Estructura
```
src/
  index.ts        Arranque: BD, Socket.IO, job de historial, apagado ordenado
  app.ts          Express: CSP/seguridad, CORS, rate-limit, monta /api, sirve el front
  routes/         Endpoints por recurso:
                    buses.ts     GPS, ocupación, novedad (emite por sala ruta_<id>)
                    rutas.ts, paradas.ts, conductores.ts, auth.ts
                    eta.ts       ETA por parada (cacheado por ruta)
                    reportes.ts  km/ocupación desde el historial (solo admin)
                    stats.ts, health.ts, seed.ts
  middleware/     auth (JWT + requireRol), bus-autorizado, rate-limit, validate
  lib/            socket (salas), historial (snapshot), init-db (esquema idempotente),
                  eta-calc, geo (Haversine), cache (TTL), sentry, logger
test/             Vitest + Supertest (integración corre si hay DATABASE_URL)
```

## Scripts
```bash
pnpm --filter @workspace/api run dev    # build + ejecuta (NO es watch; reinícialo)
pnpm --filter @workspace/api run start  # ejecuta el bundle ya construido
pnpm --filter @workspace/api run build  # esbuild → dist/
pnpm --filter @workspace/api run test
```

## Claves
- **Toda la autorización vive aquí** (el frontend solo decide qué mostrar). El `bus_id`
  de las operaciones del conductor se resuelve del JWT (`bus-autorizado`), nunca del cliente.
- El esquema se crea solo al arrancar (`lib/init-db.ts`, idempotente) — no se usa
  `drizzle push` en producción.
- La posición del bus se difunde **solo a la sala de su ruta** (`emitirSeguro(..., 'ruta_'+id)`)
  para escalar; ver [CLAUDE.md](../../CLAUDE.md).
- Variables de entorno: ver [`.env.example`](../../.env.example).
