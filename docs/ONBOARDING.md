# Onboarding — Empieza aquí 👋

Guía rápida para que un desarrollador entienda y arranque TransPadilla. Léela después
del [README](../README.md); para el detalle profundo de arquitectura y decisiones,
ve a [CLAUDE.md](../CLAUDE.md).

---

## 1. Qué es (en 30 segundos)

Sistema de rastreo de buses en tiempo real para Riohacha. Un **único servicio Node**
(Express + Socket.IO) expone la API, el tiempo real y el ETA, y sirve el frontend React.
La base de datos es **PostgreSQL en Supabase**. Tres vistas: **Pasajero** (público),
**Conductor** (transmite GPS) y **Admin** (gestiona la flota y ve reportes).

---

## 2. Qué leer y en qué orden

1. [README.md](../README.md) — visión general, features, cómo correr.
2. **Este archivo** — mapa mental, flujos y cómo añadir cosas.
3. README de cada paquete (`apps/web`, `apps/api`, `packages/*`).
4. [CLAUDE.md](../CLAUDE.md) — arquitectura, seguridad y decisiones a fondo.
5. Guías por tema en `docs/`: SUPABASE, SEGURIDAD, DESPLIEGUE-PRODUCCION, MAPA,
   CLOUDFLARE, CAPACITOR-ANDROID, UI-SKILL.

---

## 3. Arrancar en local

Necesitas **Node 24** y **pnpm 9**. Una base PostgreSQL local **o** una de Supabase.

```bash
pnpm install
cp .env.example .env                      # edita DATABASE_URL y JWT_SECRET
pnpm --filter @workspace/db push          # crea las tablas (solo desarrollo)
pnpm --filter @workspace/api run dev      # API en :8080
pnpm --filter @workspace/web run dev      # frontend en :5173
# Datos demo (con el API arriba):  curl -X POST http://localhost:8080/api/seed
```
En Windows: `./scripts/iniciar.ps1` arranca ambos. Cuentas demo en el README.

---

## 4. Mapa de carpetas (comentado)

```
apps/web      Frontend. Empieza por src/pages/Pasajero.tsx (la vista pública).
apps/api      Backend. Empieza por src/index.ts → src/app.ts → src/routes/.
packages/db   Tablas (Drizzle) + pool + rls.sql.
packages/api-spec     openapi.yaml = CONTRATO. De aquí se generan los dos de abajo.
packages/api-client   Hooks React generados (no editar a mano).
packages/api-types    Tipos Zod generados (no editar a mano).
docs/         Guías por tema. render.yaml = despliegue. CLAUDE.md = arquitectura.
```

---

## 5. Cómo fluye una petición

**Pasajero viendo el mapa:**
`Pasajero.tsx` pide buses/rutas con hooks de `api-client` → `apps/api` (`routes/buses.ts`,
cacheado 2 s) → BD. Para el movimiento en vivo, el cliente abre un **Socket.IO** y se
suscribe a `ruta_<id>`; recibe `bus:ubicacion` solo de esa ruta.

**Conductor transmitiendo GPS:**
`Conductor.tsx` envía `POST /api/buses/gps` → `routes/buses.ts` valida con el JWT a qué
bus puede operar (`middleware/bus-autorizado`), actualiza la BD y **emite a la sala de la
ruta** (`lib/socket.ts`). Los pasajeros de esa ruta lo ven moverse al instante.

**Reportes (admin):** un job (`lib/historial.ts`) guarda una foto de posiciones cada ~60 s;
`routes/reportes.ts` calcula km/ocupación y `ReportesTab.tsx` los grafica.

---

## 6. Cómo añadir una feature

- **Nuevo endpoint con tipos/hook:** edita `packages/api-spec/openapi.yaml` →
  `pnpm --filter @workspace/api-spec run codegen` → implementa en `apps/api/src/routes/`
  → úsalo en el front con el hook generado.
- **Endpoint simple sin spec:** impleméntalo en `routes/` y consúmelo con `apiFetch`
  (`apps/web/src/lib/api.ts`), como hacen `/reportes/*`, login y el ETA.
- **Cambio de tabla:** edita `packages/db/src/schema/index.ts` **y** el SQL idempotente de
  `apps/api/src/lib/init-db.ts` (así se crea sola al arrancar).

---

## 7. Convenciones

- **TypeScript estricto**; nada de `any` (usa `unknown` + narrowing).
- **Toda la autorización en el backend** (el front solo decide qué mostrar).
- **UI de Pasajero** sigue [UI-SKILL.md](UI-SKILL.md): tokens `--color-navy/blue/sky/gold`,
  íconos lucide (sin emoji), paneles flotantes.
- **Sin secretos en el repo**: `.env` y `.mcp.json` están en `.gitignore`. Nunca commitees
  llaves ni contraseñas.
- Antes de commitear: `pnpm run typecheck` y `pnpm run test`.

---

## 8. Verificar (smoke test)

```bash
pnpm run typecheck      # tipos de libs + apps
pnpm run build:prod     # build de web + api
pnpm run test           # unitarias (+ integración si hay DATABASE_URL)
```
CI corre lo mismo en cada push (con un Postgres de servicio) — ver `.github/workflows/ci.yml`.
