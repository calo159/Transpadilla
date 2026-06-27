// Configuración del mapa y del cálculo de rutas, parametrizable por entorno.
//
// Por defecto se usan los servicios PÚBLICOS de OpenStreetMap y el servidor de
// demostración de OSRM, que sirven para desarrollo y demos, pero NO tienen
// garantía de servicio (SLA) ni límites altos para producción.
//
// Para producción a escala (miles de usuarios) lo recomendado es PROTOMAPS:
// auto-hospedas el mapa de tu región en un solo archivo .pmtiles (gratis, sin
// API key, sin tarjeta, sin costo por petición). Ver docs/MAPA.md. Variables:
//   VITE_MAP_PMTILES_URL -> URL del archivo .pmtiles (Cloudflare R2, VPS, …)
//   VITE_MAP_FLAVOR      -> tema base: light | dark | white | grayscale | black
// Alternativa con proveedor de tiles (Mapbox/MapTiler/servidor propio):
//   VITE_MAP_TILES_URL  -> URL de tiles
//   VITE_MAP_ATTRIBUTION-> atribución a mostrar
//   VITE_OSRM_URL       -> base de tu OSRM (p. ej. https://osrm.mialcaldia.gov.co)

const env = import.meta.env as Record<string, string | undefined>;

// Protomaps (vectorial, auto-hospedado). Si está vacío, el mapa cae a tiles OSM.
export const PMTILES_URL = env.VITE_MAP_PMTILES_URL ?? "";
export const MAP_FLAVOR = env.VITE_MAP_FLAVOR ?? "light";

export const TILES_URL =
  env.VITE_MAP_TILES_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILES_ATTRIBUTION =
  env.VITE_MAP_ATTRIBUTION ?? '© <a href="https://openstreetmap.org">OpenStreetMap</a>';

// Atribución cuando se usa Protomaps (datos OSM, render Protomaps).
export const PMTILES_ATTRIBUTION =
  '© <a href="https://openstreetmap.org">OpenStreetMap</a> · <a href="https://protomaps.com">Protomaps</a>';

// Base del servicio OSRM (sin slash final). El de demo no es para producción.
export const OSRM_URL = (
  env.VITE_OSRM_URL ?? "https://router.project-osrm.org"
).replace(/\/+$/, "");
