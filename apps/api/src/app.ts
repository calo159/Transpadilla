import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const isProd = process.env["NODE_ENV"] === "production";

// Detrás del proxy de Render: permite obtener la IP real del cliente (rate-limit)
// y respetar X-Forwarded-Proto (HTTPS).
app.set("trust proxy", 1);

// Destino del microservicio de tráfico (Django). En local es localhost:8000;
// en producción (Render) se inyecta vía TRAFICO_URL. Acepta valores con o sin
// esquema (p.ej. "host:puerto" o "https://host").
let traficoTarget = process.env["TRAFICO_URL"] ?? "http://localhost:8000";
if (!/^https?:\/\//i.test(traficoTarget)) {
  // Render inyecta solo el host (sin esquema). Un host remoto usa https;
  // localhost en desarrollo usa http.
  const esLocal = /^(localhost|127\.|0\.0\.0\.0)/i.test(traficoTarget);
  traficoTarget = `${esLocal ? "http" : "https"}://${traficoTarget}`;
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
// ── Cabeceras de seguridad (helmet-lite, sin dependencias) ───────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "geolocation=(self)");
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

// ── CORS ─────────────────────────────────────────────────────────────────────
// En producción el frontend es del mismo origen, así que se restringe a la lista
// de CORS_ORIGIN (separada por comas) si se define; en desarrollo se permite todo.
const corsOrigins = (process.env["CORS_ORIGIN"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors(
    isProd && corsOrigins.length > 0
      ? { origin: corsOrigins, credentials: true }
      : isProd
        ? { origin: false } // same-origin: no se necesitan cabeceras CORS
        : {}, // desarrollo: permitir todo
  ),
);

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

// 404 JSON para rutas de API no encontradas (en vez de caer al SPA o a HTML).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Recurso no encontrado" });
});

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

// ── Manejo global de errores ─────────────────────────────────────────────────
// Cualquier error no controlado (incluidos los de handlers async en Express 5)
// llega aquí y responde JSON, en vez de una página HTML de error por defecto.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "Unhandled error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Error interno del servidor" });
});

export default app;