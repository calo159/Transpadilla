-- ============================================================================
-- TransPadilla — Row Level Security (RLS) para Supabase
-- ============================================================================
-- Estrategia (Opción A): el backend Express se conecta con el rol de servicio
-- de Postgres (owner/superuser de la cadena DATABASE_URL), que por diseño
-- BYPASEA RLS. Toda la autorización real sigue viviendo en Express (JWT + RBAC).
--
-- RLS aquí es una CAPA DEFENSIVA EXTRA: si alguien obtiene el `anon key` de
-- Supabase, o intenta leer/escribir vía PostgREST / clientes públicos, NO podrá
-- tocar los datos salvo lo que explícitamente permitimos (lecturas del mapa).
--
-- Cómo aplicar (una sola vez, contra la base de Supabase):
--   psql "$DATABASE_URL" -f packages/db/rls.sql
-- o pega este archivo en el SQL Editor del dashboard de Supabase.
--
-- Idempotente: se puede correr varias veces sin error.
-- ============================================================================

-- 1) Activar RLS en todas las tablas -----------------------------------------
ALTER TABLE usuarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rutas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE paradas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruta_paradas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE buses         ENABLE ROW LEVEL SECURITY;

-- FORCE RLS está comentado porque el backend se conecta como `postgres` (owner).
-- Con FORCE activo, el owner también queda sujeto a RLS y no hay policies para
-- `postgres`, lo que bloquea todas las queries del backend. Sin FORCE, el owner
-- bypasea RLS y las policies para `service_role`/`anon` siguen vigentes.
-- ALTER TABLE usuarios      FORCE ROW LEVEL SECURITY;
-- ALTER TABLE rutas         FORCE ROW LEVEL SECURITY;
-- ALTER TABLE paradas       FORCE ROW LEVEL SECURITY;
-- ALTER TABLE ruta_paradas  FORCE ROW LEVEL SECURITY;
-- ALTER TABLE buses         FORCE ROW LEVEL SECURITY;

-- 2) Permitir explícitamente al rol de servicio de Supabase -------------------
-- `service_role` es la clave secreta del backend; debe poder todo.
DROP POLICY IF EXISTS service_all_usuarios     ON usuarios;
DROP POLICY IF EXISTS service_all_rutas        ON rutas;
DROP POLICY IF EXISTS service_all_paradas      ON paradas;
DROP POLICY IF EXISTS service_all_ruta_paradas ON ruta_paradas;
DROP POLICY IF EXISTS service_all_buses        ON buses;

CREATE POLICY service_all_usuarios     ON usuarios      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_rutas        ON rutas         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_paradas      ON paradas       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_ruta_paradas ON ruta_paradas  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_buses        ON buses         FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Lecturas públicas del mapa (rol `anon`) ----------------------------------
-- El frontend público muestra rutas, paradas y posición de buses. Esas tablas
-- ya se exponen como GET públicos en Express, así que es coherente permitir
-- SELECT al rol anónimo. NO se permite ninguna escritura pública.
DROP POLICY IF EXISTS anon_read_rutas        ON rutas;
DROP POLICY IF EXISTS anon_read_paradas      ON paradas;
DROP POLICY IF EXISTS anon_read_ruta_paradas ON ruta_paradas;
DROP POLICY IF EXISTS anon_read_buses        ON buses;

CREATE POLICY anon_read_rutas        ON rutas         FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_paradas      ON paradas       FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_ruta_paradas ON ruta_paradas  FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_buses        ON buses         FOR SELECT TO anon USING (true);

-- 4) `usuarios` queda BLINDADA al público ------------------------------------
-- No creamos ninguna política para `anon` sobre `usuarios`: con RLS activado y
-- sin política que la permita, el rol anónimo NO puede leer correos ni hashes
-- de contraseña. Solo `service_role` (el backend) accede a esta tabla.

-- 5) `favoritos` — solo el backend ------------------------------------------
-- Registro anónimo de favoritos por dispositivo (base del reporte "ruta más
-- solicitada"). La escritura pública pasa por el endpoint rate-limited de Express;
-- a nivel BD la blindamos: RLS forzado y solo `service_role` accede (nada de anon).
ALTER TABLE favoritos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE favoritos FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_all_favoritos ON favoritos;
CREATE POLICY service_all_favoritos ON favoritos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) Tablas internas (nunca leídas/escritas por `anon`) -----------------------
-- posiciones_historial (base de los reportes admin), auditoria (log de acciones
-- admin), suscripciones_push (endpoints Web Push del backend) y tokens_revocados
-- (lista negra de JWT). Ninguna se expone al público: solo `service_role` accede;
-- sin política para `anon`, RLS activado ya las bloquea por completo.
ALTER TABLE posiciones_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria            ENABLE ROW LEVEL SECURITY;
ALTER TABLE suscripciones_push   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens_revocados     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_all_posiciones_historial ON posiciones_historial;
DROP POLICY IF EXISTS service_all_auditoria            ON auditoria;
DROP POLICY IF EXISTS service_all_suscripciones_push   ON suscripciones_push;
DROP POLICY IF EXISTS service_all_tokens_revocados     ON tokens_revocados;

CREATE POLICY service_all_posiciones_historial ON posiciones_historial FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_auditoria            ON auditoria            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_suscripciones_push   ON suscripciones_push   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_all_tokens_revocados     ON tokens_revocados     FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Verificación rápida (opcional):
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class WHERE relname IN
--     ('usuarios','rutas','paradas','ruta_paradas','buses','favoritos',
--      'posiciones_historial','auditoria','suscripciones_push','tokens_revocados');
-- ============================================================================
