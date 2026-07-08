// Utilidades geográficas para estimar distancias y tiempos de llegada.

/** Distancia en km entre dos coordenadas (fórmula de Haversine). */
export function distanciaKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Velocidad efectiva (km/h) para estimar el ETA: si el bus está detenido o sin
 * dato, usamos un promedio urbano para no dividir por cero.
 */
export function velEfectiva(v: number | null | undefined): number {
  return !v || v < 5 ? 18 : v;
}

/**
 * Proyección de un punto sobre una polilínea: devuelve el segmento más cercano
 * (`segIdx`), el parámetro `t`∈[0,1] dentro de ese segmento y el punto proyectado.
 * Usa un plano local equirectangular (`x = lng·cos(lat)`, `y = lat`) — exacto a
 * escala urbana. `linea` vacía → `null`. Base común de `puntoMasCercanoEnLinea`
 * y de la proyección sobre el circuito (`posEnCircuito`).
 */
export function proyectarEnLinea(
  lat: number,
  lng: number,
  linea: [number, number][]
): { lat: number; lng: number; segIdx: number; t: number; distKm: number } | null {
  if (linea.length === 0) return null;
  if (linea.length === 1) {
    const [la, lo] = linea[0]!;
    return { lat: la, lng: lo, segIdx: 0, t: 0, distKm: distanciaKm(lat, lng, la, lo) };
  }
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const px = lng * cosLat;
  const py = lat;
  let best: { lat: number; lng: number; segIdx: number; t: number; d2: number } | null = null;
  for (let i = 0; i < linea.length - 1; i++) {
    const [aLa, aLo] = linea[i]!;
    const [bLa, bLo] = linea[i + 1]!;
    const ax = aLo * cosLat, ay = aLa;
    const bx = bLo * cosLat, by = bLa;
    const abx = bx - ax, aby = by - ay;
    const denom = abx * abx + aby * aby;
    let t = denom === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / denom;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + t * abx, qy = ay + t * aby;
    const dx = px - qx, dy = py - qy;
    const d2 = dx * dx + dy * dy;
    if (!best || d2 < best.d2) {
      best = { lat: aLa + t * (bLa - aLa), lng: aLo + t * (bLo - aLo), segIdx: i, t, d2 };
    }
  }
  if (!best) return null;
  return { lat: best.lat, lng: best.lng, segIdx: best.segIdx, t: best.t, distKm: distanciaKm(lat, lng, best.lat, best.lng) };
}

/**
 * Punto más cercano de una polilínea (la línea dibujada de una ruta) a una
 * coordenada dada, con su distancia real en km. `linea` vacía → `null`.
 */
export function puntoMasCercanoEnLinea(
  lat: number,
  lng: number,
  linea: [number, number][]
): { lat: number; lng: number; distKm: number } | null {
  const p = proyectarEnLinea(lat, lng, linea);
  return p ? { lat: p.lat, lng: p.lng, distKm: p.distKm } : null;
}

/**
 * Proyecta un punto sobre el CIRCUITO CERRADO definido por las paradas en orden
 * (se cierra volviendo a la primera parada). Devuelve:
 *  - `s`: metros recorridos desde la primera parada EN EL SENTIDO del recorrido.
 *  - `L`: longitud total del circuito cerrado (metros).
 *  - `distPerpM`: distancia perpendicular del punto a la línea (metros), para saber
 *    si el punto pertenece razonablemente a la ruta.
 * Menos de 2 paradas → `null`. Es la base de la proximidad direccional: comparar el
 * `s` del bus con el `s` del usuario (con wrap-around) da cuánto falta por el recorrido.
 */
export function posEnCircuito(
  lat: number,
  lng: number,
  paradas: { latitud: number; longitud: number }[]
): { s: number; L: number; distPerpM: number } | null {
  if (paradas.length < 2) return null;
  // Polilínea cerrada: paradas en orden + la primera al final.
  const linea: [number, number][] = paradas.map((p) => [p.latitud, p.longitud]);
  linea.push([paradas[0]!.latitud, paradas[0]!.longitud]);
  // Longitud acumulada (metros) hasta el inicio de cada segmento.
  const acum: number[] = [0];
  for (let i = 1; i < linea.length; i++) {
    const [aLa, aLo] = linea[i - 1]!;
    const [bLa, bLo] = linea[i]!;
    acum.push(acum[i - 1]! + distanciaKm(aLa, aLo, bLa, bLo) * 1000);
  }
  const L = acum[acum.length - 1]!;
  const proy = proyectarEnLinea(lat, lng, linea);
  if (!proy) return null;
  const [aLa, aLo] = linea[proy.segIdx]!;
  const [bLa, bLo] = linea[proy.segIdx + 1]!;
  const lenSeg = distanciaKm(aLa, aLo, bLa, bLo) * 1000;
  const s = acum[proy.segIdx]! + proy.t * lenSeg;
  return { s, L, distPerpM: proy.distKm * 1000 };
}

/**
 * Distancia (metros) que hay que avanzar POR EL RECORRIDO, en el sentido de
 * circulación, desde `sDesde` hasta `sHasta` en un circuito de longitud `L`
 * (con wrap-around). Un bus que ya pasó al usuario obtiene ≈ `L` (casi una vuelta).
 */
export function distanciaAdelanteM(sDesde: number, sHasta: number, L: number): number {
  if (L <= 0) return 0;
  return ((sHasta - sDesde) % L + L) % L;
}
