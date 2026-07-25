# AGENTS.md — Guía para Asistentes de IA

## Contexto del Proyecto

**TransPadilla** es un sistema de rastreo de transporte público en tiempo real para **Riohacha, La Guajira, Colombia**. Permite a pasajeros ver buses en vivo, conductores reportar su ubicación y novedades, y administradores gestionar la flota.

---

## Stack Tecnológico

- **Runtime:** Node.js 24 + TypeScript 5
- **Monorepo:** pnpm workspaces
- **Frontend:** React + Vite + Tailwind + Leaflet (mapas) + TanStack Query + Wouter
- **Backend:** Express + Socket.IO (tiempo real)
- **Base de datos:** PostgreSQL vía **Supabase** (local y producción)
- **ORM:** Drizzle ORM
- **Despliegue:** Render (Blueprint) o Docker

---

## Estructura del Monorepo

```
apps/
  web/          → Frontend React (Vite)
  api/          → Backend Express + Socket.IO
packages/
  db/           → Esquema Drizzle + pool PostgreSQL
  api-client/   → Hooks React (GENERADO por orval) ❌ NO editar
  api-types/    → Tipos Zod (GENERADO por orval) ❌ NO editar
  api-spec/     → OpenAPI spec (fuente de verdad)
scripts/        → Scripts auxiliares (.ps1, auditoría)
docs/           → Documentación técnica
```

---

## Reglas Críticas

### 1. Seguridad
- **JWT_SECRET** obligatorio en producción (falla el arranque si falta)
- El registro público SIEMPRE crea rol `pasajero` (nunca admin/conductor)
- Un conductor solo puede operar SU bus (resuelto desde JWT, no del cliente)
- Autorización por rol en backend; frontend solo decide qué mostrar

### 2. Archivos Generados (NO tocar)
- `packages/api-client/` — generado por orval
- `packages/api-types/` — generado por orval
- `packages/db/drizzle/` — migraciones generadas
- `apps/web/android/` — generado por Capacitor

### 3. Convenciones de Código
- Archivos TS/JS: `kebab-case` (ej: `eta-calc.ts`)
- Componentes React: `PascalCase.tsx` (ej: `ConfirmDialog.tsx`)
- Hooks: `use-*` en kebab (ej: `use-elapsed-time.ts`)
- Imports frontend: alias `@/` (ej: `@/components/ui/button`)
- Imports backend: relativos (ej: `../middleware/auth`)
- Sin comentarios en producción (salvo "por qué", no "qué")

### 4. UI de Pasajero
- Mobile-first, mapa protagonista
- TopBar único con badge "EN VIVO"
- Sin BottomBar
- Paneles flotantes dismissibles
- Tokens: `--color-navy`, `--color-blue`, `--color-sky`, `--color-gold`
- Íconos: lucide (sin emoji)
- Referencia: `docs/UI-SKILL.md`

---

## Comandos de Verificación

```bash
# Typecheck frontend
npx tsc -p apps/web/tsconfig.json --noEmit

# Typecheck backend
npx tsc -p apps/api/tsconfig.json --noEmit

# Build completo
pnpm run build:prod

# Tests
pnpm --filter @workspace/api run test

# Backup manual
./scripts/backup-bd.ps1

# Verificar backup
./scripts/verificar-backup.ps1 -Archivo ".\backups\tp_XXXX-XX-XX_XXXX.dump"
```

---

## Variables de Entorno Clave

| Variable | Efecto |
|----------|--------|
| `DATABASE_URL` | Conexión Supabase (SSL automático si host contiene "supabase") |
| `JWT_SECRET` | Obligatorio en prod |
| `SEED_DEMO` | `true` = datos demo, `false` = arranque limpio |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin inicial cuando `SEED_DEMO=false` |

---

## Arquitectura

- **Un solo servicio Node** sirve API + WebSockets + Frontend compilado (mismo dominio, sin CORS)
- ETA calculado en backend con fórmula Haversine
- WebSockets emiten por salas de ruta
- RLS activado en 5 tablas; backend opera como rol `postgres` (bypass RLS)

---

## Más Información

Para detalles profundos de arquitectura y decisiones, consultar:
- `CLAUDE.md` — Referencia completa del proyecto
- `docs/` — Guías específicas (despliegue, seguridad, Supabase, etc.)
