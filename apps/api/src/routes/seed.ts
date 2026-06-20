import { Router } from "express";
import { seedIfEmpty } from "../lib/seed";

const router = Router();

router.post("/seed", async (_req, res) => {
  const { seeded } = await seedIfEmpty();
  res.json({
    mensaje: seeded
      ? "Datos de prueba creados exitosamente"
      : "Base de datos ya inicializada",
  });
});

export default router;
