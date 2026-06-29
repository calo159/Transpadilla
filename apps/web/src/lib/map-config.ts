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

// Zoom máximo del mapa (lo que el usuario puede acercar) y zoom máximo NATIVO de los
// tiles (el último nivel que el proveedor realmente sirve). Si maxZoom > maxNativeZoom,
// Leaflet ESCALA el último tile disponible en vez de mostrar blanco. OSM llega a z19;
// MapTiler a z20 → en ese caso subir VITE_MAP_MAX_NATIVE_ZOOM=20.
export const MAP_MAX_ZOOM = Number(env.VITE_MAP_MAX_ZOOM ?? 20);
export const MAP_MAX_NATIVE_ZOOM = Number(env.VITE_MAP_MAX_NATIVE_ZOOM ?? 19);

// Base del servicio OSRM (sin slash final). El de demo no es para producción.
export const OSRM_URL = (
  env.VITE_OSRM_URL ?? "https://router.project-osrm.org"
).replace(/\/+$/, "");
