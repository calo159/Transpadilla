// Runner de migraciones versionadas (drizzle-kit). NO se ejecuta en el arranque
// del servidor (ver apps/api/src/lib/init-db.ts, que sigue siendo la red de
// seguridad idempotente de cada boot); esto es la vía controlada/documentada
// para aplicar cambios de esquema a mano: `pnpm --filter @workspace/db migrate`.
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

async function main(): Promise<void> {
  const carpeta = path.resolve(import.meta.dirname, "..", "drizzle");
  console.log(`Aplicando migraciones desde ${carpeta}...`);
  await migrate(db, { migrationsFolder: carpeta });
  console.log("Migraciones aplicadas.");
  await pool.end();
}

main().catch((err) => {
  console.error("Error aplicando migraciones:", err);
  process.exit(1);
});
