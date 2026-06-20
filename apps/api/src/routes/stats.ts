import { Router } from "express";
import { db } from "@workspace/db";
import { buses, rutas, paradas } from "@workspace/db";
import { count, eq } from "drizzle-orm";

const router = Router();

router.get("/stats", async (_req, res) => {
  const [busCount] = await db.select({ total: count() }).from(buses);
  const [rutaCount] = await db.select({ total: count() }).from(rutas);
  const [paradaCount] = await db.select({ total: count() }).from(paradas);
  const [activoCount] = await db
    .select({ total: count() })
    .from(buses)
    .where(eq(buses.estado, "activo"));
  const [demoraCount] = await db
    .select({ total: count() })
    .from(buses)
    .where(eq(buses.estado, "demora"));

  res.json({
    totalBuses: busCount?.total ?? 0,
    busesActivos: activoCount?.total ?? 0,
    totalRutas: rutaCount?.total ?? 0,
    totalParadas: paradaCount?.total ?? 0,
    busesConDemora: demoraCount?.total ?? 0,
    busesInactivos:
      (busCount?.total ?? 0) -
      (activoCount?.total ?? 0) -
      (demoraCount?.total ?? 0),
  });
});

export default router;
