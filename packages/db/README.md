# @workspace/db — Base de datos (Drizzle ORM)

Esquema, tipos y pool de conexión a **PostgreSQL** (Supabase en local y producción).
Es la fuente de verdad de las tablas y se importa desde `apps/api`.

## Contenido
```
src/schema/index.ts   Tablas Drizzle: usuarios, rutas, paradas, ruta_paradas, buses,
                      posiciones_historial (+ índices). Exporta tipos ($inferSelect).
src/index.ts          Pool pg (SSL automático si el host es Supabase) + instancia drizzle.
                      `max` del pool configurable con DB_POOL_MAX (default 20).
rls.sql               Activa Row Level Security (FORCE) en las 5 tablas (idempotente).
drizzle.config.ts     Config de drizzle-kit (para `push` en desarrollo).
```

## Scripts
```bash
pnpm --filter @workspace/db push        # aplica el esquema a la BD (drizzle-kit push)
pnpm --filter @workspace/db push-force  # idem, forzando (cuidado)
```

## Notas importantes
- **En producción NO se usa `push`**: el backend crea las tablas con SQL idempotente al
  arrancar (`apps/api/src/lib/init-db.ts`). `push` es para desarrollo local.
- `rls.sql` se corre **aparte** (SQL Editor de Supabase o `psql -f`); el backend conecta
  como rol `postgres` (bypassa RLS). Detalle en [docs/SUPABASE.md](../../docs/SUPABASE.md).
- ⚠️ Hay `.env` en la raíz, en `apps/api/` y aquí; `drizzle-kit` carga el de este paquete
  con prioridad. Mantén `DATABASE_URL` consistente en los tres.
