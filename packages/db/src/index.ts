import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Supabase (y la mayoría de hosts gestionados) exigen TLS. Detectamos el host
// o un sslmode en la cadena y activamos SSL. `rejectUnauthorized: false` evita
// fallos por la cadena de certificados del pooler de Supabase sin desactivar el
// cifrado. En local (postgres://...localhost) no se activa SSL.
const connectionString = process.env.DATABASE_URL;
const needsSsl =
  /supabase\.(co|com)/.test(connectionString) ||
  /[?&]sslmode=(require|verify-full|verify-ca)/.test(connectionString);

export const pool = new Pool({
  connectionString,
  // Máximo de conexiones del pool (default de pg = 10). Se sube para soportar
  // picos de tráfico (polling + GPS) sin saturar; ajustable por entorno y acotado
  // al límite del pooler de Supabase. Ver DB_POOL_MAX.
  max: Number(process.env["DB_POOL_MAX"] ?? 20),
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
