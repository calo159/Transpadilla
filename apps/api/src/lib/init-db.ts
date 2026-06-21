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
  novedad text,
  ocupacion varchar(10),
  actualizado timestamp
);

-- Columnas agregadas después del diseño inicial; ALTER idempotente por si las
-- tablas ya existían sin ellas.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS identificacion varchar(30);
ALTER TABLE buses ADD COLUMN IF NOT EXISTS ocupacion varchar(10);
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
