import { Router } from "express";
import { pool } from "@workspace/db";
import { authMiddleware, requireRol } from "../middleware/auth";

// Reportes históricos para el panel admin (km recorridos, ocupación, actividad).
// Se calculan sobre posiciones_historial (alimentada por el job de snapshot).
// Solo admin: son datos de gestión, no públicos.
const router = Router();

// días del periodo, acotado a 1–90 (la retención por defecto es 30).
function diasParam(raw: unknown): number {
  const n = parseInt(String(raw ?? "7"), 10);
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(1, n));
}

// Distancia máxima creíble entre dos muestras consecutivas (km). Filtra saltos de
// GPS imposibles que inflarían los km (a 60 s ni el bus más rápido supera ~2 km).
const MAX_SEG_KM = 3;

router.get("/reportes/resumen", authMiddleware, requireRol("admin"), async (req, res) => {
  const dias = diasParam(req.query["dias"]);
  // CTE: empareja cada punto con el anterior del mismo bus (LAG) y suma la
  // distancia Haversine (en km) por ruta, descartando saltos > MAX_SEG_KM.
  const { rows } = await pool.query(
    `WITH p AS (
       SELECT bus_id, ruta_id, lat, lng,
              lag(lat) OVER w AS plat,
              lag(lng) OVER w AS plng
       FROM posiciones_historial
       WHERE capturado >= now() - ($1 || ' days')::interval
       WINDOW w AS (PARTITION BY bus_id ORDER BY capturado)
     ),
     seg AS (
       SELECT ruta_id, bus_id,
         6371 * 2 * asin(sqrt(
           power(sin(radians(lat - plat) / 2), 2) +
           cos(radians(plat)) * cos(radians(lat)) *
           power(sin(radians(lng - plng) / 2), 2)
         )) AS km
       FROM p WHERE plat IS NOT NULL
     )
     SELECT r.id AS ruta_id, r.nombre, r.color,
            COALESCE(SUM(s.km) FILTER (WHERE s.km < $2), 0) AS km,
            COUNT(s.bus_id)            AS muestras,
            COUNT(DISTINCT s.bus_id)   AS buses
     FROM seg s
     JOIN rutas r ON r.id = s.ruta_id
     GROUP BY r.id, r.nombre, r.color
     ORDER BY km DESC`,
    [String(dias), MAX_SEG_KM],
  );

  const porRuta = rows.map((r) => ({
    ruta_id: r.ruta_id as number,
    nombre: r.nombre as string,
    color: r.color as string,
    km: Math.round(Number(r.km) * 10) / 10,
    muestras: Number(r.muestras),
    buses: Number(r.buses),
  }));

  res.json({
    dias,
    km_total: Math.round(porRuta.reduce((s, r) => s + r.km, 0) * 10) / 10,
    buses_activos: porRuta.reduce((s, r) => Math.max(s, r.buses), 0),
    rutas: porRuta,
  });
});

router.get("/reportes/ocupacion", authMiddleware, requireRol("admin"), async (req, res) => {
  const dias = diasParam(req.query["dias"]);
  const { rows } = await pool.query(
    `SELECT ocupacion, COUNT(*)::int AS muestras
       FROM posiciones_historial
       WHERE capturado >= now() - ($1 || ' days')::interval
         AND ocupacion IS NOT NULL
       GROUP BY ocupacion`,
    [String(dias)],
  );
  const base: Record<string, number> = { vacio: 0, medio: 0, lleno: 0 };
  for (const r of rows) base[r.ocupacion as string] = Number(r.muestras);
  res.json({ dias, ...base });
});

export default router;
