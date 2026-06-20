import { Router } from "express";
import { seedIfEmpty } from "../lib/seed";
import { authMiddleware, requireRol } from "../middleware/auth";

const router = Router();

// Sembrar datos es una operación administrativa: la protegemos para que un
// tercero no pueda dispararla. El arranque ya auto-siembra si la base está vacía
// (SEED_ON_START), así que este endpoint es solo una utilidad para el admin.
router.post("/seed", authMiddleware, requireRol("admin"), async (_req, res) => {
  const { seeded } = await seedIfEmpty();
  res.json({
    mensaje: seeded
      ? "Datos de prueba creados exitosamente"
      : "Base de datos ya inicializada",
  });
});

export default router;
