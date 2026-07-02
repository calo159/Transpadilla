import { Router } from "express";
import { authMiddleware, requireRol } from "../middleware/auth";
import { snapshot } from "../lib/metrics";
import { alertasHabilitadas } from "../lib/alertas";

// Observabilidad básica del proceso (uptime, memoria, requests, errores
// recientes). Solo admin: no es información para exponer al público.
const router = Router();

router.get("/metrics", authMiddleware, requireRol("admin"), (_req, res) => {
  res.json({ ...snapshot(), alertas_habilitadas: alertasHabilitadas });
});

export default router;
