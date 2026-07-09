import { pool } from "@workspace/db";
import { logger } from "./logger";
import { seedIfEmpty } from "./seed";

/**
 * Crea las tablas de TransPadilla si aún no existen. Es idempotente
 * (CREATE TABLE IF NOT EXISTS), así que se puede ejecutar en cada arranque sin
 * riesgo de pérdida de datos.
 *
 * Usamos SQL explícito (en vez de `drizzle-kit push` en producción) para tener
 * control total del arranque y no depender de la CLI de drizzle en runtime.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS usuarios (
  id serial PRIMARY KEY,
  nombre varchar(100) NOT NULL,
  correo varchar(100) NOT NULL UNIQUE,
  password varchar(200) NOT NULL,
  rol varchar(20) NOT NULL DEFAULT 'pasajero',
  identificacion varchar(30)
);

CREATE TABLE IF NOT EXISTS rutas (
  id serial PRIMARY KEY,
  nombre varchar(100) NOT NULL,
  color varchar(20) NOT NULL DEFAULT '#3498db',
  activa boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS paradas (
  id serial PRIMARY KEY,
  nombre varchar(100) NOT NULL,
  latitud real NOT NULL,
  longitud real NOT NULL
);

CREATE TABLE IF NOT EXISTS ruta_paradas (
  id serial PRIMARY KEY,
  ruta_id integer NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  parada_id integer NOT NULL REFERENCES paradas(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS buses (
  id serial PRIMARY KEY,
  placa varchar(20) NOT NULL UNIQUE,
  ruta_id integer REFERENCES rutas(id) ON DELETE SET NULL,
  conductor_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
  estado varchar(20) NOT NULL DEFAULT 'inactivo',
  lat real,
  lng real,
  velocidad real,
  novedad varchar(200),
  ocupacion varchar(10),
  actualizado timestamptz
);

-- Columnas agregadas después del diseño inicial; ALTER idempotente por si las
-- tablas ya existían sin ellas.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS identificacion varchar(30);
ALTER TABLE buses ADD COLUMN IF NOT EXISTS ocupacion varchar(10);
-- Bloqueo de cuenta por fuerza bruta (Fase 1.3).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos integer NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta timestamptz;
-- Versión de sesión (claim tv del JWT): cambiar la contraseña la incrementa,
-- invalidando de inmediato los tokens firmados antes (ver middleware/auth.ts).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
-- Consentimiento de términos del conductor (Fase 3.4).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS terminos_conductor_aceptados boolean NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS terminos_conductor_version varchar(20);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS terminos_conductor_fecha timestamptz;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS terminos_conductor_ip varchar(64);

-- Índices en las columnas usadas en JOIN/filtros (rendimiento a escala). Las
-- claves foráneas no se indexan solas en PostgreSQL; estos aceleran GET /buses,
-- /rutas, /eta y la resolución del bus del conductor (busAutorizado).
CREATE INDEX IF NOT EXISTS idx_ruta_paradas_ruta   ON ruta_paradas(ruta_id, orden);
CREATE INDEX IF NOT EXISTS idx_ruta_paradas_parada ON ruta_paradas(parada_id);
CREATE INDEX IF NOT EXISTS idx_buses_ruta_estado   ON buses(ruta_id, estado);
CREATE INDEX IF NOT EXISTS idx_buses_conductor     ON buses(conductor_id);

-- Historial de posiciones (base de los reportes). Lo alimenta un job de snapshot
-- cada ~60 s, no cada ping de GPS, para acotar el volumen de escritura.
CREATE TABLE IF NOT EXISTS posiciones_historial (
  id serial PRIMARY KEY,
  bus_id integer NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  ruta_id integer REFERENCES rutas(id) ON DELETE SET NULL,
  lat real NOT NULL,
  lng real NOT NULL,
  velocidad real,
  ocupacion varchar(10),
  capturado timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hist_bus_capturado  ON posiciones_historial(bus_id, capturado);
CREATE INDEX IF NOT EXISTS idx_hist_ruta_capturado ON posiciones_historial(ruta_id, capturado);

-- Auditoría de acciones administrativas (quién hizo qué).
CREATE TABLE IF NOT EXISTS auditoria (
  id serial PRIMARY KEY,
  usuario_id integer REFERENCES usuarios(id) ON DELETE SET NULL,
  accion varchar(50) NOT NULL,
  entidad_tipo varchar(30),
  entidad_id integer,
  detalle jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_creado ON auditoria(creado_en);
-- Contexto de la petición (Fase 1.2): IP + user-agent de cada acción admin.
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ip varchar(64);
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS user_agent text;

-- Suscripciones Web Push del pasajero (por dispositivo, sin cuenta).
CREATE TABLE IF NOT EXISTS suscripciones_push (
  id serial PRIMARY KEY,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  rutas jsonb NOT NULL DEFAULT '[]'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Favoritos del pasajero (por dispositivo, sin cuenta). cliente_id = id anónimo del
-- navegador. Base del reporte "ruta más solicitada".
CREATE TABLE IF NOT EXISTS favoritos (
  id serial PRIMARY KEY,
  cliente_id varchar(64) NOT NULL,
  ruta_id integer NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_favoritos_cliente_ruta ON favoritos(cliente_id, ruta_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_ruta ON favoritos(ruta_id);

-- Banners / anuncios a pantalla completa que el admin publica al pasajero.
CREATE TABLE IF NOT EXISTS banners (
  id serial PRIMARY KEY,
  imagen_url text NOT NULL,
  titulo varchar(120),
  activo boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Tokens JWT revocados (cierre de sesión). Se guarda el hash, no el token.
CREATE TABLE IF NOT EXISTS tokens_revocados (
  id serial PRIMARY KEY,
  token_hash varchar(64) NOT NULL UNIQUE,
  expira_en timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Migra columnas timestamp (sin zona) a timestamptz: una columna "sin zona" que
-- guarda un INSTANTE (no una hora civil) es ambigua entre sesiones con distinto
-- TimeZone — Node/pg puede reinterpretarla ~horas desfasada si la sesión que
-- escribió no era UTC (bug real: invalidaba el bloqueo de cuenta por fuerza
-- bruta). Solo convierte si la columna sigue siendo "timestamp without time
-- zone" (columnas nuevas ya nacen como timestamptz arriba), así que correr esto
-- en cada arranque es seguro y barato tras la primera vez.
DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('usuarios', 'bloqueado_hasta'),
      ('usuarios', 'terminos_conductor_fecha'),
      ('buses', 'actualizado'),
      ('posiciones_historial', 'capturado'),
      ('auditoria', 'creado_en'),
      ('suscripciones_push', 'creado_en'),
      ('favoritos', 'creado_en'),
      ('banners', 'creado_en'),
      ('tokens_revocados', 'expira_en'),
      ('tokens_revocados', 'creado_en')
    ) AS t(tabla, columna)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = col.tabla AND column_name = col.columna
        AND data_type = 'timestamp without time zone'
    ) THEN
      -- El valor naive SIEMPRE fue escrito por una sesión en UTC (Supabase y el
      -- Postgres de CI corren en UTC), así que reinterpretarlo como UTC (no como
      -- la sesión actual) es la conversión correcta sin importar en qué zona
      -- corra ESTE arranque puntual.
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
        col.tabla, col.columna, col.columna
      );
    END IF;
  END LOOP;
END $$;
`;

export async function ensureSchema(): Promise<void> {
  await pool.query(SCHEMA_SQL);
  logger.info("Database schema ensured");
}

/**
 * Prepara la base de datos para arrancar: crea las tablas y, salvo que se
 * desactive con SEED_ON_START=false, carga datos demo si la base está vacía.
 */
export async function initDatabase(): Promise<void> {
  await ensureSchema();
  if (process.env["SEED_ON_START"] !== "false") {
    const { seeded } = await seedIfEmpty();
    if (seeded) logger.info("Database seeded with demo data");
  }
}
