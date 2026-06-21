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

  // Mitiga slow-loris (clientes que mantienen la conexión abierta enviando datos
  // muy lento para agotar los sockets del servidor): tiempos máximos por petición.
  httpServer.headersTimeout = 20_000;   // recibir cabeceras completas
  httpServer.requestTimeout = 30_000;   // recibir la petición completa
  httpServer.keepAliveTimeout = 65_000; // alinear con proxies/keep-alive

  initSocketIO(httpServer);

  httpServer.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  // Apagado ordenado: cuando la plataforma reinicia/actualiza la instancia
  // (24/7), cerramos el servidor sin cortar peticiones en curso de golpe.
  const apagar = (señal: string) => {
    logger.info({ señal }, "Shutting down gracefully");
    httpServer.close(() => process.exit(0));
    // Tope de seguridad por si una conexión queda colgada.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => apagar("SIGTERM"));
  process.on("SIGINT", () => apagar("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
