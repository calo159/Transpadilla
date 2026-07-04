import { Router } from "express";
import { pool } from "@workspace/db";
import { authMiddleware, requireRol } from "../middleware/auth";
import { calcularFrecuencia, type MuestraFrec } from "../lib/frecuencia";
import { crearCacheTtl, type CacheTtl } from "../lib/cache";

// Reportes históricos para el panel admin (km recorridos, ocupación, actividad).
// Se calculan sobre posiciones_historial (alimentada por el job de snapshot),
// que puede crecer bastante con el uso — se cachean 60s por combinación de
// parámetros (mismo patrón que el caché de ETA en eta.ts) para no recalcular
// en cada refresco del panel ni bajo ráfagas de varios admins a la vez.
// Solo admin: son datos de gestión, no públicos.
const router = Router();
const REPORTE_TTL_MS = 60_000;

// días del periodo, acotado a 1–90 (la retención por defecto es 30).
function diasParam(raw: unknown): number {
  const n = parseInt(String(raw ?? "7"), 10);
  if (!Number.isFinite(n)) return 7;
  return Math.min(90, Math.max(1, n));
}

// Distancia máxima creíble entre dos muestras consecutivas (km). Filtra saltos de
// GPS imposibles que inflarían los km (a 60 s ni el bus más rápido supera ~2 km).
const MAX_SEG_KM = 3;

interface ResumenRuta { ruta_id: number; nombre: string; color: string; km: number; muestras: number; buses: number }
interface Resumen { dias: number; km_total: number; buses_activos: number; rutas: ResumenRuta[] }

const resumenCaches = new Map<number, CacheTtl<Resumen>>();
function resumenCache(dias: number): CacheTtl<Resumen> {
  let c = resumenCaches.get(dias);
  if (!c) {
    c = crearCacheTtl(REPORTE_TTL_MS, async () => {
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

      return {
        dias,
        km_total: Math.round(porRuta.reduce((s, r) => s + r.km, 0) * 10) / 10,
        buses_activos: porRuta.reduce((s, r) => Math.max(s, r.buses), 0),
        rutas: porRuta,
      };
    });
    resumenCaches.set(dias, c);
  }
  return c;
}

router.get("/reportes/resumen", authMiddleware, requireRol("admin"), async (req, res) => {
  res.json(await resumenCache(diasParam(req.query["dias"])).obtener());
});

interface Frecuencia {
  dias: number;
  espera_estimada_min: number | null;
  global_headway_min: number | null;
  rutas: { ruta_id: number; nombre: string; headway_min: number | null }[];
}

const frecuenciaCaches = new Map<number, CacheTtl<Frecuencia>>();
function frecuenciaCache(dias: number): CacheTtl<Frecuencia> {
  let c = frecuenciaCaches.get(dias);
  if (!c) {
    // Frecuencia estimada (headway = intervalo entre buses) como PROXY del
    // tiempo de espera. No hay dato real de espera; se aproxima desde el
    // historial. Ver frecuencia.ts.
    c = crearCacheTtl(REPORTE_TTL_MS, async () => {
      const { rows } = await pool.query(
        `SELECT ruta_id, bus_id, capturado
           FROM posiciones_historial
           WHERE capturado >= now() - ($1 || ' days')::interval AND ruta_id IS NOT NULL
           ORDER BY capturado`,
        [String(dias)],
      );
      const muestras: MuestraFrec[] = rows.map((r) => ({
        rutaId: r.ruta_id as number,
        busId: r.bus_id as number,
        t: new Date(r.capturado as string).getTime(),
      }));
      const { global_headway_min, rutas } = calcularFrecuencia(muestras);

      // Une los nombres de ruta (para mostrarlos en el panel).
      const nombres = await pool.query(`SELECT id, nombre FROM rutas`);
      const nombreDe = new Map<number, string>(nombres.rows.map((r) => [r.id as number, r.nombre as string]));

      return {
        dias,
        // Espera estimada ≈ headway / 2 (aproximación; se etiqueta como estimado en la UI).
        espera_estimada_min: global_headway_min !== null ? Math.round((global_headway_min / 2) * 10) / 10 : null,
        global_headway_min,
        rutas: rutas.map((r) => ({ ...r, nombre: nombreDe.get(r.ruta_id) ?? `Ruta ${r.ruta_id}` })),
      };
    });
    frecuenciaCaches.set(dias, c);
  }
  return c;
}

router.get("/reportes/frecuencia", authMiddleware, requireRol("admin"), async (req, res) => {
  res.json(await frecuenciaCache(diasParam(req.query["dias"])).obtener());
});

interface Ocupacion { dias: number; vacio: number; medio: number; lleno: number }

const ocupacionCaches = new Map<number, CacheTtl<Ocupacion>>();
function ocupacionCache(dias: number): CacheTtl<Ocupacion> {
  let c = ocupacionCaches.get(dias);
  if (!c) {
    c = crearCacheTtl(REPORTE_TTL_MS, async () => {
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
      return { dias, vacio: base["vacio"] ?? 0, medio: base["medio"] ?? 0, lleno: base["lleno"] ?? 0 };
    });
    ocupacionCaches.set(dias, c);
  }
  return c;
}

router.get("/reportes/ocupacion", authMiddleware, requireRol("admin"), async (req, res) => {
  res.json(await ocupacionCache(diasParam(req.query["dias"])).obtener());
});

// Cobertura y alcance del servicio: no es de periodo, son conteos actuales
// (footprint del servicio + adopción por la comunidad). Para el resumen
// ejecutivo — qué tan grande es el sistema y si realmente está operando.
router.get("/reportes/cobertura", authMiddleware, requireRol("admin"), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM rutas) AS total_rutas,
       (SELECT COUNT(*)::int FROM paradas) AS total_paradas,
       (SELECT COUNT(*)::int FROM buses) AS total_buses,
       (SELECT COUNT(*)::int FROM buses WHERE estado = 'activo') AS buses_activos_ahora,
       (SELECT COUNT(*)::int FROM usuarios WHERE rol = 'conductor') AS total_conductores,
       (SELECT COUNT(*)::int FROM usuarios WHERE rol = 'pasajero') AS total_pasajeros,
       (SELECT COUNT(*)::int FROM suscripciones_push) AS suscripciones_push,
       (SELECT COUNT(*)::int
          FROM rutas r
          WHERE NOT EXISTS (
            SELECT 1 FROM buses b WHERE b.ruta_id = r.id AND b.estado = 'activo'
          )
       ) AS rutas_sin_bus_activo`,
  );
  const r = rows[0] ?? {};
  res.json({
    totalRutas: Number(r.total_rutas ?? 0),
    totalParadas: Number(r.total_paradas ?? 0),
    totalBuses: Number(r.total_buses ?? 0),
    busesActivosAhora: Number(r.buses_activos_ahora ?? 0),
    rutasSinBusActivo: Number(r.rutas_sin_bus_activo ?? 0),
    totalConductores: Number(r.total_conductores ?? 0),
    totalPasajeros: Number(r.total_pasajeros ?? 0),
    suscripcionesPush: Number(r.suscripciones_push ?? 0),
  });
});

export default router;
