// Utilidades PURAS de push (sin dependencias de BD/web-push) para poder testear
// sin necesidad de DATABASE_URL ni de inicializar el SDK.

/** De una lista de suscripciones, las que siguen `rutaId`. */
export function suscripcionesParaRuta<T extends { rutas: number[] }>(subs: T[], rutaId: number): T[] {
  return subs.filter((s) => Array.isArray(s.rutas) && s.rutas.includes(rutaId));
}
