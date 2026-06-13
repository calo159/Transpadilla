import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { io, type Socket } from "socket.io-client";
import { useGetRutas, useGetBuses, getGetBusesQueryKey } from "@workspace/api-client-react";
import { RefreshCw, AlertTriangle, Activity, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchStreetRoute } from "@/lib/routing";

interface TramoTrafico {
  id: number;
  nombre: string;
  lat_inicio: number;
  lng_inicio: number;
  lat_fin: number;
  lng_fin: number;
  estado: "fluido" | "lento" | "detenido" | "sin_datos";
  velocidad_promedio: number;
  muestras: number;
  actualizado: string | null;
}

interface BusLocation {
  busId: number;
  lat: number;
  lng: number;
  velocidad?: number;
  rutaId?: number;
}

const COLOR_ESTADO: Record<string, string> = {
  fluido: "#22c55e",
  lento: "#facc15",
  detenido: "#ef4444",
  sin_datos: "#64748b",
};

const LABEL_ESTADO: Record<string, string> = {
  fluido: "Fluido",
  lento: "Lento",
  detenido: "Detenido",
  sin_datos: "Sin datos",
};

export default function TraficoTab() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const tramoLayersRef = useRef<Record<number, L.Polyline>>({});
  const routeLayersRef = useRef<Record<number, L.Polyline>>({});
  const busMarkersRef = useRef<Record<number, L.Marker>>({});
  const socketRef = useRef<Socket | null>(null);

  const [tramos, setTramos] = useState<TramoTrafico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rutas = [] } = useGetRutas({ query: { queryKey: ["rutas"], refetchInterval: 15000 } });
  const { data: buses = [] } = useGetBuses({ query: { queryKey: getGetBusesQueryKey(), refetchInterval: 10000 } });

  // Init map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([11.5444, -72.9072], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);
      mapRef.current = map;
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Fetch traffic state
  const cargarTrafico = useCallback(async () => {
    try {
      const res = await fetch("/api/trafico/estado/");
      if (!res.ok) throw new Error("No se pudo conectar con el servicio de tráfico");
      const data = (await res.json()) as { tramos: TramoTrafico[] };
      setTramos(data.tramos);
      setError(null);
    } catch {
      setError("Servicio de tráfico no disponible");
    }
  }, []);

  const procesarTrafico = async () => {
    setLoading(true);
    try {
      await fetch("/api/trafico/procesar/", { method: "POST" });
      await cargarTrafico();
    } catch {
      setError("Error al procesar tráfico");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTrafico();
    const interval = setInterval(cargarTrafico, 30000);
    return () => clearInterval(interval);
  }, [cargarTrafico]);

  // Draw traffic segments
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    Object.values(tramoLayersRef.current).forEach((l) => l.remove());
    tramoLayersRef.current = {};

    tramos.forEach((tramo) => {
      const color = COLOR_ESTADO[tramo.estado] ?? COLOR_ESTADO.sin_datos!;
      const weight = tramo.estado === "sin_datos" ? 4 : 7;

      const line = L.polyline(
        [[tramo.lat_inicio, tramo.lng_inicio], [tramo.lat_fin, tramo.lng_fin]],
        { color, weight, opacity: 0.85, lineCap: "round" }
      ).addTo(map);

      line.bindPopup(`
        <div style="font-family:'Inter',system-ui,sans-serif;min-width:160px">
          <b style="font-size:13px">${tramo.nombre}</b><br>
          <span style="color:${color};font-weight:700;font-size:12px">${LABEL_ESTADO[tramo.estado]}</span><br>
          <span style="color:#64748b;font-size:11px">Velocidad promedio: ${tramo.velocidad_promedio.toFixed(1)} km/h</span><br>
          <span style="color:#64748b;font-size:11px">Muestras (10 min): ${tramo.muestras}</span>
        </div>
      `);

      tramoLayersRef.current[tramo.id] = line;
    });
  }, [tramos]);

  // Draw routes (faint, for context)
  useEffect(() => {
    if (!mapRef.current || rutas.length === 0) return;
    const map = mapRef.current;

    Object.values(routeLayersRef.current).forEach((l) => l.remove());
    routeLayersRef.current = {};

    rutas.forEach((ruta) => {
      if (ruta.paradas.length < 2) return;
      const fallbackCoords: L.LatLngExpression[] = ruta.paradas.map((p) => [p.latitud, p.longitud]);
      const polyline = L.polyline(fallbackCoords, {
        color: ruta.color,
        weight: 2,
        opacity: 0.25,
        dashArray: "4 6",
      }).addTo(map);
      routeLayersRef.current[ruta.id] = polyline;

      fetchStreetRoute(ruta.paradas).then((coords) => {
        polyline.setLatLngs(coords);
      });
    });
  }, [rutas]);

  // Bus markers
  const updateBusMarker = useCallback((busId: number, lat: number, lng: number, placa = "", color = "#3b82f6") => {
    if (!mapRef.current) return;
    const icon = L.divIcon({
      className: "",
      html: `<div style="background:${color};color:white;padding:3px 7px;border-radius:6px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.5);font-family:monospace">${placa || "BUS"}</div>`,
      iconSize: [50, 20],
      iconAnchor: [25, 10],
    });
    if (busMarkersRef.current[busId]) {
      busMarkersRef.current[busId]!.setLatLng([lat, lng]);
    } else {
      busMarkersRef.current[busId] = L.marker([lat, lng], { icon }).addTo(mapRef.current);
    }
  }, []);

  useEffect(() => {
    buses.forEach((b) => {
      if (b.lat && b.lng) updateBusMarker(b.id, b.lat, b.lng, b.placa, b.color_ruta ?? "#3b82f6");
    });
  }, [buses, updateBusMarker]);

  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("bus:ubicacion", (data: BusLocation) => {
      const bus = buses.find((b) => b.id === data.busId);
      updateBusMarker(data.busId, data.lat, data.lng, bus?.placa ?? "BUS", bus?.color_ruta ?? "#3b82f6");
    });
    return () => { socket.disconnect(); };
  }, [buses, updateBusMarker]);

  const conteoEstados = tramos.reduce(
    (acc, t) => {
      acc[t.estado] = (acc[t.estado] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 h-full">
      {/* Map */}
      <div className="bg-card border border-border rounded-xl overflow-hidden relative" style={{ minHeight: 500 }}>
        <div ref={mapContainerRef} className="w-full h-full absolute inset-0" data-testid="map-trafico" />
        {error && (
          <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>

      {/* Side panel */}
      <div className="space-y-4">
        <Button
          onClick={procesarTrafico}
          disabled={loading}
          className="w-full h-10 font-semibold"
          data-testid="button-procesar-trafico"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Procesando..." : "Actualizar tráfico"}
        </Button>

        {/* Legend */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5" /> Estado de la malla vial
          </h3>
          <div className="space-y-2">
            {(["fluido", "lento", "detenido", "sin_datos"] as const).map((estado) => (
              <div key={estado} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-1.5 rounded-full" style={{ background: COLOR_ESTADO[estado] }} />
                  <span className="text-muted-foreground">{LABEL_ESTADO[estado]}</span>
                </div>
                <span className="font-mono font-bold text-foreground">{conteoEstados[estado] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Segments list */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Tramos monitoreados
          </h3>
          {tramos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {error ? "Sin conexión al servicio" : "Cargando..."}
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tramos.map((tramo) => (
                <button
                  key={tramo.id}
                  onClick={() => {
                    mapRef.current?.fitBounds(
                      [[tramo.lat_inicio, tramo.lng_inicio], [tramo.lat_fin, tramo.lng_fin]],
                      { padding: [60, 60] }
                    );
                    tramoLayersRef.current[tramo.id]?.openPopup();
                  }}
                  className="w-full text-left bg-secondary/30 border border-border rounded-lg p-2.5 hover:bg-secondary/50 transition-colors"
                >
                  <p className="text-xs font-medium text-foreground truncate">{tramo.nombre}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
                      style={{
                        background: `${COLOR_ESTADO[tramo.estado]}22`,
                        color: COLOR_ESTADO[tramo.estado],
                      }}
                    >
                      {LABEL_ESTADO[tramo.estado]}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {tramo.velocidad_promedio.toFixed(1)} km/h
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed px-2">
          Clasificación basada en el promedio de velocidad de los buses
          en una ventana de 10 minutos.
        </p>
      </div>
    </div>
  );
}