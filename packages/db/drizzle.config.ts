import { defineConfig } from "drizzle-kit";
import path from "path";

// Cargar variables del .env en la raíz del monorepo si DATABASE_URL no está ya en el entorno.
// process.loadEnvFile es nativo en Node 21+ (no requiere dotenv).
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(__dirname, "..", "..", ".env"));
  } catch {
    // .env no encontrado — se valida abajo
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida. Crea un archivo .env en la raíz del proyecto (ver .env.example).");
}

// Supabase exige TLS; detectarlo igual que el pool de runtime.
const needsSsl =
  /supabase\.(co|com)/.test(process.env.DATABASE_URL) ||
  /[?&]sslmode=(require|verify-full|verify-ca)/.test(process.env.DATABASE_URL);

export default defineConfig({
  // Path relativo (no absoluto): el directorio del proyecto puede contener
  // caracteres como paréntesis que el glob de drizzle-kit malinterpreta.
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  },
});
