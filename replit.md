# TRANSPADILLA

Sistema de seguimiento de transporte público en tiempo real para Riohacha, La Guajira, Colombia.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api` and `/socket.io`)
- `pnpm --filter @workspace/transpadilla run dev` — run the frontend (port 26134, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET`, `JWT_SECRET` (defaults to `transpadilla_clave_secreta_2026_guajira`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Socket.IO 4
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (jsonwebtoken) + bcryptjs
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Leaflet + TanStack Query + Wouter + shadcn/ui

## Where things live

- `lib/db/src/schema/index.ts` — DB schema (usuarios, rutas, paradas, ruta_paradas, buses)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-client-react/src/generated/` — Generated React Query hooks (do not edit manually)
- `lib/api-zod/src/generated/` — Generated Zod schemas (do not edit manually)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, buses, rutas, stats, seed)
- `artifacts/api-server/src/lib/socket.ts` — Socket.IO singleton
- `artifacts/transpadilla/src/pages/` — Frontend pages (Login, Pasajero, Conductor, Admin)
- `artifacts/transpadilla/src/lib/auth.ts` — Token/user localStorage helpers
- `artifacts/transpadilla/src/lib/routing.ts` — OSRM street routing helper

## Architecture decisions

- Socket.IO path `/socket.io` is explicitly listed in `artifacts/api-server/.replit-artifact/artifact.toml` paths array alongside `/api` so the reverse proxy forwards WS connections.
- JWT stored in localStorage under key `transpadilla_token`; user JSON under `transpadilla_user`.
- `setAuthTokenGetter` from `@workspace/api-client-react` called in `App.tsx` so all generated hooks send the Bearer token automatically.
- `fetchStreetRoute` in `lib/routing.ts` calls OSRM public API for street-level polylines with graceful fallback to straight-line segments.
- Single dark theme (no light mode) applied globally via CSS custom properties in `index.css`.

## Product

Three roles with distinct views:
- **Pasajero** — full-screen Leaflet map showing all bus routes (color-coded polylines via OSRM), stop markers, and live bus positions updated via Socket.IO. Sidebar lets passengers filter by route.
- **Conductor** — GPS transmitter panel. Select a bus, toggle real/simulated GPS, start/stop journey, report incidents. Updates transmitted to all Pasajero clients in real time.
- **Admin** — Dashboard + full CRUD for routes, buses, and stops. Live stats, fleet status, incident feed.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run codegen after any OpenAPI spec change: `pnpm --filter @workspace/api-spec run codegen`
- Seed accounts: admin@transpadilla.co/admin123, conductor@transpadilla.co/conductor123, pasajero@transpadilla.co/pasajero123
- DB seed data already loaded (users, 3 rutas, 8 paradas, ruta_paradas, 3 buses RHC-001/002/003)
- Do NOT call `/api/seed` (POST) — it checks if any user exists before seeding; users already present

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
