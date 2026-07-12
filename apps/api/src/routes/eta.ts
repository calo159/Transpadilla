import { Router } from "express";
import { db, rutas, paradas, ruta_paradas, buses } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { calcularEtaPorParada } from "../lib/eta-calc";
import { crearCacheTtl, type CacheTtl } from "../lib/cache";
import { parseIdParam } from "../middleware/validate";

// Estimación de tiempo de llegada (ETA) del próximo bus a cada parada de una
// ruta, calculada en el API Node (Haversine sobre las paradas de la ruta).
// Lectura pública (la usa el mapa del pasajero, sin login).
const router = Router();

/**
 * Algoritmo:
 *  1. Paradas de la ruta en orden + distancia acumulada entre ellas (Haversine).
 *  2. Para cada bus activo de la ruta, ubicar su parada más cercana (posición
 *     aproximada en la secuencia).
 *  3. Para cada parada futura, ETA = distancia restante ÷ velocidad efectiva.
 *  4. Por parada, devolver el bus que llega más pronto.
 */
type EtaResultado = { ruta_id: number; buses_activos: number; paradas: ReturnType<typeof calcularEtaPorParada>["paradas"] };

async function calcularEta(rutaId: number): Promise<EtaResultado> {
  // 1. Secuencia de paradas de la ruta, en orden.
  const secuencia = await db
    .select({
      id: paradas.id,
      nombre: paradas.nombre,
      latitud: paradas.latitud,
      longitud: paradas.longitud,
      orden: ruta_paradas.orden,
    })
    .from(ruta_paradas)
    .innerJoin(paradas, eq(ruta_paradas.parada_id, paradas.id))
    .where(eq(ruta_paradas.ruta_id, rutaId))
    // Desempate estable por id de asignación (ver rutas.ts): si dos paradas
    // quedaran con el mismo `orden`, el orden de salida es siempre el mismo.
    .orderBy(ruta_paradas.orden, ruta_paradas.id);

  if (secuencia.length === 0) {
    return { ruta_id: rutaId, buses_activos: 0, paradas: [] };
  }

  // 2. Buses activos de la ruta con posición conocida.
  const activos = await db
    .select({ placa: buses.placa, lat: buses.lat, lng: buses.lng, velocidad: buses.velocidad })
    .from(buses)
    .where(and(eq(buses.ruta_id, rutaId), eq(buses.estado, "activo")));

  // 3-4. Cálculo del ETA (lógica pura y testeable; ver lib/eta-calc.ts).
  const { buses_activos, paradas: resultado } = calcularEtaPorParada(secuencia, activos);
  return { ruta_id: rutaId, buses_activos, paradas: resultado };
}

// Caché por ruta (TTL 4 s): muchos pasajeros de la misma ruta comparten el mismo
// cálculo, así no se repiten 2 queries + Haversine por cada request.
const etaCaches = new Map<number, CacheTtl<EtaResultado>>();
function etaCache(rutaId: number): CacheTtl<EtaResultado> {
  let c = etaCaches.get(rutaId);
  if (!c) {
    c = crearCacheTtl(4000, () => calcularEta(rutaId));
    etaCaches.set(rutaId, c);
  }
  return c;
}

// Set de ids de ruta válidos, cacheado 5 s. La validación de existencia corría en
// CADA request de ETA (y el mapa hace polling cada pocos segundos por cada pasajero);
// contra este set en memoria evita pegar a la BD en el camino caliente. Mantiene el
// mismo 404 si la ruta no existe (la única diferencia es una ventana de ~5 s de
// consistencia al crear/borrar rutas, algo que ya ocurre con el resto de cachés).
const idsRutaCache = crearCacheTtl<Set<number>>(5000, async () => {
  const filas = await db.select({ id: rutas.id }).from(rutas);
  return new Set(filas.map((f) => f.id));
});

router.get("/rutas/:id/eta", async (req, res) => {
  const rutaId = parseIdParam(req.params["id"]);
  if (rutaId === null) { res.status(400).json({ error: "Id de ruta inválido" }); return; }
  const ids = await idsRutaCache.obtener();
  if (!ids.has(rutaId)) { res.status(404).json({ error: "Ruta no encontrada" }); return; }
  res.json(await etaCache(rutaId).obtener());
});

export default router;
