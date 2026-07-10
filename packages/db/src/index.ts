import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "node:fs";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Supabase (y la mayoría de hosts gestionados) exigen TLS. Detectamos el host
// o un sslmode en la cadena y activamos SSL. En local (postgres://...localhost)
// no se activa SSL.
const connectionString = process.env.DATABASE_URL;
const needsSsl =
  /supabase\.(co|com)/.test(connectionString) ||
  /[?&]sslmode=(require|verify-full|verify-ca)/.test(connectionString);

// Por defecto, `rejectUnauthorized: false` cifra pero NO valida el certificado
// del servidor — un atacante en posición de red (on-path) podría presentar un
// cert falso e interceptar el tráfico de la DB. Con DB_SSL_STRICT=true se activa
// la verificación completa contra las CA de confianza de Node (funciona si el
// cert del pooler encadena a una CA pública reconocida, que es el caso normal
// del pooler de Supabase); si el despliegue necesita un CA propio, apuntar
// DB_SSL_CA_PATH a su archivo .pem. El default queda intacto (no romper
// despliegues existentes): esto es opt-in, verificado antes de recomendarlo
// como default (ver docs/SEGURIDAD.md).
const sslStrict = process.env["DB_SSL_STRICT"] === "true";
const caPath = process.env["DB_SSL_CA_PATH"];

export const pool = new Pool({
  connectionString,
  // Máximo de conexiones del pool (default de pg = 10). Se sube para soportar
  // picos de tráfico (polling + GPS) sin saturar; ajustable por entorno y acotado
  // al límite del pooler de Supabase. Ver DB_POOL_MAX.
  max: Number(process.env["DB_POOL_MAX"] ?? 20),
  ...(needsSsl
    ? {
        ssl: sslStrict
          ? { rejectUnauthorized: true, ...(caPath ? { ca: fs.readFileSync(caPath, "utf8") } : {}) }
          : { rejectUnauthorized: false },
      }
    : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
