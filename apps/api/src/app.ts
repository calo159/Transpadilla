import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimit } from "./middleware/rate-limit";
import { registrarRespuesta, registrarError } from "./lib/metrics";
import { notificarAlerta } from "./lib/alertas";

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

// Contador liviano de respuestas por clase de estado (2xx/3xx/4xx/5xx), para
// /api/metrics. No reemplaza los logs; es un resumen barato en memoria.
app.use((_req, res, next) => {
  res.on("finish", () => registrarRespuesta(res.statusCode));
  next();
});
// ── Content-Security-Policy ──────────────────────────────────────────────────
// Política a la medida de esta app (React/Vite + Leaflet + Socket.IO):
//  - script-src 'self': el build de Vite solo emite scripts externos (sin inline),
//    así que esto es estricto y NO rompe el SPA.
//  - style-src incluye 'unsafe-inline': Leaflet y los componentes (Radix/shadcn)
//    inyectan estilos en línea; en estilos el riesgo es bajo.
//  - img-src https: data: blob:: los tiles del mapa pueden venir de cualquier
//    proveedor (OSM/Mapbox/MapTiler/propio) y Leaflet usa data:/blob: para marcadores.
//  - connect-src https: wss: ws:: fetch a OSRM (router.project-osrm.org o el propio)
//    y el WebSocket de Socket.IO.
//  - worker-src 'self' blob:: el service worker de la PWA (vite-plugin-pwa/workbox).
// Se puede sobreescribir por entorno con la variable CSP.
const csp =
  process.env["CSP"] ??
  [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self'",
    // Google Fonts: el CSS viene de fonts.googleapis.com y los archivos .woff2
    // de fonts.gstatic.com (la fuente Inter que usa el index.html).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https: wss: ws:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

// ── Cabeceras de seguridad (helmet-lite, sin dependencias) ───────────────────
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "geolocation=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
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
// El APK de Capacitor carga el bundle localmente, así que su WebView corre con
// origen https://localhost (o capacitor://localhost): toda llamada a la API es
// cross-origin y necesita CORS. La web servida desde el mismo dominio NO pasa por
// CORS (same-origin), así que añadir estos orígenes no la afecta.
// El WebView de Capacitor usa https://localhost (androidScheme por defecto) o
// capacitor://localhost. No incluimos http://localhost: no lo usa ningún cliente
// legítimo y ensancharía la allowlist de producción sin necesidad.
const capacitorOrigins = ["https://localhost", "capacitor://localhost"];
const allowedOrigins = [...corsOrigins, ...capacitorOrigins];
app.use(
  cors(
    isProd
      ? { origin: allowedOrigins, credentials: true }
      : {}, // desarrollo: permitir todo
  ),
);

// Límites de tamaño de body: payloads pequeños bastan para esta API; cerrar la
// puerta a cuerpos enormes evita un vector de DoS por memoria/parseo.
// Se verifica Content-Length ANTES de parsear para devolver 413 sin tocar el body.
app.use((req, res, next) => {
  const len = parseInt(req.headers["content-length"] ?? "0", 10);
  if (len > 33_000) {
    res.status(413).json({ error: "Payload demasiado grande" });
    return;
  }
  next();
});
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

// security.txt (Fase 1.6 de PLAN.md, RFC 9116): política de divulgación
// responsable para investigadores de seguridad. Ruta explícita (no un archivo
// en apps/web/public) porque express.static ignora dotfiles como .well-known
// por defecto. Se registra ANTES del fallback SPA para que no lo intercepte.
const SECURITY_TXT = [
  "Contact: mailto:seguridad@transpadilla.co",
  "Expires: 2027-12-31T23:59:00.000Z",
  "Preferred-Languages: es, en",
  "Canonical: https://transpadilla-web.onrender.com/.well-known/security.txt",
  "Policy: https://transpadilla-web.onrender.com/terminos",
  "",
].join("\n");
app.get(["/.well-known/security.txt", "/security.txt"], (_req, res) => {
  res.type("text/plain").send(SECURITY_TXT);
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
  // Si Express ya empezó a responder, no podemos enviar el error como JSON.
  if (res.headersSent) return;
  // Express lanza un error con type "entity.too.large" cuando el body excede
  // el limit de express.json() — debe responder 413, no 500.
  if ((err as Record<string, unknown>)["type"] === "entity.too.large") {
    res.status(413).json({ error: "Payload demasiado grande" });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  registrarError(err, req.originalUrl);
  // La alerta externa (webhook a Slack/Discord/etc.) NO incluye err.message:
  // podría filtrar detalles internos (SQL, hosts, mensajes de librerías). El
  // detalle completo queda en los logs internos y en GET /api/metrics (admin).
  notificarAlerta(`TransPadilla — error 500 en ${req.method} ${req.originalUrl.split("?")[0]}`, "P1");
  res.status(500).json({ error: "Error interno del servidor" });
});

export default app;