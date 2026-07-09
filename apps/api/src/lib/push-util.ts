// Utilidades PURAS de push (sin dependencias de BD/web-push) para poder testear
// sin necesidad de DATABASE_URL ni de inicializar el SDK.

/** De una lista de suscripciones, las que siguen `rutaId`. */
export function suscripcionesParaRuta<T extends { rutas: number[] }>(subs: T[], rutaId: number): T[] {
  return subs.filter((s) => Array.isArray(s.rutas) && s.rutas.includes(rutaId));
}

// Dominios reales de los servicios de push de los navegadores soportados. El
// endpoint de suscripción SIEMPRE lo genera el navegador (nunca lo escribe el
// usuario a mano), así que en producción debe caer en uno de estos hosts.
// Es una ALLOWLIST (no una lista de IPs/hosts prohibidos): cualquier IP —
// privada o pública— y cualquier dominio ajeno quedan rechazados por
// construcción, sin necesitar detectar rangos privados aparte. Cierra el SSRF
// ciego de `webpush.sendNotification` (el servidor hace la petición HTTP al
// endpoint guardado).
const SUFIJOS_PUSH_PERMITIDOS = [
  "fcm.googleapis.com",
  "googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

/**
 * Valida que el host de un endpoint de suscripción Web Push sea uno de los
 * servicios de push reales (o localhost, solo fuera de producción).
 */
export function hostEndpointValido(endpoint: string, esProduccion: boolean): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return !esProduccion && url.protocol === "http:" && url.hostname === "localhost";
  }
  const host = url.hostname.toLowerCase();
  return SUFIJOS_PUSH_PERMITIDOS.some((sufijo) => host === sufijo || host.endsWith(`.${sufijo}`));
}
