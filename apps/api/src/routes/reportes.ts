import { Router } from "express";
import { pool } from "@workspace/db";
import { authMiddleware, requireRol } from "../middleware/auth";
import { calcularFrecuencia, type MuestraFrec } from "../lib/frecuencia";
import { crearCacheTtl, type CacheTtl } from "../lib/cache";
import { rateLimit } from "../middleware/rate-limit";

// Reportes históricos para el panel admin (km recorridos, ocupación, actividad).
// Se calculan sobre posiciones_historial (alimentada por el job de snapshot),
// que puede crecer bastante con el uso — se cachean 60s por combinación de
// parámetros (mismo patrón que el caché de ETA en eta.ts) para no recalcular
// en cada refresco del panel ni bajo ráfagas de varios admins a la vez.
// Solo admin: son datos de gestión, no públicos.
const router = Router();
const REPORTE_TTL_MS = 60_000;
// El caché de 60s ya evita recalcular las consultas pesadas, pero cada request
// igual paga la verificación de sesión (consulta a la BD en authMiddleware); un
// token de admin robado no debería poder machacarla. Generoso para no chocar con
// el refresco normal del panel (15-20s).
router.use(rateLimit({ ventanaMs: 60_000, max: 60 }));

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

// ── Insights por ruta (ranking): km, buses, ocupación y seguidores ────────────
// Alimenta el "Resumen ejecutivo": ruta más solicitada (seguidores = favoritos),
// ocupación por ruta y la tabla comparativa. Un solo endpoint para no repetir el
// escaneo del historial en el frontend.
interface RutaInsight {
  ruta_id: number; nombre: string; color: string;
  km: number; buses: number; muestras: number;
  vacio: number; medio: number; lleno: number;
  seguidores: number; opero: boolean;
}
interface RutasInsights { dias: number; rutas: RutaInsight[] }

const rutasInsightCaches = new Map<number, CacheTtl<RutasInsights>>();
function rutasInsightCache(dias: number): CacheTtl<RutasInsights> {
  let c = rutasInsightCaches.get(dias);
  if (!c) {
    c = crearCacheTtl(REPORTE_TTL_MS, async () => {
      const { rows } = await pool.query(
        `WITH p AS (
           SELECT bus_id, ruta_id, lat, lng, ocupacion,
                  lag(lat) OVER w AS plat,
                  lag(lng) OVER w AS plng
           FROM posiciones_historial
           WHERE capturado >= now() - ($1 || ' days')::interval
           WINDOW w AS (PARTITION BY bus_id ORDER BY capturado)
         ),
         km AS (
           SELECT ruta_id,
             COALESCE(SUM(
               6371 * 2 * asin(sqrt(
                 power(sin(radians(lat - plat) / 2), 2) +
                 cos(radians(plat)) * cos(radians(lat)) *
                 power(sin(radians(lng - plng) / 2), 2)
               ))
             ) FILTER (WHERE plat IS NOT NULL AND
               6371 * 2 * asin(sqrt(
                 power(sin(radians(lat - plat) / 2), 2) +
                 cos(radians(plat)) * cos(radians(lat)) *
                 power(sin(radians(lng - plng) / 2), 2)
               )) < $2), 0) AS km,
             COUNT(*)                 AS muestras,
             COUNT(DISTINCT bus_id)   AS buses,
             COUNT(*) FILTER (WHERE ocupacion = 'vacio') AS vacio,
             COUNT(*) FILTER (WHERE ocupacion = 'medio') AS medio,
             COUNT(*) FILTER (WHERE ocupacion = 'lleno') AS lleno
           FROM p
           WHERE ruta_id IS NOT NULL
           GROUP BY ruta_id
         ),
         fav AS (
           SELECT ruta_id, COUNT(DISTINCT cliente_id) AS seguidores
           FROM favoritos GROUP BY ruta_id
         )
         SELECT r.id AS ruta_id, r.nombre, r.color,
                COALESCE(km.km, 0)        AS km,
                COALESCE(km.buses, 0)     AS buses,
                COALESCE(km.muestras, 0)  AS muestras,
                COALESCE(km.vacio, 0)     AS vacio,
                COALESCE(km.medio, 0)     AS medio,
                COALESCE(km.lleno, 0)     AS lleno,
                COALESCE(fav.seguidores, 0) AS seguidores
         FROM rutas r
         LEFT JOIN km  ON km.ruta_id  = r.id
         LEFT JOIN fav ON fav.ruta_id = r.id
         ORDER BY seguidores DESC, km DESC`,
        [String(dias), MAX_SEG_KM],
      );
      return {
        dias,
        rutas: rows.map((r) => ({
          ruta_id: r.ruta_id as number,
          nombre: r.nombre as string,
          color: r.color as string,
          km: Math.round(Number(r.km) * 10) / 10,
          buses: Number(r.buses),
          muestras: Number(r.muestras),
          vacio: Number(r.vacio),
          medio: Number(r.medio),
          lleno: Number(r.lleno),
          seguidores: Number(r.seguidores),
          opero: Number(r.muestras) > 0,
        })),
      };
    });
    rutasInsightCaches.set(dias, c);
  }
  return c;
}

