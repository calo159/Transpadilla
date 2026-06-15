import express, { type Express } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Destino del microservicio de tráfico (Django). En local es localhost:8000;
// en producción (Render) se inyecta vía TRAFICO_URL. Acepta valores con o sin
// esquema (p.ej. "host:puerto" o "https://host").
let traficoTarget = process.env["TRAFICO_URL"] ?? "http://localhost:8000";
if (!/^https?:\/\//i.test(traficoTarget)) {
  traficoTarget = `http://${traficoTarget}`;
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// Proxy /api/trafico/* -> Django traffic microservice.
// Must be registered BEFORE express.json() so the body is streamed through untouched.
app.use(
  "/api/trafico",
  createProxyMiddleware({
    target: traficoTarget,
    changeOrigin: true,
    pathRewrite: (path) => `/api${path}`,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ─── Frontend (producción) ──────────────────────────────────────────────────
// En producción, el mismo servidor Express sirve la app de React ya construida,
// de modo que todo el sistema vive en un solo servicio (un único dominio/HTTPS).
// En desarrollo esto se omite: el frontend lo sirve Vite con su propio proxy.
if (process.env["NODE_ENV"] === "production") {
  const frontendDist = process.env["FRONTEND_DIST"]
    ? path.resolve(process.env["FRONTEND_DIST"])
    : path.resolve(__dirname, "../../transpadilla/dist/public");

  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // SPA fallback: cualquier GET que no sea API ni socket.io devuelve index.html
    // para que el router del cliente (wouter) maneje la navegación.
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
        return next();
      }
      res.sendFile(path.join(frontendDist, "index.html"));
    });
    logger.info({ frontendDist }, "Serving frontend build");
  } else {
    logger.warn(
      { frontendDist },
      "Frontend build not found — serving API only. Run the frontend build first.",
    );
  }
}

export default app;