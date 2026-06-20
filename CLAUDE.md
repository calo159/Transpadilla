# TransPadilla — Contexto para desarrolladores y asistentes de IA

Sistema de rastreo de transporte público en tiempo real para Riohacha, La Guajira.
Stack: Node 24 + TypeScript 5 (monorepo pnpm) · React + Vite · Express + Socket.IO
· Drizzle ORM · PostgreSQL · Python/Django (microservicio de tráfico).

---

## Estructura del monorepo

```
apps/
  web/          Frontend React (Vite + Tailwind + Leaflet + TanStack Query + Wouter)
  api/          Backend Express + Socket.IO (serve API + sirve el frontend en prod)
packages/
  db/           Esquema Drizzle ORM + pool PostgreSQL — compartido por api y django
  api-client/   Hooks React generados con orval (useGetBuses, useUpdateGps…)
  api-types/    Tipos Zod generados con orval
  api-spec/     OpenAPI spec + orval.config.ts (fuente de verdad del API)
services/
  trafico/      Microservicio Python/Django: clasificación de tráfico + ETA (Haversine)
scripts/        post-merge.sh (hook git) + @workspace/scripts (placeholder)
docs/           Guías de despliegue, propuesta alcaldía, Capacitor Android
```

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

# Django (tráfico) — solo la primera vez:
./configurar-trafico.ps1
# Luego initiar.ps1 lo levanta solo
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

# Django
cd services/trafico && python manage.py check
```

---

## Decisiones de arquitectura

- **apps/** agrupa los entregables desplegables (ejecutables); **packages/** agrupa
  las librerías internas reutilizables; **services/** agrupa los microservicios externos.
- El API Node sirve también el frontend compilado en producción (un solo dominio, sin CORS).
- Django no gestiona su propia base — lee las tablas de Node con `managed = False`.
- Los hooks React (`api-client`) se generan desde el OpenAPI spec con orval; no se
  escriben a mano.
- Seguridad en producción: JWT_SECRET obligatorio (falla el arranque si no está),
  rate-limit en login, helmet, validación de entradas propia (sin zod en el servidor).
- PWA con auto-update + Wake Lock en el conductor para GPS continuo sin pantalla apagada.

---

## Variables de entorno críticas

| Variable | Dónde | Efecto |
|----------|-------|--------|
| `DATABASE_URL` | api + django | Conexión PostgreSQL |
| `JWT_SECRET` | api | **Obligatorio en prod** — falla el arranque si falta |
| `SEED_DEMO` | api | `false` → arranque limpio (solo admin); `true` → datos demo |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | api | Admin inicial cuando `SEED_DEMO=false` |
| `TRAFICO_URL` | api | URL del microservicio Django |
| `VITE_MAP_TILES_URL` | web (build) | Proveedor de mapa (OSM por defecto) |

---

## Despliegue

- **Render** → `render.yaml` (Blueprint). Servicios: `transpadilla-web` (Node),
  `transpadilla-trafico` (Django), `transpadilla-db` (PostgreSQL).
- **VPS propio** → `docker-compose.yml` + `Dockerfile` + `services/trafico/Dockerfile`.
- **App Android nativa** → `apps/web/capacitor.config.ts` + ver `docs/CAPACITOR-ANDROID.md`.
