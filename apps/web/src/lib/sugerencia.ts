import type { Bus, Ruta, Parada } from "@workspace/api-client";
import { distanciaKm, velEfectiva, posEnCircuito, distanciaAdelanteM } from "@/lib/geo";

export interface Punto { lat: number; lng: number }

/** Resultado de recomendar una ruta para llegar a un destino. */
export interface Sugerencia {
  ruta: Ruta;
  paradaDestino: Parada;
  dCaminaDestinoKm: number;
  /** Parada de abordaje (solo si se conoce el origen del usuario). */
  paradaOrigen: Parada | null;
  dCaminaOrigenKm: number | null;
}

/** Bus más cercano de una ruta a un punto de referencia, con su ETA estimado. */
export interface BusCercano {
  bus: Bus;
  distKm: number;
  etaMin: number;
}

// Si la parada más cercana al destino queda más lejos que esto, ninguna ruta
// "sirve" razonablemente ese punto (caminata excesiva).
const MAX_CAMINATA_KM = 1.2;

function paradaMasCercana(paradas: Parada[], punto: Punto): { parada: Parada; idx: number; distKm: number } | null {
  let mejor: { parada: Parada; idx: number; distKm: number } | null = null;
  paradas.forEach((parada, idx) => {
    const distKm = distanciaKm(punto.lat, punto.lng, parada.latitud, parada.longitud);
    if (!mejor || distKm < mejor.distKm) mejor = { parada, idx, distKm };
  });
  return mejor;
}

/**
 * Recomienda la mejor ruta para ir de `origen` (GPS del usuario, opcional) a
 * `destino` (punto tocado en el mapa).
 *
 * - Con origen: minimiza la caminata total (origen→parada de abordaje +
 *   parada de bajada→destino), penalizando ir en sentido contrario (la parada de
 *   abordaje debe estar antes que la de bajada en el orden de la ruta).
 * - Sin origen: elige la ruta cuya parada quede más cerca del destino.
 *
 * Devuelve `null` si ninguna ruta pasa razonablemente cerca del destino.
 */
export function recomendarRuta(rutas: Ruta[], destino: Punto, origen?: Punto | null): Sugerencia | null {
  let mejor: (Sugerencia & { score: number }) | null = null;

  for (const ruta of rutas) {
    if (!ruta.activa || ruta.paradas.length === 0) continue;

    const dest = paradaMasCercana(ruta.paradas, destino);
    if (!dest) continue;

    let paradaOrigen: Parada | null = null;
    let dCaminaOrigenKm: number | null = null;
    let score = dest.distKm;

    if (origen) {
      const orig = paradaMasCercana(ruta.paradas, origen);
      if (orig) {
        paradaOrigen = orig.parada;
        dCaminaOrigenKm = orig.distKm;
        // Caminata total (origen→abordaje + bajada→destino). En un circuito cerrado
        // NO se penaliza "subir después de bajar": el bus siempre alcanza la parada de
        // bajada dando la vuelta. Como desempate se suma el trayecto a bordo (más corto
        // = más directo) escalado a un peso pequeño para no dominar sobre la caminata.
        const abordaje = posEnCircuito(orig.parada.latitud, orig.parada.longitud, ruta.paradas);
        const bajada = posEnCircuito(dest.parada.latitud, dest.parada.longitud, ruta.paradas);
        const trayectoKm = abordaje && bajada ? distanciaAdelanteM(abordaje.s, bajada.s, abordaje.L) / 1000 : 0;
        score = orig.distKm + dest.distKm + trayectoKm * 0.1;
      }
    }

    if (!mejor || score < mejor.score) {
      mejor = {
        score,
        ruta,
        paradaDestino: dest.parada,
        dCaminaDestinoKm: dest.distKm,
        paradaOrigen,
        dCaminaOrigenKm,
      };
    }
  }

  if (!mejor || mejor.dCaminaDestinoKm > MAX_CAMINATA_KM) return null;
  const { score: _score, ...sugerencia } = mejor;
  return sugerencia;
}

/**
 * Entre los buses ACTIVOS de una ruta con posición conocida, el PRÓXIMO en llegar
 * al punto de referencia (la parada de abordaje, o el destino si no hay origen).
 *
 * Con `paradas` (las de la ruta, en orden) se usa la distancia POR DELANTE en el
 * sentido de circulación del circuito: un bus que ya pasó la referencia queda al
 * final (debe dar casi toda la vuelta), no primero por estar cerca en línea recta.
 * Sin `paradas` (o si la proyección falla) se cae a la distancia en línea recta.
 * `distKm` en el resultado es la distancia usada para ordenar (a lo largo o recta).
 */
export function busMasCercano(buses: Bus[], rutaId: number, referencia: Punto, paradas?: Parada[]): BusCercano | null {
  const refPos = paradas && paradas.length >= 2 ? posEnCircuito(referencia.lat, referencia.lng, paradas) : null;
  let mejor: BusCercano | null = null;
  for (const bus of buses) {
    if (bus.ruta_id !== rutaId || bus.estado === "inactivo") continue;
    if (bus.lat == null || bus.lng == null) continue;
    let distKm: number;
    if (refPos) {
      const busPos = posEnCircuito(bus.lat, bus.lng, paradas!);
      distKm = busPos ? distanciaAdelanteM(busPos.s, refPos.s, refPos.L) / 1000 : distanciaKm(referencia.lat, referencia.lng, bus.lat, bus.lng);
    } else {
      distKm = distanciaKm(referencia.lat, referencia.lng, bus.lat, bus.lng);
    }
    const etaMin = Math.max(0, Math.round((distKm / velEfectiva(bus.velocidad)) * 60));
    if (!mejor || distKm < mejor.distKm) mejor = { bus, distKm, etaMin };
  }
  return mejor;
}
