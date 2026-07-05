# TransPadilla — Contexto para desarrolladores y asistentes de IA

Sistema de rastreo de transporte público en tiempo real para Riohacha, La Guajira.
Stack: Node 24 + TypeScript 5 (monorepo pnpm) · React + Vite · Express + Socket.IO
· Drizzle ORM · PostgreSQL (**Supabase** en local y producción). **Un solo servicio
Node** (API + WebSockets + ETA + frontend); sin microservicios externos.

---

## Estructura del monorepo

```
apps/                          ← Desplegables (ejecutables)
  web/          Frontend React (Vite + Tailwind + Leaflet + TanStack Query + Wouter)
  api/          Backend Express + Socket.IO (serve API + sirve el frontend en prod)
packages/                      ← Librerías internas reutilizables
  db/           Esquema Drizzle ORM + pool PostgreSQL
  api-client/   Hooks React generados con orval (useGetBuses, useUpdateGps…)
  api-types/    Tipos Zod generados con orval
  api-spec/     OpenAPI spec + orval.config.ts (fuente de verdad del API)
scripts/                       ← Scripts de utilidad (arranque, auditoría, hooks git)
docs/                          ← Guías de despliegue, seguridad, Capacitor, mapa, etc.
tests/                         ← Pruebas de carga y rendimiento
  load/           Escenarios Artillery + reportes
.github/workflows/             ← CI + ZAP security scan
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
./scripts/iniciar.ps1

# O manualmente:
pnpm --filter @workspace/api run dev     # API en :8080
pnpm --filter @workspace/web run dev     # Frontend en :5173
```

**Cuentas demo** (solo si `SEED_DEMO=true` y la DB está vacía, **nunca en producción**):
credenciales exactas en `apps/api/src/lib/seed.ts` (no se repiten aquí para no quedar
destacadas en texto plano en un repo público).
⚠️ La Supabase actual usa `SEED_DEMO=false` y ya tiene un admin real (no demo) — esas
credenciales no existen ahí.

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

# Load test (Artillery)
pnpm run load-test                        # 5000 requests
pnpm run load-test:report                 # con reporte HTML

# Auditoría de seguridad remota
node scripts/security-audit.js            # contra Render
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
  - **CSP** a medida en `apps/api/src/app.ts` (helmet-lite) + `Cross-Origin-Resource-Policy`.
    `script-src 'self'` (el build de Vite no emite inline). Sobreescribible con la env
    `CSP`; en prod añade `upgrade-insecure-requests`. Si tocas recursos externos del
    frontend (fuentes, tiles, CDNs) actualiza también la CSP o se bloquearán.
- **UI de la vista Pasajero** sigue el estándar en `docs/UI-SKILL.md` (mobile-first, mapa protagonista, TopBar único con badge EN VIVO, sin BottomBar, paneles flotantes dismissibles, tokens `--color-navy/blue/sky/gold`, íconos lucide — sin emoji, sin tráfico/Django). Leerlo antes de tocar `apps/web/src/pages/Pasajero.tsx`.
- PWA con auto-update + Wake Lock en el conductor para GPS continuo sin pantalla apagada.
- Pruebas: Vitest + Supertest en `apps/api/test/` (unitarias + integración con DB);
  CI en `.github/workflows/ci.yml`.

---

## Reglas de organización del proyecto

### ¿Qué va en cada carpeta?
- **`apps/`** — Solo entregables desplegables (tienen `package.json` con scripts `start`/`dev`/`build`).
  - `apps/api/` — Backend Express. Organizado en: `routes/` (endpoints REST), `middleware/` (auth, rate-limit, validación), `lib/` (lógica de negocio), `test/` (tests Vitest).
  - `apps/web/` — Frontend React. Organizado en: `pages/` (vistas completas), `components/` (componentes reutilizables), `hooks/` (custom hooks), `lib/` (utilidades).
    - `components/ui/` — Componentes base (shadcn/ui). NO tocar generación de orval.
    - `components/pasajero/` — Componentes específicos de la vista pasajero.
    - `pages/admin/` — Cada tab del dashboard admin en un archivo separado.
- **`packages/`** — Librerías internas. NO tienen `start`, solo `build`.
  - `packages/db/` — Único punto de acceso a la BD (pool + schema Drizzle + migraciones + RLS).
  - `packages/api-client/` — **Generado por orval.** NO editar a mano.
  - `packages/api-types/` — **Generado por orval.** NO editar a mano.
  - `packages/api-spec/` — Fuente de verdad del API: `openapi.yaml` + `orval.config.ts`.
- **`scripts/`** — Scripts auxiliares (arranque local `.ps1`, auditoría de seguridad, hooks git).
- **`tests/`** — Pruebas de carga y rendimiento (Artillery).
- **`docs/`** — Documentación técnica. Leer `docs/UI-SKILL.md` antes de tocar la vista Pasajero.
- **`.github/workflows/`** — CI (typecheck + build + test + audit) + ZAP security scan.

