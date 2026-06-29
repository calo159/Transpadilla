import { Router } from "express";
import { db, paradas, ruta_paradas, buses } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { calcularEtaPorParada } from "../lib/eta-calc";
import { crearCacheTtl, type CacheTtl } from "../lib/cache";

// Estimación de tiempo de llegada (ETA) del próximo bus a cada parada de una
// ruta, calculada en el API Node (Haversine sobre las paradas de la ruta).
// Lectura pública (la usa el mapa del pasajero, sin login).
const router = Router();

const idParam = (raw: unknown): number => parseInt(String(raw));

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
    .orderBy(ruta_paradas.orden);

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

router.get("/rutas/:id/eta", async (req, res) => {
  const rutaId = idParam(req.params["id"]);
  res.json(await etaCache(rutaId).obtener());
});

export default router;
