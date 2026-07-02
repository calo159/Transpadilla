# @workspace/db — Base de datos (Drizzle ORM)

Esquema, tipos y pool de conexión a **PostgreSQL** (Supabase en local y producción).
Es la fuente de verdad de las tablas y se importa desde `apps/api`.

## Contenido
```
src/schema/index.ts   Tablas Drizzle: usuarios, rutas, paradas, ruta_paradas, buses,
                      posiciones_historial, auditoria, suscripciones_push,
                      tokens_revocados (+ índices). Exporta tipos ($inferSelect).
src/index.ts          Pool pg (SSL automático si el host es Supabase) + instancia drizzle.
                      `max` del pool configurable con DB_POOL_MAX (default 20).
src/migrate.ts        Runner de migraciones versionadas (ver abajo).
drizzle/              Migraciones SQL generadas (versionadas en git).
rls.sql               Activa Row Level Security (FORCE) en las 5 tablas (idempotente).
drizzle.config.ts     Config de drizzle-kit (schema + carpeta de salida `drizzle/`).
```

## Scripts
```bash
pnpm --filter @workspace/db push        # aplica el esquema directo a la BD (dev rápido)
pnpm --filter @workspace/db push-force  # idem, forzando (cuidado)
pnpm --filter @workspace/db generate    # genera una migración SQL a partir del schema
pnpm --filter @workspace/db migrate     # aplica las migraciones pendientes a la BD
```

## Dos vías para cambiar el esquema (coexisten a propósito)

1. **Arranque idempotente** (`apps/api/src/lib/init-db.ts`, `ensureSchema()`): se ejecuta en
   **cada boot** del servidor y crea/ajusta las tablas con `CREATE TABLE IF NOT EXISTS` /
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Es la **red de seguridad**: un despliegue nuevo
   siempre queda operativo sin pasos manuales, y nunca rompe el arranque en producción.
2. **Migraciones versionadas** (`drizzle/`, generadas con `drizzle-kit generate`): la vía
   **documentada y auditable** para cambios de esquema. Cada migración queda en git, revisable
   en PR. Las migraciones **son idempotentes a propósito** (`CREATE TABLE IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, constraints en bloques `DO $$ ... EXCEPTION WHEN
   duplicate_object THEN null; END $$`), así que `migrate` es seguro de correr tanto sobre una
   BD nueva (crea todo) como sobre la BD de producción ya existente (queda no-op).

**El migrator NO se ejecuta en el arranque del servidor** — es intencional, para no atar un
despliegue en caliente a una migración que pueda fallar. Se corre a mano:

```bash
# 1. Cambia packages/db/src/schema/index.ts
# 2. Genera la migración (no toca la BD, solo lee el schema):
pnpm --filter @workspace/db generate
# 3. Revisa el SQL generado en packages/db/drizzle/ — verifica que sea idempotente
#    (agrega IF NOT EXISTS donde haga falta, como en las migraciones existentes)
# 4. Aplícala:
pnpm --filter @workspace/db migrate
# 5. Refleja el mismo cambio en el SQL idempotente de apps/api/src/lib/init-db.ts
#    (para que un despliegue nuevo/reinicio también quede al día sin correr `migrate`)
```

## Notas importantes
- `rls.sql` se corre **aparte** (SQL Editor de Supabase o `psql -f`); el backend conecta
  como rol `postgres` (bypassa RLS). Detalle en [docs/SUPABASE.md](../../docs/SUPABASE.md).
- ⚠️ Hay `.env` en la raíz, en `apps/api/` y aquí; `drizzle-kit` carga el de este paquete
  con prioridad. Mantén `DATABASE_URL` consistente en los tres.
