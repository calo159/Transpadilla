import { useEffect, useRef, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { leafletLayer } from "protomaps-leaflet";
import { TILES_URL, TILES_ATTRIBUTION, PMTILES_URL, MAP_FLAVOR, PMTILES_ATTRIBUTION } from "@/lib/map-config";

/** Centro por defecto del mapa: Riohacha, La Guajira. */
export const RIOHACHA_CENTRO: [number, number] = [11.5444, -72.9072];

const escTxt = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/**
 * Capa opcional de BARRIOS: lee un GeoJSON propio (apps/web/public/barrios.geojson)
 * con los barrios de la ciudad (puntos o polígonos con la propiedad `name`) y los
 * muestra como etiquetas sobre el mapa. OpenStreetMap no tiene los barrios de
 * Riohacha, así que esta es tu capa propia (ver docs/MAPA.md). Si el archivo no
 * existe o está vacío, no pasa nada.
 */
function cargarBarrios(map: L.Map) {
  const etiqueta = (latlng: L.LatLngExpression, nombre: string) =>
    L.marker(latlng, { opacity: 0, interactive: false, keyboard: false })
      .bindTooltip(escTxt(nombre), { permanent: true, direction: "center", className: "tp-barrio-label" });

  fetch(`${import.meta.env.BASE_URL}barrios.geojson`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: GeoJSON.FeatureCollection | null) => {
      if (!data?.features?.length || !map) return;
      L.geoJSON(data, {
        style: { color: "#1B3B6F", weight: 1, opacity: 0.45, fill: false, dashArray: "3 4" },
        pointToLayer: (f, latlng) => etiqueta(latlng, String(f.properties?.name ?? "")),
        onEachFeature: (f, layer) => {
          if (f.geometry.type !== "Point" && f.properties?.name && "getBounds" in layer) {
            etiqueta((layer as L.Polygon).getBounds().getCenter(), String(f.properties.name)).addTo(map);
          }
        },
      }).addTo(map);
    })
    .catch(() => { /* sin barrios: el mapa sigue normal */ });
}

/**
 * Crea un mapa Leaflet dentro de `containerRef` una sola vez y lo destruye al
 * desmontar. Centraliza la configuración común (capa de teselas, control de zoom
 * abajo-derecha) que antes se repetía en cada página. Devuelve el ref del mapa
 * para que la página añada marcadores, recoloque la vista, etc.
 */
export function useLeafletMap(
  containerRef: RefObject<HTMLDivElement | null>,
  options?: { center?: [number, number]; zoom?: number },
): RefObject<L.Map | null> {
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (containerRef.current && !mapRef.current) {
      const map = L.map(containerRef.current, { zoomControl: false })
        .setView(options?.center ?? RIOHACHA_CENTRO, options?.zoom ?? 14);
      // Base del mapa: Protomaps (vectorial, auto-hospedado) si hay archivo .pmtiles
      // configurado; si no, tiles OSM como respaldo (demo / despliegue sin archivo aún).
      if (PMTILES_URL) {
        leafletLayer({ url: PMTILES_URL, flavor: MAP_FLAVOR, lang: "es", attribution: PMTILES_ATTRIBUTION }).addTo(map);
      } else {
        L.tileLayer(TILES_URL, { attribution: TILES_ATTRIBUTION }).addTo(map);
      }
      L.control.zoom({ position: "bottomright" }).addTo(map);
      cargarBarrios(map);
      mapRef.current = map;
    }
    return () => { mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mapRef;
}
