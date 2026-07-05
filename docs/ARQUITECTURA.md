# Arquitectura de TransPadilla

## Stack tecnológico

```
Frontend          React 19 + Vite + Tailwind CSS 4 + TanStack Query + Wouter + Leaflet
Backend           Express + Socket.IO + helmet-lite
Base de datos     PostgreSQL 17 + Supabase (Session pooler)
ORM               Drizzle ORM
Lenguaje          TypeScript 5 + Node 24
Monorepo          pnpm workspaces 9
Cliente API       orval (genera hooks desde OpenAPI)
Despliegue        Render (Blueprint) · VPS (Docker Compose) · Android (Capacitor)
```

## Flujo de datos

```
┌──────────────────────────────────────────────────────────────────────┐
│                        packages/api-spec/                            │
│                    openapi.yaml + orval.config.ts                     │
│                          (fuente de verdad del API)                   │
└──────────┬───────────────────────────────────────────────────────────┘
           │ orval generate
           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  packages/api-client │    │  packages/api-types   │
│  Hooks React (orval) │    │  Tipos Zod (orval)    │
│  useGetBuses, etc.   │    │  z.BusSchema, etc.    │
└──────────┬───────────┘    └──────────┬────────────┘
           │ importa                    │ importa
           ▼                            ▼
┌───────────────────────────────────────────────────┐
│                   apps/web/                        │
│  Páginas → Componentes → Hooks → Llaman a api     │
│  Pasajero.tsx, Conductor.tsx, Admin.tsx           │
│  lib/api.ts (fetch wrapper)                       │
└───────────────────┬───────────────────────────────┘
                    │ HTTP (JSON) + WebSocket (Socket.IO)
                    ▼
┌───────────────────────────────────────────────────┐
│                   apps/api/                        │
│                                                    │
│  index.ts → app.ts →                               │
│    ├── middleware/                                  │
│    │   ├── auth.ts           (JWT verification)     │
│    │   ├── rate-limit.ts     (por IP/ruta)          │
│    │   ├── validate.ts       (Zod schemas)          │
│    │   └── bus-autorizado.ts (conductor → su bus)   │
│    │                                                │
│    ├── routes/                                      │
│    │   ├── index.ts          (router principal)     │
│    │   ├── auth.ts           (login, register, etc) │
│    │   ├── buses.ts          (CRUD + GPS)           │
│    │   ├── rutas.ts          (CRUD rutas)           │
│    │   ├── eta.ts            (cálculo ETA)          │
│    │   ├── stats.ts          (estadísticas)         │
│    │   ├── conductores.ts    (admin)                │
│    │   ├── paradas.ts                              │
│    │   ├── favoritos.ts                            │
│    │   ├── reportes.ts                             │
│    │   ├── push.ts           (Web Push)             │
│    │   ├── metrics.ts        (métricas internas)   │
│    │   ├── auditoria.ts                            │
│    │   ├── health.ts         (health check)        │
│    │   └── seed.ts           (solo admin)          │
│    │                                                │
│    └── lib/                                         │
│        ├── geo.ts            (Haversine, distancia) │
│        ├── eta-calc.ts       (cálculo ETA)          │
│        ├── cache.ts          (en memoria)           │
│        ├── socket.ts         (WebSocket manager)    │
│        ├── seed.ts           (datos iniciales)      │
│        ├── push.ts           (notificaciones)       │
│        ├── metrics.ts        (prometheus-style)     │
│        ├── logger.ts                                │
│        └── ...                                      │
└───────────────────┬───────────────────────────────┘
                    │ Drizzle ORM
                    ▼
┌───────────────────────────────────────────────────┐
│                 packages/db/                       │
│  src/schema/index.ts (tablas Drizzle)              │
│  src/index.ts       (pool + conexión)              │
│  src/migrate.ts     (migraciones)                  │
│  rls.sql            (Row Level Security)           │
│  drizzle/           (migraciones generadas)        │
└───────────────────┬───────────────────────────────┘
                    │ PostgreSQL (SSL si Supabase)
                    ▼
┌───────────────────────────────────────────────────┐
│                 PostgreSQL 17                       │
│  Tablas: buses, rutas, paradas, usuarios,          │
│          favoritos, novedades, ocupaciones,         │
│          auditoria, metricas, push_subs            │
│  RLS: FORCE en todas las tablas                    │
└───────────────────────────────────────────────────┘
```

## Flujo en tiempo real (GPS)

```
Conductor (app web)
  │ POST /api/buses/gps { lat, lng, rumbo, velocidad }
  ▼
apps/api/src/routes/buses.ts
  │ Valida JWT → resuelve busAutorizado
  │ Actualiza ubicación en DB
  │ Emite vía Socket.IO a sala "mapa"
  ▼
Pasajeros (apps/web - Pasajero.tsx)
  │ Socket.IO listener "bus:gps" → actualiza marcador en Leaflet
```

## Decisiones arquitectónicas clave

1. **Un solo servicio Node** — API + WebSockets + ETA + frontend estático en producción. Sin microservicios, sin CORS en prod.
2. **apps/ vs packages/** — `apps/` son desplegables (tienen `start`), `packages/` son librerías internas.
3. **API-first** — La fuente de verdad es `packages/api-spec/openapi.yaml`. orval genera clientes y tipos automáticamente.
4. **Autorización estricta** — El backend nunca confía en el `bus_id` del cliente. Se resuelve desde el JWT.
5. **Base de datos única** — Supabase tanto en local como en producción. RLS forzado pero el backend opera con rol `postgres` (bypass RLS).
6. **Sin secretos en el repo** — `.env` en `.gitignore`. Render usa `sync:false` para DATABASE_URL y JWT_SECRET.

## Rutas de despliegue

```
Render (producción):
  render.yaml → Blueprint → transpadilla-web (Node)
  DATABASE_URL = Session pooler de Supabase (IPv4 obligatorio)

VPS propio:
  docker-compose.yml → PostgreSQL + contenedor web
  Proxy reverso (Caddy/Nginx) para HTTPS

Android:
  apps/web/capacitor.config.ts → Capacitor build → APK
```
