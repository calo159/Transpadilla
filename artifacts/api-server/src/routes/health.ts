import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

// Liveness simple: el proceso responde.
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness: además verifica la conexión a la base de datos (útil para monitoreo).
router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "degraded", db: "error" });
  }
});

export default router;
