import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimit } from "./middleware/rate-limit";

const app: Express = express();
const isProd = process.env["NODE_ENV"] === "production";

// Proxies de confianza delante de la app. Con Cloudflare → Render hay 2 saltos;
// solo Render es 1. (La IP real del cliente para rate-limit la da client-ip.ts.)
const detrasDeCloudflare = process.env["BEHIND_CLOUDFLARE"] === "true";
app.set("trust proxy", detrasDeCloudflare ? 2 : 1);
// No revelar el framework (reduce fingerprinting de atacantes).
app.disable("x-powered-by");

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
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
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

// Límites de tamaño de body: payloads pequeños bastan para esta API; cerrar la
// puerta a cuerpos enormes evita un vector de DoS por memoria/parseo.
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Tope global por IP sobre toda la API (defensa contra floods de capa 7). Es
// generoso para no afectar el sondeo normal del mapa (que refresca buses/ETA);
// los endpoints sensibles (login, registro, etc.) tienen además límites estrictos.
const apiLimiter = rateLimit({
  ventanaMs: 60_000,
  max: Number(process.env["API_RATE_LIMIT"] ?? 600),
  mensaje: "Demasiadas solicitudes desde tu conexión. Espera un momento.",
});
// Bloqueo OPCIONAL de acceso directo al origen: si se define CLOUDFLARE_ORIGIN_SECRET,
// se exige que cada request a /api traiga ese secreto en una cabecera (que Cloudflare
// inyecta vía Transform Rule). Así un atacante no puede esquivar Cloudflare golpeando
// la URL de Render directamente. Los health checks quedan exentos (Render los hace directo).
const originSecret = process.env["CLOUDFLARE_ORIGIN_SECRET"];
if (originSecret) {
  app.use("/api", (req, res, next) => {
    const ruta = req.originalUrl.split("?")[0];
    if (ruta === "/api/healthz" || ruta === "/api/readyz") return next();
    if (req.headers["x-cf-origin-secret"] === originSecret) return next();
    res.status(403).json({ error: "Acceso directo no permitido" });
  });
}

// Los health checks de la plataforma NO se limitan: si un flood les diera 429,
// Render creería que la app está caída y la reiniciaría (el flood causaría el apagón).
app.use("/api", (req, res, next) => {
  const ruta = req.originalUrl.split("?")[0];
  if (ruta === "/api/healthz" || ruta === "/api/readyz") return next();
  return apiLimiter(req, res, next);
}, router);

// 404 JSON para rutas de API no encontradas (en vez de caer al SPA o a HTML).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Recurso no encontrado" });
});

// ─── Frontend (producción) ──────────────────────────────────────────────────
// En producción, el mismo servidor Express sirve la app de React ya construida,
// de modo que todo el sistema vive en un solo servicio (un único dominio/HTTPS).
// En desarrollo esto se omite: el frontend lo sirve Vite con su propio proxy.
if (process.env["NODE_ENV"] === "production") {
  // El bundle del API corre desde apps/api/dist, así que el frontend construido
  // queda en apps/web/dist/public (../../web/dist/public). Se puede sobreescribir
  // con FRONTEND_DIST.
  const frontendDist = process.env["FRONTEND_DIST"]
    ? path.resolve(process.env["FRONTEND_DIST"])
    : path.resolve(__dirname, "../../web/dist/public");

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