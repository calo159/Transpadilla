import { haversineMetros, velEfectiva } from "./geo";

export interface EtaParadaInput {
  id: number;
  nombre: string;
  latitud: number;
  longitud: number;
}

export interface EtaBusInput {
  placa: string;
  lat: number | null;
  lng: number | null;
  velocidad: number | null;
}

export interface EtaParadaResult {
  parada_id: number;
  nombre: string;
  eta_min: number | null;
  placa: string | null;
}

/**
 * Cálculo PURO del ETA del próximo bus por parada (separado de la ruta para poder
 * testearlo sin DB). Algoritmo:
 *  1. Distancia acumulada (metros) entre paradas consecutivas (Haversine).
 *  2. Para cada bus con posición, ubicar su parada más cercana (su `idx` aprox).
 *  3. Por cada parada, ETA = distancia restante ÷ velocidad efectiva; se queda con
 *     el bus que llega más pronto sin haber pasado la parada (`idx <= j`).
 */
export function calcularEtaPorParada(
  secuencia: EtaParadaInput[],
  activos: EtaBusInput[],
): { buses_activos: number; paradas: EtaParadaResult[] } {
  if (secuencia.length === 0) return { buses_activos: 0, paradas: [] };

  // Distancia acumulada (metros) hasta cada parada.
  const acum: number[] = [0];
  for (let i = 1; i < secuencia.length; i++) {
    const a = secuencia[i - 1]!;
    const b = secuencia[i]!;
    acum.push(acum[i - 1]! + haversineMetros(a.latitud, a.longitud, b.latitud, b.longitud));
  }

  // Buses con posición conocida → su parada más cercana en la secuencia.
  const busesInfo = activos
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => {
      let idx = 0;
      let mejorDist = Infinity;
      for (let i = 0; i < secuencia.length; i++) {
        const p = secuencia[i]!;
        const d = haversineMetros(b.lat!, b.lng!, p.latitud, p.longitud);
        if (d < mejorDist) { mejorDist = d; idx = i; }
      }
      return { placa: b.placa, idx, vel: velEfectiva(b.velocidad) };
    });

  // ETA por parada: el bus que llega más pronto sin haberla pasado.
  const paradas = secuencia.map((parada, j) => {
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

  return { buses_activos: busesInfo.length, paradas };
}
