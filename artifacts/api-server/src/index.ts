import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initSocketIO } from "./lib/socket";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);
initSocketIO(httpServer);

httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
