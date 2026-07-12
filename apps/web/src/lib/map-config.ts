// Configuración del mapa y del cálculo de rutas, parametrizable por entorno.
//
// Por defecto se usan los servicios PÚBLICOS de OpenStreetMap y el servidor de
// demostración de OSRM, que sirven para desarrollo y demos, pero NO tienen
// garantía de servicio (SLA) ni límites altos para producción.
//
// Para producción se apunta a un proveedor con SLA (o a un servidor propio)
// definiendo estas variables en el BUILD del frontend. Guía: docs/MAPA.md.
//   VITE_MAP_TILES_URL  -> URL de tiles, p. ej. MapTiler:
//       https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=TU_KEY
//   VITE_MAP_ATTRIBUTION-> atribución a mostrar (p. ej. "© MapTiler © OpenStreetMap")
//   VITE_OSRM_URL       -> base de tu OSRM (p. ej. https://osrm.mialcaldia.gov.co)

const env = import.meta.env as Record<string, string | undefined>;

export const TILES_URL =
  env.VITE_MAP_TILES_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILES_ATTRIBUTION =
  env.VITE_MAP_ATTRIBUTION ?? '© <a href="https://openstreetmap.org">OpenStreetMap</a>';

// Zoom máximo NATIVO = el último nivel que el proveedor REALMENTE sirve como tile.
// Si el mapa deja acercar más allá de este número, Leaflet no tiene un tile que
// mostrar y lo estira sintéticamente: en varios navegadores móviles esa ampliación
// se ve EN BLANCO. Por eso hay que clavarlo al valor real del proveedor, no a un
// estimado. Valores confirmados contra el tiles.json de cada proveedor:
//   - MapTiler streets-v2/256 → maxzoom 22 (consultado en api.maptiler.com).
//   - OpenStreetMap (fallback de dev, tile.openstreetmap.org) → 19.
// El default se elige según si hay un proveedor propio configurado; se puede
// sobreescribir con VITE_MAP_MAX_NATIVE_ZOOM si se cambia de proveedor.
export const MAP_MAX_NATIVE_ZOOM = Number(
  env.VITE_MAP_MAX_NATIVE_ZOOM ?? (env.VITE_MAP_TILES_URL ? 22 : 19)
);
// maxZoom = el nativo, SIN estiramiento sintético. z22 ya es nivel de edificio
// (~1 m/píxel): sobra para el uso real, y así el mapa NUNCA muestra un tile
// inventado en blanco — cada nivel al que se puede acercar tiene su tile real.
export const MAP_MAX_ZOOM = Number(env.VITE_MAP_MAX_ZOOM ?? MAP_MAX_NATIVE_ZOOM);

// Base del servicio OSRM (sin slash final). El de demo no es para producción.
export const OSRM_URL = (
  env.VITE_OSRM_URL ?? "https://router.project-osrm.org"
).replace(/\/+$/, "");
