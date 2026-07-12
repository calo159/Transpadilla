import { useEffect, useRef, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_URL, TILES_ATTRIBUTION, MAP_MAX_ZOOM, MAP_MAX_NATIVE_ZOOM } from "@/lib/map-config";

/** Centro por defecto del mapa: Riohacha, La Guajira. */
export const RIOHACHA_CENTRO: [number, number] = [11.5444, -72.9072];

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
      const map = L.map(containerRef.current, { zoomControl: false, minZoom: 10, maxZoom: MAP_MAX_ZOOM })
        .setView(options?.center ?? RIOHACHA_CENTRO, options?.zoom ?? 14);
      L.tileLayer(TILES_URL, {
        attribution: TILES_ATTRIBUTION,
        crossOrigin: "anonymous",
        // updateWhenZooming:false (antes) retrasaba la carga de tiles hasta el
        // evento "zoomend" — en pellizco (pinch) para zoom, varios navegadores
        // móviles no lo disparan de forma confiable, y el mapa se quedaba
        // esperando ese evento para siempre (blanco). Con el default de Leaflet
        // (true) los tiles se piden EN el gesto, sin depender de ese evento.
        keepBuffer: 2,
        // Permite acercar más allá del último nivel de tiles: Leaflet escala el tile
        // disponible en vez de mostrar el mapa en blanco.
        maxZoom: MAP_MAX_ZOOM,
        maxNativeZoom: MAP_MAX_NATIVE_ZOOM,
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapRef.current = map;
    }
    return () => { mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mapRef;
}