router.get("/reportes/rutas", authMiddleware, requireRol("admin"), async (req, res) => {
  res.json(await rutasInsightCache(diasParam(req.query["dias"])).obtener());
});

// ── Actividad por hora del día y por día de la semana ─────────────────────────
// "Hora pico" y "día más movido": cuántas muestras (buses circulando) y cuántas
// con el bus lleno hubo en cada franja. dow: 0=domingo … 6=sábado (EXTRACT DOW).
interface Actividad {
  dias: number;
  horas: { h: number; muestras: number; llenos: number }[];
  dias_semana: { dow: number; muestras: number; llenos: number }[];
}

const actividadCaches = new Map<number, CacheTtl<Actividad>>();
function actividadCache(dias: number): CacheTtl<Actividad> {
  let c = actividadCaches.get(dias);
  if (!c) {
    c = crearCacheTtl(REPORTE_TTL_MS, async () => {
      const hq = await pool.query(
        `SELECT EXTRACT(HOUR FROM capturado)::int AS h,
                COUNT(*)::int AS muestras,
                COUNT(*) FILTER (WHERE ocupacion = 'lleno')::int AS llenos
           FROM posiciones_historial
           WHERE capturado >= now() - ($1 || ' days')::interval
           GROUP BY h`,
        [String(dias)],
      );
      const dq = await pool.query(
        `SELECT EXTRACT(DOW FROM capturado)::int AS dow,
                COUNT(*)::int AS muestras,
                COUNT(*) FILTER (WHERE ocupacion = 'lleno')::int AS llenos
           FROM posiciones_historial
           WHERE capturado >= now() - ($1 || ' days')::interval
           GROUP BY dow`,
        [String(dias)],
      );
      // Rellena las 24 horas y 7 días aunque no tengan datos (para la gráfica).
      const horasMap = new Map<number, { muestras: number; llenos: number }>(
        hq.rows.map((r) => [Number(r.h), { muestras: Number(r.muestras), llenos: Number(r.llenos) }]),
      );
      const diasMap = new Map<number, { muestras: number; llenos: number }>(
        dq.rows.map((r) => [Number(r.dow), { muestras: Number(r.muestras), llenos: Number(r.llenos) }]),
      );
      return {
        dias,
        horas: Array.from({ length: 24 }, (_, h) => ({ h, ...(horasMap.get(h) ?? { muestras: 0, llenos: 0 }) })),
        dias_semana: Array.from({ length: 7 }, (_, dow) => ({ dow, ...(diasMap.get(dow) ?? { muestras: 0, llenos: 0 }) })),
      };
    });
    actividadCaches.set(dias, c);
  }
  return c;
}

router.get("/reportes/actividad", authMiddleware, requireRol("admin"), async (req, res) => {
  res.json(await actividadCache(diasParam(req.query["dias"])).obtener());
});

// Cobertura y alcance del servicio: no es de periodo, son conteos actuales
// (footprint del servicio + adopción por la comunidad). Para el resumen
// ejecutivo — qué tan grande es el sistema y si realmente está operando.
// Cacheado 60 s igual que el resto de reportes (se llama en cada carga del
// panel y hace 8 subconsultas de conteo, incluido un NOT EXISTS por ruta).
interface Cobertura {
  totalRutas: number; totalParadas: number; totalBuses: number;
  busesActivosAhora: number; rutasSinBusActivo: number;
  totalConductores: number; totalPasajeros: number; suscripcionesPush: number;
}

const coberturaCache = crearCacheTtl<Cobertura>(REPORTE_TTL_MS, async () => {
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
  return {
    totalRutas: Number(r.total_rutas ?? 0),
    totalParadas: Number(r.total_paradas ?? 0),
    totalBuses: Number(r.total_buses ?? 0),
    busesActivosAhora: Number(r.buses_activos_ahora ?? 0),
    rutasSinBusActivo: Number(r.rutas_sin_bus_activo ?? 0),
    totalConductores: Number(r.total_conductores ?? 0),
    totalPasajeros: Number(r.total_pasajeros ?? 0),
    suscripcionesPush: Number(r.suscripciones_push ?? 0),
  };
});

router.get("/reportes/cobertura", authMiddleware, requireRol("admin"), async (_req, res) => {
  res.json(await coberturaCache.obtener());
});

export default router;
