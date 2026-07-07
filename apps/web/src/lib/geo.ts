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
 * Punto más cercano de una polilínea (la línea dibujada de una ruta) a una
 * coordenada dada: proyecta el punto sobre cada segmento y devuelve el más
 * próximo, con su distancia real en km. Usa un plano local equirectangular
 * (`x = lng·cos(lat)`, `y = lat`) para la proyección — exacto a escala urbana.
 * `linea` vacía → `null`; un solo punto → ese punto.
 */
export function puntoMasCercanoEnLinea(
  lat: number,
  lng: number,
  linea: [number, number][]
): { lat: number; lng: number; distKm: number } | null {
  if (linea.length === 0) return null;
  if (linea.length === 1) {
    const [la, lo] = linea[0]!;
    return { lat: la, lng: lo, distKm: distanciaKm(lat, lng, la, lo) };
  }
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const px = lng * cosLat;
  const py = lat;
  let best: { lat: number; lng: number; d2: number } | null = null;
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
      best = { lat: aLa + t * (bLa - aLa), lng: aLo + t * (bLo - aLo), d2 };
    }
  }
  return best ? { lat: best.lat, lng: best.lng, distKm: distanciaKm(lat, lng, best.lat, best.lng) } : null;
}
