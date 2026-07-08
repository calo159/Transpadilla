import { haversineMetros, velEfectiva, posEnCircuito, distanciaAdelanteM } from "./geo";

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
 * testearlo sin DB). Las rutas son CIRCUITOS CERRADOS de un solo sentido, así que:
 *  1. Se ubica cada parada y cada bus por su posición `s` A LO LARGO del circuito
 *     (metros desde la 1ª parada en el sentido del recorrido), con `L` = longitud total.
 *  2. Por cada parada, ETA del bus = distancia POR DELANTE (con wrap-around) ÷ velocidad.
 *     Un bus que ya pasó la parada da casi una vuelta completa (no ETA cero/negativo).
 *  3. Se queda con el bus que llega más pronto a cada parada.
 */
export function calcularEtaPorParada(
  secuencia: EtaParadaInput[],
  activos: EtaBusInput[],
): { buses_activos: number; paradas: EtaParadaResult[] } {
  if (secuencia.length === 0) return { buses_activos: 0, paradas: [] };

  // Posición `s` de cada parada a lo largo del circuito cerrado (acumulado hasta ella).
  const acum: number[] = [0];
  for (let i = 1; i < secuencia.length; i++) {
    const a = secuencia[i - 1]!;
    const b = secuencia[i]!;
    acum.push(acum[i - 1]! + haversineMetros(a.latitud, a.longitud, b.latitud, b.longitud));
  }

  // Buses con posición conocida → su `s` proyectado sobre el circuito y su velocidad.
  const busesInfo = activos
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => {
      const pos = posEnCircuito(b.lat!, b.lng!, secuencia);
      return { placa: b.placa, s: pos ? pos.s : null, L: pos ? pos.L : null, vel: velEfectiva(b.velocidad) };
    });

  // ETA por parada: el bus que llega más pronto por delante en el sentido del recorrido.
  const paradas = secuencia.map((parada, j) => {
    let mejor: { eta: number; placa: string } | null = null;
    for (const info of busesInfo) {
      if (info.s == null || info.L == null) continue;
      const distM = distanciaAdelanteM(info.s, acum[j]!, info.L);
      const eta = (distM / 1000 / info.vel) * 60; // minutos
      if (mejor === null || eta < mejor.eta) mejor = { eta, placa: info.placa };
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
