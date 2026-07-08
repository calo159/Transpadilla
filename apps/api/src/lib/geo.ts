// Utilidades geográficas del backend (espejo de apps/web/src/lib/geo.ts).

/** Distancia en METROS entre dos coordenadas (fórmula de Haversine). */
export function haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // radio de la Tierra en metros
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Velocidad efectiva (km/h) para estimar el ETA: si el bus está detenido o sin
 * dato, usamos un promedio urbano para no dividir por cero.
 */
export function velEfectiva(v: number | null | undefined): number {
  return !v || v < 5 ? 18 : v;
}

/**
 * Proyección de un punto sobre una polilínea (plano local equirectangular). Devuelve
 * el segmento más cercano (`segIdx`), el parámetro `t`∈[0,1] y la distancia perpendicular
 * en metros. Espejo de `proyectarEnLinea` de apps/web. `linea` vacía → `null`.
 */
export function proyectarEnLinea(
  lat: number,
  lng: number,
  linea: [number, number][],
): { segIdx: number; t: number; distPerpM: number } | null {
  if (linea.length === 0) return null;
  if (linea.length === 1) {
    const [la, lo] = linea[0]!;
    return { segIdx: 0, t: 0, distPerpM: haversineMetros(lat, lng, la, lo) };
  }
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const px = lng * cosLat;
  const py = lat;
  let best: { segIdx: number; t: number; qLat: number; qLng: number; d2: number } | null = null;
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
      best = { segIdx: i, t, qLat: aLa + t * (bLa - aLa), qLng: aLo + t * (bLo - aLo), d2 };
    }
  }
  if (!best) return null;
  return { segIdx: best.segIdx, t: best.t, distPerpM: haversineMetros(lat, lng, best.qLat, best.qLng) };
}

/**
 * Proyecta un punto sobre el CIRCUITO CERRADO definido por las paradas en orden
 * (se cierra volviendo a la primera). Devuelve `s` (metros recorridos desde la 1ª
 * parada en el sentido del recorrido), `L` (longitud total del circuito) y
 * `distPerpM` (distancia perpendicular a la línea). Menos de 2 paradas → `null`.
 * Espejo de `posEnCircuito` de apps/web.
 */
export function posEnCircuito(
  lat: number,
  lng: number,
  paradas: { latitud: number; longitud: number }[],
): { s: number; L: number; distPerpM: number } | null {
  if (paradas.length < 2) return null;
  const linea: [number, number][] = paradas.map((p) => [p.latitud, p.longitud]);
  linea.push([paradas[0]!.latitud, paradas[0]!.longitud]); // cerrar el circuito
  const acum: number[] = [0];
  for (let i = 1; i < linea.length; i++) {
    const [aLa, aLo] = linea[i - 1]!;
    const [bLa, bLo] = linea[i]!;
    acum.push(acum[i - 1]! + haversineMetros(aLa, aLo, bLa, bLo));
  }
  const L = acum[acum.length - 1]!;
  const proy = proyectarEnLinea(lat, lng, linea);
  if (!proy) return null;
  const [aLa, aLo] = linea[proy.segIdx]!;
  const [bLa, bLo] = linea[proy.segIdx + 1]!;
  const lenSeg = haversineMetros(aLa, aLo, bLa, bLo);
  const s = acum[proy.segIdx]! + proy.t * lenSeg;
  return { s, L, distPerpM: proy.distPerpM };
}

/**
 * Distancia (metros) a avanzar POR EL RECORRIDO, en el sentido de circulación,
 * desde `sDesde` hasta `sHasta` en un circuito de longitud `L` (wrap-around).
 * Espejo de `distanciaAdelanteM` de apps/web.
 */
export function distanciaAdelanteM(sDesde: number, sHasta: number, L: number): number {
  if (L <= 0) return 0;
  return ((sHasta - sDesde) % L + L) % L;
}
