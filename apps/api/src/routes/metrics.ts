import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { authMiddleware, requireRol } from "../middleware/auth";
import { snapshot, metricasPrometheus } from "../lib/metrics";
import { alertasHabilitadas } from "../lib/alertas";
import { getIO } from "../lib/socket";

// Observabilidad básica del proceso (uptime, memoria, requests, errores
// recientes). Solo admin: no es información para exponer al público.
const router = Router();

router.get("/metrics", authMiddleware, requireRol("admin"), (_req, res) => {
  res.json({ ...snapshot(), alertas_habilitadas: alertasHabilitadas });
});

/**
 * Guarda del endpoint Prometheus (Fase 4.2): si está definida la env
 * METRICS_TOKEN, un scraper puede autenticarse con `Authorization: Bearer
 * <METRICS_TOKEN>` (token de máquina, no expira como el JWT admin). Si no,
 * se cae al flujo admin normal (authMiddleware + requireRol). Así Prometheus/
 * Grafana Agent puede hacer scrape sin tener que rotar el JWT cada pocos días.
 */
/** Compara con tiempo constante (evita filtrar el token por temporización). */
function tokenCoincide(header: string | undefined, esperado: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function guardaMetricas(req: Request, res: Response, next: NextFunction): void {
  const metricsToken = process.env["METRICS_TOKEN"];
  if (metricsToken && tokenCoincide(req.headers.authorization, metricsToken)) { next(); return; }
  authMiddleware(req, res, () => requireRol("admin")(req, res, next));
}

router.get("/metrics/prometheus", guardaMetricas, (_req, res) => {
  let wsConexiones: number | undefined;
  try { wsConexiones = getIO().engine.clientsCount; } catch { /* socket no listo */ }
  const dbPool = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
  res.type("text/plain; version=0.0.4").send(metricasPrometheus({ wsConexiones, dbPool }));
});

export default router;
