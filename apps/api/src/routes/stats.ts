import { Router } from "express";
import { pool } from "@workspace/db";
import { crearCacheTtl } from "../lib/cache";

const router = Router();

interface Stats {
  totalBuses: number;
  busesActivos: number;
  totalRutas: number;
  totalParadas: number;
  busesConDemora: number;
  busesInactivos: number;
}

// Antes eran 5 COUNT separados (5 round-trips a la BD). Ahora es UN solo query:
// escanea `buses` una vez con COUNT(*) FILTER y trae rutas/paradas como escalares.
// Cacheado 3 s (igual que /rutas) porque el dashboard lo consulta con frecuencia.
// La respuesta JSON queda idéntica campo por campo.
const statsCache = crearCacheTtl<Stats>(3000, async () => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM rutas)   AS total_rutas,
       (SELECT COUNT(*)::int FROM paradas) AS total_paradas,
       COUNT(*)::int                                   AS total_buses,
       COUNT(*) FILTER (WHERE estado = 'activo')::int  AS activos,
       COUNT(*) FILTER (WHERE estado = 'demora')::int  AS demora
     FROM buses`,
  );
  const r = rows[0] ?? {};
  const totalBuses = Number(r.total_buses ?? 0);
  const busesActivos = Number(r.activos ?? 0);
  const busesConDemora = Number(r.demora ?? 0);
  return {
    totalBuses,
    busesActivos,
    totalRutas: Number(r.total_rutas ?? 0),
    totalParadas: Number(r.total_paradas ?? 0),
    busesConDemora,
    busesInactivos: totalBuses - busesActivos - busesConDemora,
  };
});

router.get("/stats", async (_req, res) => {
  res.json(await statsCache.obtener());
});

export default router;
