import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetRutas, useGetBuses, getGetBusesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { clearAuth, getUser } from "@/lib/auth";
import {
  Bus, MapPin, LogOut, Radio, AlertTriangle, X,
  PanelLeftClose, PanelLeftOpen, Search, Clock,
  LogIn, Shield, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { io, type Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchStreetRoute } from "@/lib/routing";

interface BusLocation {
  busId: number;
  lat: number;
  lng: number;
  velocidad?: number;
  rutaId?: number;
}

interface Novedad {
  busId: number;
  novedad: string;
  placa?: string;
}

function tiempoRelativo(isoDate: string | null | undefined): string {
  if (!isoDate) return "sin datos";
  const diff = (Date.now() - new Date(isoDate).getTime()) / 1000;
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)}min`;
  return `hace ${Math.round(diff / 3600)}h`;
}

export default function Pasajero() {
  const [, setLocation] = useLocation();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const routeLayersRef = useRef<Record<number, L.Polyline>>({});
  const stopMarkersRef = useRef<L.Marker[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  const [selectedRutaId, setSelectedRutaId] = useState<number | null>(null);
  const [novedad, setNovedad] = useState<Novedad | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const user = getUser();

  const { data: rutas = [] } = useGetRutas({ query: { queryKey: ["rutas"], refetchInterval: 15000 } });
  const { data: buses = [] } = useGetBuses({ query: { queryKey: getGetBusesQueryKey(), refetchInterval: 10000 } });

  const rutasFiltradas = rutas.filter((r) =>
    r.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );
  const selectedRuta = rutas.find((r) => r.id === selectedRutaId);

  // Init map once
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([11.5444, -72.9072], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapRef.current = map;
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw routes + stops
  useEffect(() => {
    if (!mapRef.current || rutas.length === 0) return;
    const map = mapRef.current;

    Object.values(routeLayersRef.current).forEach((l) => l.remove());
    routeLayersRef.current = {};
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    rutas.forEach((ruta) => {
      ruta.paradas.forEach((p) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${ruta.color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const m = L.marker([p.latitud, p.longitud], { icon })
          .bindPopup(`
            <div style="min-width:120px">
              <b style="font-size:13px">${p.nombre}</b><br>
              <span style="color:#64748b;font-size:11px">${ruta.nombre}</span>
            </div>
          `)
          .addTo(map);
        stopMarkersRef.current.push(m);
      });

      if (ruta.paradas.length < 2) return;

      const fallbackCoords: L.LatLngExpression[] = ruta.paradas.map((p) => [p.latitud, p.longitud]);
      const polyline = L.polyline(fallbackCoords, {
        color: ruta.color,
        weight: 4,
        opacity: 0.65,
        dashArray: "6 4",
      }).addTo(map);
      routeLayersRef.current[ruta.id] = polyline;

      fetchStreetRoute(ruta.paradas).then((streetCoords) => {
        polyline.setLatLngs(streetCoords);
        polyline.setStyle({ opacity: 0.75, dashArray: undefined });
      });
    });
  }, [rutas]);

  // Dim/highlight on selection
  useEffect(() => {
    Object.entries(routeLayersRef.current).forEach(([idStr, polyline]) => {
      const id = Number(idStr);
      if (selectedRutaId === null) {
        polyline.setStyle({ opacity: 0.75, weight: 4 });
      } else if (id === selectedRutaId) {
        polyline.setStyle({ opacity: 1, weight: 6 });
        polyline.bringToFront();
      } else {
        polyline.setStyle({ opacity: 0.1, weight: 3 });
      }
    });
  }, [selectedRutaId]);

  const updateBusMarker = useCallback(
    (busId: number, lat: number, lng: number, color = "#3498db", placa = "", rutaId?: number) => {
      if (!mapRef.current) return;

      const bus = buses.find((b) => b.id === busId);
      const routeName = bus?.nombre_ruta ?? "";
      const vel = bus?.velocidad ?? 0;
      const novText = bus?.novedad ? `<span style="color:#facc15">⚠ ${bus.novedad}</span><br>` : "";

      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${color};color:white;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.5);font-family:'Inter',system-ui,sans-serif;letter-spacing:0.5px;cursor:pointer;border:2px solid rgba(255,255,255,0.3)">${placa || "BUS"}</div>`,
        iconSize: [70, 26],
        iconAnchor: [35, 13],
      });

      if (markersRef.current[busId]) {
        markersRef.current[busId]!.setLatLng([lat, lng]);
        markersRef.current[busId]!.setIcon(icon);
        markersRef.current[busId]!.setPopupContent(`
          <div style="min-width:160px;font-family:'Inter',system-ui,sans-serif">
            <b style="font-size:14px;letter-spacing:0.5px">${placa || "BUS"}</b><br>
            <span style="color:#64748b;font-size:12px">${routeName}</span><br>
            ${vel > 0 ? `<span style="color:#4ade80;font-size:12px">● ${Math.round(vel)} km/h</span><br>` : ""}
            ${novText}
          </div>
        `);
      } else {
        const marker = L.marker([lat, lng], { icon })
          .bindPopup(`
            <div style="min-width:160px;font-family:'Inter',system-ui,sans-serif">
              <b style="font-size:14px;letter-spacing:0.5px">${placa || "BUS"}</b><br>
              <span style="color:#64748b;font-size:12px">${routeName}</span><br>
              ${vel > 0 ? `<span style="color:#4ade80;font-size:12px">● ${Math.round(vel)} km/h</span>` : ""}
            </div>
          `)
          .addTo(mapRef.current);

        if (rutaId) {
          marker.on("click", () => {
            setSelectedRutaId((prev) => (prev === rutaId ? null : rutaId));
          });
        }

        markersRef.current[busId] = marker;
      }
    },
    [buses]
  );

  useEffect(() => {
    buses.forEach((b) => {
      if (b.lat && b.lng) {
        updateBusMarker(b.id, b.lat, b.lng, b.color_ruta ?? "#3498db", b.placa, b.ruta_id ?? undefined);
      }
    });
  }, [buses, updateBusMarker]);

  // Socket.IO
  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("bus:ubicacion", (data: BusLocation) => {
      const bus = buses.find((b) => b.id === data.busId);
      updateBusMarker(data.busId, data.lat, data.lng, bus?.color_ruta ?? "#3498db", bus?.placa ?? "BUS", data.rutaId);
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    });

    socket.on("bus:novedad", (data: Novedad) => {
      setNovedad(data);
      setTimeout(() => setNovedad(null), 10000);
    });

    return () => { socket.disconnect(); };
  }, [buses, updateBusMarker, queryClient]);

  const handleSelectRuta = (rutaId: number) => {
    const next = selectedRutaId === rutaId ? null : rutaId;
    setSelectedRutaId(next);
    if (next !== null) {
      const ruta = rutas.find((r) => r.id === next);
      if (ruta && mapRef.current) {
        if (ruta.paradas.length >= 2) {
          const bounds = L.latLngBounds(ruta.paradas.map((p) => [p.latitud, p.longitud]));
          mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        } else if (ruta.paradas.length === 1) {
          mapRef.current.setView([ruta.paradas[0]!.latitud, ruta.paradas[0]!.longitud], 14);
        }
      }
      socketRef.current?.emit("subscribe_ruta", { rutaId: next });
    }
  };

  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 310);
    return () => clearTimeout(t);
  }, [sidebarOpen]);

  const activeBuses = buses.filter((b) => b.estado === "activo");
  const demorasBuses = buses.filter((b) => b.estado === "demora");

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div
        className="flex flex-col bg-sidebar border-r border-border overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: sidebarOpen ? 300 : 0, minWidth: sidebarOpen ? 300 : 0 }}
      >
        {/* Header / Branding */}
        <div className="px-4 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-center">
              <Bus className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-widest text-foreground">TRANSPADILLA</h1>
              <p className="text-[10px] text-muted-foreground font-medium tracking-wide">Transporte público · Riohacha</p>
            </div>
          </div>
        </div>

        {/* Live stats */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${activeBuses.length > 0 ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
            <span className="text-muted-foreground font-medium">{activeBuses.length} activos</span>
          </div>
          {demorasBuses.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-yellow-400 font-medium">{demorasBuses.length} demora</span>
            </div>
          )}
          <span className="ml-auto text-muted-foreground">{rutas.length} rutas</span>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar ruta..."
              className="pl-8 h-9 text-xs bg-background border-border rounded-lg"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Routes list */}
        <div className="flex-1 overflow-y-auto py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 py-2">
            Rutas disponibles {rutasFiltradas.length !== rutas.length && `(${rutasFiltradas.length})`}
          </p>
          {rutas.length === 0 && (
            <p className="px-4 py-8 text-xs text-muted-foreground text-center">Cargando rutas...</p>
          )}
          {busqueda && rutasFiltradas.length === 0 && (
            <p className="px-4 py-8 text-xs text-muted-foreground text-center">Sin resultados para "{busqueda}"</p>
          )}
          {rutasFiltradas.map((ruta) => {
            const isSelected = selectedRutaId === ruta.id;
            const dimmed = selectedRutaId !== null && !isSelected;
            const rutaBuses = buses.filter((b) => b.ruta_id === ruta.id && b.estado !== "inactivo");
            return (
              <button
                key={ruta.id}
                onClick={() => handleSelectRuta(ruta.id)}
                data-testid={`ruta-item-${ruta.id}`}
                className={`w-full text-left px-4 py-3.5 transition-all border-l-[3px] ${isSelected ? "bg-accent/10 border-primary" : "border-transparent hover:bg-secondary/50"}`}
                style={{ opacity: dimmed ? 0.35 : 1 }}
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <div
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0 transition-all"
                    style={{
                      background: ruta.color,
                      boxShadow: isSelected ? `0 0 8px ${ruta.color}` : "none",
                    }}
                  />
                  <span className="text-sm font-semibold text-foreground truncate">{ruta.nombre}</span>
                  <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                    {rutaBuses.length > 0 && (
                      <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">
                        {rutaBuses.length} bus{rutaBuses.length !== 1 ? "es" : ""}
                      </span>
                    )}
                    {ruta.activa && !rutaBuses.length && (
                      <span className="text-[10px] text-green-400/70 font-semibold">Activa</span>
                    )}
                  </div>
                </div>
                {isSelected && ruta.paradas.length > 0 && (
                  <div className="mt-2.5 pl-6 space-y-1.5">
                    {ruta.paradas.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: ruta.color }} />
                        <span className="truncate">{p.nombre}</span>
                        {i === 0 && <span className="ml-auto text-[9px] opacity-50 font-medium">INICIO</span>}
                        {i === ruta.paradas.length - 1 && ruta.paradas.length > 1 && (
                          <span className="ml-auto text-[9px] opacity-50 font-medium">FIN</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Buses on selected route */}
        {selectedRuta && (() => {
          const rutaBuses = buses.filter((b) => b.ruta_id === selectedRuta.id);
          if (!rutaBuses.length) return null;
          return (
            <div className="border-t border-border p-3 shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Buses en ruta</p>
              {rutaBuses.map((b) => (
                <div key={b.id} className="bg-card border border-border rounded-lg p-2.5 mb-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-foreground tracking-wide">{b.placa}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      b.estado === "activo" ? "bg-green-500/20 text-green-400"
                      : b.estado === "demora" ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-muted/20 text-muted-foreground"
                    }`}>{b.estado}</span>
                  </div>
                  {b.velocidad && b.velocidad > 0 && (
                    <p className="text-muted-foreground font-mono">{Math.round(b.velocidad)} km/h</p>
                  )}
                  {b.actualizado && (
                    <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {tiempoRelativo(b.actualizado)}
                    </p>
                  )}
                  {b.novedad && <p className="text-yellow-400 mt-1">⚠ {b.novedad}</p>}
                </div>
              ))}
            </div>
          );
        })()}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{user.nombre.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{user.nombre}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{user.rol}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {(user.rol === "admin" || user.rol === "conductor") && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setLocation(user.rol === "admin" ? "/admin" : "/conductor")}
                    className="h-7 px-2 text-muted-foreground hover:text-primary"
                    title="Ir al panel"
                  >
                    <Shield className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { clearAuth(); window.location.reload(); }}
                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLocation("/login")}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <LogIn className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Iniciar sesión</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" data-testid="map-container" />

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-xl p-2.5 shadow-lg hover:bg-secondary transition-colors"
          title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
        >
          {sidebarOpen
            ? <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
            : <PanelLeftOpen  className="w-4 h-4 text-muted-foreground" />
          }
        </button>

        {/* Clear selection */}
        {selectedRutaId !== null && (
          <button
            onClick={() => setSelectedRutaId(null)}
            className="absolute top-3 left-16 z-[1000] flex items-center gap-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shadow-lg"
          >
            <X className="w-3 h-3" />
            Ver todas
          </button>
        )}

        {/* Login button on map (when sidebar closed and not logged in) */}
        {!sidebarOpen && !user && (
          <button
            onClick={() => setLocation("/login")}
            className="absolute top-3 right-3 z-[1000] flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-xs font-semibold shadow-lg hover:bg-primary/90 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            Iniciar sesión
          </button>
        )}

        {/* Novedad alert */}
        {novedad && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-yellow-500/15 backdrop-blur-sm border border-yellow-500/40 rounded-2xl px-5 py-3.5 flex items-start gap-3 max-w-md shadow-2xl">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-yellow-300">
                Alerta {novedad.placa ? `— Bus ${novedad.placa}` : "de conductor"}
              </p>
              <p className="text-sm text-yellow-200/90 mt-0.5">{novedad.novedad}</p>
            </div>
            <button onClick={() => setNovedad(null)} className="hover:opacity-70 transition-opacity">
              <X className="w-4 h-4 text-yellow-400" />
            </button>
          </div>
        )}

        {/* Live indicator */}
        <div className="absolute bottom-4 left-3 z-[1000] flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg">
          <div className="relative">
            <Radio className="w-3.5 h-3.5 text-primary" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          <span className="text-xs text-muted-foreground font-medium">En vivo</span>
        </div>

        {/* Branding watermark on map */}
        <div className="absolute bottom-4 right-14 z-[999] text-[10px] text-muted-foreground/40 font-bold tracking-widest select-none">
          TRANSPADILLA
        </div>
      </div>
    </div>
  );
}