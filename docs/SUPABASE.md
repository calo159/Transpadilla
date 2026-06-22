# Supabase + Row Level Security (RLS) — TransPadilla

Guía para migrar la base PostgreSQL a **Supabase** y activar **RLS** como capa
defensiva extra. La autorización real sigue en Express (JWT + RBAC); RLS protege
contra accesos directos a la base (anon key, PostgREST, dashboard público).

## Estrategia (Opción A)

- El backend Express conecta con la cadena **de servicio** de Supabase → tiene
  rol `service_role`, que tiene política `FOR ALL` y puede todo.
- El rol público `anon` solo puede **leer** rutas, paradas y buses (lo mismo que
  ya exponen los GET públicos del mapa).
- La tabla `usuarios` (correos + hashes) queda **bloqueada** al público.

---

## Pasos

### 1. Crear el proyecto en Supabase
1. Entra a https://supabase.com → **New project** (plan free: 500 MB).
2. Elige región cercana (ej. `East US` o `South America (São Paulo)`).
3. Guarda la contraseña de la base que defines ahí.

### 2. Obtener la cadena de conexión
En el dashboard: **Project Settings → Database → Connection string → URI**.
Usa la versión **Connection pooling** (puerto `6543`, modo *Transaction*) para
producción serverless, o **Direct connection** (puerto `5432`) para migraciones.

Se ve así:
```
postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### 3. Apuntar el proyecto a Supabase
Edita el `.env` de la raíz (sin BOM) y reemplaza `DATABASE_URL`:
```
DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
```
> El pool de `packages/db` activa SSL automáticamente al detectar `supabase` en
> el host (ya está implementado en `src/index.ts` y `drizzle.config.ts`).

### 4. Crear las tablas en Supabase
Usa la **conexión directa (puerto 5432)** para esto:
```powershell
pnpm --filter @workspace/db run push
```
Esto crea las 5 tablas (`usuarios`, `rutas`, `paradas`, `ruta_paradas`, `buses`).

### 5. Aplicar las políticas RLS
Dos opciones:

**A) SQL Editor del dashboard** (más simple): abre `packages/db/rls.sql`, copia
todo y pégalo en **Supabase → SQL Editor → Run**.

**B) Por psql:**
```powershell
psql "$env:DATABASE_URL" -f packages/db/rls.sql
```

### 6. Verificar que RLS quedó activo
En el SQL Editor:
```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('usuarios','rutas','paradas','ruta_paradas','buses');
```
`relrowsecurity` debe ser `true` en las 5 tablas.

### 7. Sembrar datos (si aplica)
- Demo: `SEED_DEMO=true` y arranca la API una vez.
- Limpio: `SEED_DEMO=false` + `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Importante

- **No subas la cadena de conexión a git.** Va en `.env` (local) y en las
  variables de entorno de Render (producción).
- En **Render**, actualiza `DATABASE_URL` del servicio `transpadilla-web` con la
  cadena de Supabase (modo pooling, puerto 6543) y puedes prescindir del recurso
  `transpadilla-db` del `render.yaml` si migras del todo a Supabase.
- El backend NO usa el `anon key` ni el `service_role key` de la API REST de
  Supabase: conecta por Postgres directo. La política `service_role` del
  `rls.sql` aplica porque la cadena de conexión de Supabase usa ese rol.
- Si en algún momento el backend NO entra como `service_role` y RLS le bloquea
  escrituras, revisa la sección `FORCE ROW LEVEL SECURITY` en `rls.sql`.
