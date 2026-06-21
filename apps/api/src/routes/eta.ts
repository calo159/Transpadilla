import { Router } from "express";
import { db, paradas, ruta_paradas, buses } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { haversineMetros, velEfectiva } from "../lib/geo";

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
router.get("/rutas/:id/eta", async (req, res) => {
  const rutaId = idParam(req.params["id"]);

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
    res.json({ ruta_id: rutaId, buses_activos: 0, paradas: [] });
    return;
  }

  // Distancia acumulada (metros) hasta cada parada.
  const acum: number[] = [0];
  for (let i = 1; i < secuencia.length; i++) {
    const a = secuencia[i - 1]!;
    const b = secuencia[i]!;
    acum.push(acum[i - 1]! + haversineMetros(a.latitud, a.longitud, b.latitud, b.longitud));
  }

  // 2. Buses activos de la ruta con posición conocida.
  const activos = await db
    .select({ placa: buses.placa, lat: buses.lat, lng: buses.lng, velocidad: buses.velocidad })
    .from(buses)
    .where(and(eq(buses.ruta_id, rutaId), eq(buses.estado, "activo")));

  const busesInfo = activos
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => {
      // Parada más cercana al bus (su posición aproximada en la secuencia).
      let idx = 0;
      let mejorDist = Infinity;
      for (let i = 0; i < secuencia.length; i++) {
        const p = secuencia[i]!;
        const d = haversineMetros(b.lat!, b.lng!, p.latitud, p.longitud);
        if (d < mejorDist) { mejorDist = d; idx = i; }
      }
      return { placa: b.placa, idx, vel: velEfectiva(b.velocidad) };
    });

  // 3-4. ETA por parada: el bus que llega más pronto sin haberla pasado.
  const resultado = secuencia.map((parada, j) => {
    let mejor: { eta: number; placa: string } | null = null;
    for (const info of busesInfo) {
      if (info.idx <= j) {
        const distKm = (acum[j]! - acum[info.idx]!) / 1000;
        const eta = (distKm / info.vel) * 60; // minutos
        if (mejor === null || eta < mejor.eta) mejor = { eta, placa: info.placa };
      }
    }
    return {
      parada_id: parada.id,
      nombre: parada.nombre,
      eta_min: mejor ? Math.round(mejor.eta) : null,
      placa: mejor ? mejor.placa : null,
    };
  });

  res.json({ ruta_id: rutaId, buses_activos: busesInfo.length, paradas: resultado });
});

export default router;
