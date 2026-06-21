# TransPadilla — Contexto para desarrolladores y asistentes de IA

Sistema de rastreo de transporte público en tiempo real para Riohacha, La Guajira.
Stack: Node 24 + TypeScript 5 (monorepo pnpm) · React + Vite · Express + Socket.IO
· Drizzle ORM · PostgreSQL. **Un solo servicio Node** (API + WebSockets + ETA +
frontend); sin microservicios externos.

---

## Estructura del monorepo

```
apps/
  web/          Frontend React (Vite + Tailwind + Leaflet + TanStack Query + Wouter)
  api/          Backend Express + Socket.IO (serve API + sirve el frontend en prod)
packages/
  db/           Esquema Drizzle ORM + pool PostgreSQL
  api-client/   Hooks React generados con orval (useGetBuses, useUpdateGps…)
  api-types/    Tipos Zod generados con orval
  api-spec/     OpenAPI spec + orval.config.ts (fuente de verdad del API)
scripts/        post-merge.sh (hook git) + @workspace/scripts (placeholder)
docs/           Guías de despliegue, propuesta alcaldía, Capacitor Android
.github/        Workflow de CI (typecheck, build, test, audit)
```

El ETA del próximo bus se calcula en el backend Node (`apps/api/src/routes/eta.ts`
+ `lib/geo.ts`, Haversine), expuesto en `GET /rutas/:id/eta`.

**Nombres de paquetes pnpm:**
- `@workspace/web` — apps/web
- `@workspace/api` — apps/api
- `@workspace/db` — packages/db
- `@workspace/api-client` — packages/api-client
- `@workspace/api-types` — packages/api-types

---

## Cómo arrancar en local (Windows)

```powershell
# Arrancar todo de una vez
./iniciar.ps1

# O manualmente:
pnpm --filter @workspace/api run dev     # API en :8080
pnpm --filter @workspace/web run dev     # Frontend en :5173
```

**Cuentas demo:** admin@transpadilla.co / admin123  ·  conductor@transpadilla.co / conductor123

---

## Comandos de verificación (correr antes de commitear)

```bash
# Typecheck frontend
npx tsc -p apps/web/tsconfig.json --noEmit

# Typecheck backend
npx tsc -p apps/api/tsconfig.json --noEmit

# Build de producción completo
pnpm run build:prod

# Pruebas (unitarias siempre; integración si hay DATABASE_URL)
pnpm --filter @workspace/api run test
```

---

## Decisiones de arquitectura

- **apps/** agrupa los entregables desplegables (ejecutables); **packages/** agrupa
  las librerías internas reutilizables.
- El API Node sirve también el frontend compilado en producción (un solo dominio, sin CORS)
  y calcula el ETA del próximo bus — no hay servicios externos.
- Los hooks React (`api-client`) se generan desde el OpenAPI spec con orval; no se
  escriben a mano.
- **Toda la autorización vive en el backend** (el frontend solo decide qué mostrar):
  - JWT_SECRET obligatorio en prod (falla el arranque si no está); rate-limit en
    login y registro; cabeceras de seguridad (helmet-lite); validación de entradas propia.
  - El registro público SIEMPRE crea rol `pasajero` (el `rol` del cliente se ignora):
    nadie puede auto-otorgarse permisos. Los conductores solo los crea un admin
    autenticado vía `POST /conductores`.
  - Un conductor solo puede operar SU bus: el `bus_id` de GPS/novedad/ocupación/
    finalizar se resuelve en el servidor desde su JWT (`busAutorizado`), nunca se
    confía en el `bus_id` que mande el cliente. Evita IDOR/suplantación entre buses.
  - Las mutaciones de rutas/paradas/buses requieren `requireRol("admin")`; las
    lecturas del mapa (buses, rutas, stats, eta) son públicas a propósito.
  - Cambio de contraseña self-service: `POST /auth/cambiar-password` verifica la
    clave actual antes de aplicar la nueva.
- PWA con auto-update + Wake Lock en el conductor para GPS continuo sin pantalla apagada.
- Pruebas: Vitest + Supertest en `apps/api/test/` (unitarias + integración con DB);
  CI en `.github/workflows/ci.yml`.

---

## Variables de entorno críticas

| Variable | Dónde | Efecto |
|----------|-------|--------|
| `DATABASE_URL` | api | Conexión PostgreSQL |
| `JWT_SECRET` | api | **Obligatorio en prod** — falla el arranque si falta |
| `SEED_DEMO` | api | `false` → arranque limpio (solo admin); `true` → datos demo |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | api | Admin inicial cuando `SEED_DEMO=false` |
| `VITE_MAP_TILES_URL` | web (build) | Proveedor de mapa (OSM por defecto) |

---

## Despliegue

- **Render** → `render.yaml` (Blueprint). Servicios: `transpadilla-web` (Node),
  `transpadilla-db` (PostgreSQL).
- **VPS propio** → `docker-compose.yml` + `Dockerfile` (un solo contenedor web + db).
- **App Android nativa** → `apps/web/capacitor.config.ts` + ver `docs/CAPACITOR-ANDROID.md`.
