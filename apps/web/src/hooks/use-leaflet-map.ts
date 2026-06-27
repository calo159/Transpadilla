import { useEffect, useRef, type RefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILES_URL, TILES_ATTRIBUTION } from "@/lib/map-config";

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
      const map = L.map(containerRef.current, { zoomControl: false })
        .setView(options?.center ?? RIOHACHA_CENTRO, options?.zoom ?? 14);
      L.tileLayer(TILES_URL, { attribution: TILES_ATTRIBUTION }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapRef.current = map;
    }
    return () => { mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mapRef;
}
