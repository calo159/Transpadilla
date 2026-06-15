import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocketIO } from "./lib/socket";
import { initDatabase } from "./lib/init-db";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main(): Promise<void> {
  // Crea las tablas (si faltan) y carga datos demo en una base vacía, de modo
  // que un despliegue nuevo quede operativo sin pasos manuales.
  try {
    await initDatabase();
  } catch (err) {
    logger.error({ err }, "Database initialization failed");
    throw err;
  }

  const httpServer = http.createServer(app);
  initSocketIO(httpServer);

  httpServer.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