### Convenciones de nombres
| Tipo | Convención | Ejemplo |
|------|-----------|---------|
| Archivos TS/JS | `kebab-case` | `eta-calc.ts`, `rate-limit.ts` |
| Componentes React | `PascalCase.tsx` | `ConfirmDialog.tsx` |
| Hooks | `use-*` en kebab | `use-elapsed-time.ts` |
| Tests | `*.test.ts` / `*.test.tsx` | `geo.test.ts` |
| Carpetas | `kebab-case` | `api-client/`, `load/` |

### Lo que NO debes modificar
- ❌ `packages/api-client/` — generado por orval desde `packages/api-spec/openapi.yaml`
- ❌ `packages/api-types/` — generado por orval
- ❌ `packages/db/drizzle/` — migraciones generadas
- ❌ `apps/web/src/components/ui/` — componentes shadcn/base (salvo que se necesite un estilo nuevo deliberadamente)
- ❌ `dist/`, `node_modules/`, `*.tsbuildinfo` — generados
- ❌ `apps/web/android/` — generado por Capacitor

### Flujo de generación de código
```
packages/api-spec/openapi.yaml
  → orval (npm run gen en api-spec/)
    → packages/api-client/ (hooks React con TanStack Query)
    → packages/api-types/ (tipos Zod)
```
Para regenerar: `pnpm --filter @workspace/api-spec run gen`

### Estilo de código
- Sin comentarios en código de producción (salvo que expliquen un "por qué", no un "qué")
- Imports con alias `@/` en apps/web (ej: `import { Button } from "@/components/ui/button"`)
- Imports relativos en apps/api (ej: `import { auth } from "../middleware/auth"`)
- Nombres de archivos en kebab-case
- Componentes React tipados con TypeScript

---

## Variables de entorno críticas

| Variable | Dónde | Efecto |
|----------|-------|--------|
| `DATABASE_URL` | api + db | Conexión PostgreSQL/Supabase. El pool activa **SSL automáticamente** si el host contiene `supabase` o la URL trae `sslmode` (`packages/db/src/index.ts` y `drizzle.config.ts`) |
| `CSP` | api | Sobreescribe la Content-Security-Policy por defecto. **No definir en Render** (perdería `upgrade-insecure-requests`) |
| `JWT_SECRET` | api | **Obligatorio en prod** — falla el arranque si falta |
| `SEED_DEMO` | api | `false` → arranque limpio (solo admin); `true` → datos demo |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | api | Admin inicial cuando `SEED_DEMO=false` |
| `VITE_MAP_TILES_URL` | web (build) | Proveedor de mapa (OSM por defecto) |

---

## Base de datos — Supabase + RLS

- La DB de local **y** producción es un único proyecto **Supabase**. `DATABASE_URL`
  apunta ahí en los `.env` (local) y en Render (prod, cadena del **Session pooler**,
  host `...pooler.supabase.com` — la conexión directa `db.<ref>.supabase.co` es IPv6
  y **falla en Render**).
- **RLS activado** (FORCE) en las 5 tablas vía `packages/db/rls.sql` (idempotente).
  El backend conecta como rol `postgres` (`rolbypassrls=true`) → opera normal pese a
  FORCE. Guía completa en `docs/SUPABASE.md`.
- ⚠️ **Trampa de `.env` duplicados:** existen `.env` en la raíz, en `apps/api/` y en
  `packages/db/`. `drizzle-kit` (al hacer `push`) **auto-carga `packages/db/.env`** y
  tiene prioridad sobre el de la raíz. Mantén `DATABASE_URL` consistente en los tres o
  el `push`/arranque apuntará a la base equivocada. Los tres están en `.gitignore`.
- `pnpm --filter @workspace/db run push` aplica el esquema; corre `rls.sql` aparte
  (SQL Editor de Supabase o `psql -f`).

## Despliegue

- **Render** → `render.yaml` (Blueprint). Un solo servicio web `transpadilla-web` (Node).
  Ya **no** crea Postgres en Render; `DATABASE_URL` es `sync:false` → la pones a mano con
  la cadena del pooler de Supabase. Deploy automático al hacer push a `main`
  (repo `calo159/Transpadilla`). En vivo: https://transpadilla-web.onrender.com
- **VPS propio** → `docker-compose.yml` + `Dockerfile` (un solo contenedor web + db).
- **App Android nativa** → `apps/web/capacitor.config.ts` + ver `docs/CAPACITOR-ANDROID.md`.

> Nota: el script `dev` de `apps/api` hace `build` + ejecuta el bundle (no es watch);
> reinícialo para ver cambios. No deja proceso colgado salvo que se mate mal el puerto 8080.
