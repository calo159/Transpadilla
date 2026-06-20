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
