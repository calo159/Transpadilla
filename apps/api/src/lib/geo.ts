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
