import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetRutas, useGetBuses, getGetBusesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { clearAuth, getUser } from "@/lib/auth";
import {
  Bus, MapPin, LogOut, Radio, AlertTriangle, X,
  Search, Clock, LogIn, Shield, ChevronRight, ChevronUp,
  Menu, MessageCircle, Instagram, Phone, LocateFixed, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoTP } from "@/components/LogoTP";
import { io, type Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchStreetRoute } from "@/lib/routing";

// ─── Constantes de contacto TransPadilla ─────────────────────────────────────
// Actualiza este número con el real de WhatsApp de la empresa
const WHATSAPP_NUMERO = "3144167656";
const INSTAGRAM_URL   = "https://www.instagram.com/transpadilla.co";
const TARIFA_COP      = "$3.000";

interface BusLocation { busId: number; lat: number; lng: number; velocidad?: number; rutaId?: number; }
interface Novedad { busId: number; novedad: string; placa?: string; }

function tiempoRelativo(isoDate: string | null | undefined): string {
  if (!isoDate) return "sin datos";
  const diff = (Date.now() - new Date(isoDate).getTime()) / 1000;
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  return `hace ${Math.round(diff / 3600)} h`;
}

type SheetState = "collapsed" | "half" | "full";

export default function Pasajero() {
  const [, setLocation] = useLocation();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const routeLayersRef = useRef<Record<number, L.Polyline>>({});
  const stopMarkersRef = useRef<L.Marker[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const queryClient = useQueryClient();

  const [selectedRutaId, setSelectedRutaId] = useState<number | null>(null);
  const [novedad, setNovedad] = useState<Novedad | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [busqueda, setBusqueda] = useState("");
  const [locating, setLocating] = useState(false);
  // Guía de bienvenida: se muestra solo la primera vez (se recuerda en localStorage).
  const [showWelcome, setShowWelcome] = useState(
    () => typeof localStorage !== "undefined" && !localStorage.getItem("tp_welcome_visto"),
  );
  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem("tp_welcome_visto", "1"); } catch { /* ignore */ }
  };
  // Arrastre del bottom sheet (swipe). dragOffset = px en vivo durante el gesto.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startPx: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const user = getUser();

  const { data: rutas = [] } = useGetRutas({ query: { queryKey: ["rutas"], refetchInterval: 15000 } });
  const { data: buses = [] } = useGetBuses({ query: { queryKey: getGetBusesQueryKey(), refetchInterval: 10000 } });

  const rutasFiltradas = rutas.filter((r) => r.nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const selectedRuta = rutas.find((r) => r.id === selectedRutaId);
  const activeBuses = buses.filter((b) => b.estado === "activo");
  const demorasBuses = buses.filter((b) => b.estado === "demora");

  // Init mapa
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([11.5444, -72.9072], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapRef.current = map;
    }
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Dibujar rutas y paradas
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
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${ruta.color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.6)"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        });
        const m = L.marker([p.latitud, p.longitud], { icon })
          .bindPopup(`
            <div style="min-width:140px;font-family:'Inter',system-ui,sans-serif">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <div style="width:10px;height:10px;border-radius:50%;background:${ruta.color}"></div>
                <b style="font-size:13px">${p.nombre}</b>
              </div>
              <span style="color:#64748b;font-size:11px">${ruta.nombre}</span>
            </div>`)
          .addTo(map);
        stopMarkersRef.current.push(m);
      });

      if (ruta.paradas.length < 2) return;
      const fallback: L.LatLngExpression[] = ruta.paradas.map((p) => [p.latitud, p.longitud]);
      const polyline = L.polyline(fallback, { color: ruta.color, weight: 4, opacity: 0.65, dashArray: "6 4" }).addTo(map);
      routeLayersRef.current[ruta.id] = polyline;
      fetchStreetRoute(ruta.paradas).then((coords) => {
        polyline.setLatLngs(coords);
        polyline.setStyle({ opacity: 0.85, dashArray: undefined });
      });
    });
  }, [rutas]);

  // Highlight/dim al seleccionar ruta
  useEffect(() => {
    Object.entries(routeLayersRef.current).forEach(([idStr, polyline]) => {
      const id = Number(idStr);
      if (selectedRutaId === null) polyline.setStyle({ opacity: 0.85, weight: 4 });
      else if (id === selectedRutaId) { polyline.setStyle({ opacity: 1, weight: 7 }); polyline.bringToFront(); }
      else polyline.setStyle({ opacity: 0.1, weight: 3 });
    });
  }, [selectedRutaId]);

  const updateBusMarker = useCallback(
    (busId: number, lat: number, lng: number, color = "#1757C2", placa = "", rutaId?: number) => {
      if (!mapRef.current) return;
      const bus = buses.find((b) => b.id === busId);
      const routeName = bus?.nombre_ruta ?? "";
      const vel = bus?.velocidad ?? 0;
      const novText = bus?.novedad ? `<span style="color:var(--tp-yellow,#F5C200)">⚠ ${bus.novedad}</span><br>` : "";

      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${color};color:white;padding:4px 9px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 3px 12px rgba(0,0,0,.6);font-family:'Inter',system-ui,sans-serif;letter-spacing:0.5px;border:2px solid rgba(255,255,255,0.3)">${placa || "BUS"}</div>`,
        iconSize: [74, 26], iconAnchor: [37, 13],
      });

      const popupContent = `
        <div style="min-width:170px;font-family:'Inter',system-ui,sans-serif">
          <b style="font-size:14px;letter-spacing:0.5px">${placa || "BUS"}</b><br>
          <span style="color:#64748b;font-size:12px">${routeName}</span><br>
          ${vel > 0 ? `<span style="color:#22c55e;font-size:12px">● ${Math.round(vel)} km/h</span><br>` : ""}
          ${novText}
          <span style="color:#94a3b8;font-size:11px">Tarifa: ${TARIFA_COP} COP</span>
        </div>`;

      if (markersRef.current[busId]) {
        markersRef.current[busId]!.setLatLng([lat, lng]);
        markersRef.current[busId]!.setIcon(icon);
        markersRef.current[busId]!.setPopupContent(popupContent);
      } else {
        const marker = L.marker([lat, lng], { icon }).bindPopup(popupContent).addTo(mapRef.current!);
        if (rutaId) marker.on("click", () => setSelectedRutaId((prev) => (prev === rutaId ? null : rutaId)));
        markersRef.current[busId] = marker;
      }
    },
    [buses]
  );

  useEffect(() => {
    buses.forEach((b) => {
      if (b.lat && b.lng)
        updateBusMarker(b.id, b.lat, b.lng, b.color_ruta ?? "#1757C2", b.placa, b.ruta_id ?? undefined);
    });
  }, [buses, updateBusMarker]);

  // Socket.IO
  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("bus:ubicacion", (data: BusLocation) => {
      const bus = buses.find((b) => b.id === data.busId);
      updateBusMarker(data.busId, data.lat, data.lng, bus?.color_ruta ?? "#1757C2", bus?.placa ?? "BUS", data.rutaId);
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    });
    socket.on("bus:novedad", (data: Novedad) => {
      setNovedad(data);
      setTimeout(() => setNovedad(null), 12000);
    });
    return () => { socket.disconnect(); };
  }, [buses, updateBusMarker, queryClient]);

  const handleSelectRuta = (rutaId: number) => {
    const next = selectedRutaId === rutaId ? null : rutaId;
    setSelectedRutaId(next);
    if (next !== null) {
      const ruta = rutas.find((r) => r.id === next);
      if (ruta && mapRef.current) {
        if (ruta.paradas.length >= 2)
          mapRef.current.fitBounds(L.latLngBounds(ruta.paradas.map((p) => [p.latitud, p.longitud])), { padding: [40, 40] });
        else if (ruta.paradas.length === 1)
          mapRef.current.setView([ruta.paradas[0]!.latitud, ruta.paradas[0]!.longitud], 14);
      }
      socketRef.current?.emit("subscribe_ruta", { rutaId: next });
      setSheetState("half");
    }
  };

  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 310);
    return () => clearTimeout(t);
  }, [sidebarOpen, sheetState]);

  const cycleSheet = () => {
    setSheetState((s) => s === "collapsed" ? "half" : s === "half" ? "full" : "collapsed");
  };

  const sheetTranslate = sheetState === "collapsed" ? "calc(100% - 64px)" : sheetState === "half" ? "45%" : "0%";

  // ── Arrastre del bottom sheet (swipe up/down) ──────────────────────────────
  const snapPx = (state: SheetState): number => {
    const h = window.innerHeight;
    if (state === "collapsed") return h - 64;
    if (state === "half") return h * 0.45;
    return 0;
  };

  const onSheetTouchStart = (e: React.TouchEvent) => {
    suppressClickRef.current = false;
    const t = e.touches[0]!;
    dragRef.current = { startY: t.clientY, startPx: snapPx(sheetState), moved: false };
  };
  const onSheetTouchMove = (e: React.TouchEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = e.touches[0]!.clientY - d.startY;
    if (Math.abs(delta) > 4) d.moved = true;
    const h = window.innerHeight;
    setDragOffset(Math.min(h - 64, Math.max(0, d.startPx + delta)));
  };
  const onSheetTouchEnd = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) { setDragOffset(null); return; } // tap puro → lo maneja onClick
    suppressClickRef.current = true; // evita que el click posterior cicle el sheet
    const h = window.innerHeight;
    const current = dragOffset ?? d.startPx;
    const points: [SheetState, number][] = [["full", 0], ["half", h * 0.45], ["collapsed", h - 64]];
    let best = points[0]!;
    for (const p of points) if (Math.abs(p[1] - current) < Math.abs(best[1] - current)) best = p;
    setSheetState(best[0]);
    setDragOffset(null);
  };
  const onHandleClick = () => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    cycleSheet();
  };

  // ── Centrar el mapa en la ubicación del pasajero ───────────────────────────
  const locateMe = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapRef.current;
        if (!map) { setLocating(false); return; }
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#1757C2;border:3px solid white;box-shadow:0 0 0 6px rgba(23,87,194,.25)"></div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        });
        if (userMarkerRef.current) userMarkerRef.current.setLatLng([latitude, longitude]);
        else userMarkerRef.current = L.marker([latitude, longitude], { icon }).bindPopup("Estás aquí").addTo(map);
        map.setView([latitude, longitude], 15);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };

  const sheetTransform = dragOffset !== null ? `translateY(${dragOffset}px)` : `translateY(${sheetTranslate})`;

  // ─── SIDEBAR DESKTOP ────────────────────────────────────────────────────────
  const DesktopSidebar = () => (
    <div
      className="hidden md:flex flex-col bg-sidebar border-r border-border overflow-hidden transition-all duration-300 ease-in-out"
      style={{ width: sidebarOpen ? 310 : 0, minWidth: sidebarOpen ? 310 : 0 }}
    >
      {/* Header con logo */}
      <div className="px-4 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <LogoTP size={40} />
          <div>
            <h1 className="text-base font-black tracking-widest text-foreground">
              Trans<span style={{ color: "var(--tp-sky)" }}>Padilla</span>
            </h1>
            <p className="text-[10px] font-semibold tracking-wide" style={{ color: "var(--tp-yellow)" }}>
              Moviendo la Ciudad · Riohacha
            </p>
          </div>
        </div>
      </div>

      {/* Stats en vivo */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${activeBuses.length > 0 ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
          <span className="text-muted-foreground font-medium">{activeBuses.length} activos</span>
        </div>
        {demorasBuses.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: "var(--tp-yellow)" }} />
            <span className="font-medium" style={{ color: "var(--tp-yellow)" }}>{demorasBuses.length} demora</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground">{rutas.length} rutas</span>
          <span className="font-bold px-2 py-0.5 rounded-md text-[10px]"
            style={{ background: "rgba(245,194,0,0.12)", color: "var(--tp-yellow)" }}>
            {TARIFA_COP}
          </span>
        </div>
      </div>

      {/* Buscador */}
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
            <button onClick={() => setBusqueda("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Lista de rutas */}
      <div className="flex-1 overflow-y-auto py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 py-2">
          Rutas disponibles {rutasFiltradas.length !== rutas.length && `(${rutasFiltradas.length})`}
        </p>
        {rutas.length === 0 && <p className="px-4 py-8 text-xs text-muted-foreground text-center">Cargando rutas...</p>}
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
              className={`w-full text-left px-4 py-3.5 transition-all border-l-[3px] ${isSelected ? "bg-primary/8 border-primary" : "border-transparent hover:bg-secondary/50"}`}
              style={{ opacity: dimmed ? 0.3 : 1 }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 transition-all"
                  style={{ background: ruta.color, boxShadow: isSelected ? `0 0 8px ${ruta.color}` : "none" }}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate block">{ruta.nombre}</span>
                  <span className="text-[11px] text-muted-foreground">{ruta.paradas.length} paradas</span>
                </div>
                <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                  {rutaBuses.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      {rutaBuses.length} en vivo
                    </span>
                  )}
                </div>
              </div>
              {isSelected && ruta.paradas.length > 0 && (
                <div className="mt-2.5 pl-6 space-y-1.5">
                  {ruta.paradas.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: ruta.color }} />
                      <span className="truncate">{p.nombre}</span>
                      {i === 0 && <span className="ml-auto text-[9px] opacity-50 font-bold">INICIO</span>}
                      {i === ruta.paradas.length - 1 && ruta.paradas.length > 1 && (
                        <span className="ml-auto text-[9px] opacity-50 font-bold">FIN</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Buses en ruta seleccionada */}
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
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${b.estado === "activo" ? "bg-green-500/20 text-green-400" : b.estado === "demora" ? "bg-amber-500/20 text-amber-400" : "bg-muted/20 text-muted-foreground"}`}>
                    {b.estado}
                  </span>
                </div>
                {b.velocidad && b.velocidad > 0 && <p className="text-muted-foreground font-mono">{Math.round(b.velocidad)} km/h</p>}
                {b.actualizado && (
                  <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />{tiempoRelativo(b.actualizado)}
                  </p>
                )}
                {b.novedad && <p className="mt-1" style={{ color: "var(--tp-yellow)" }}>⚠ {b.novedad}</p>}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Atención al cliente */}
      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Atención al cliente</p>
        <div className="flex gap-2">
          <a
            href={`https://wa.me/${WHATSAPP_NUMERO}?text=Hola%20TransPadilla%2C%20necesito%20ayuda`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "rgba(37,211,102,0.12)", color: "var(--tp-whatsapp, #25D366)", border: "1px solid rgba(37,211,102,0.2)" }}
          >
            <MessageCircle className="w-3.5 h-3.5" />WhatsApp
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors bg-secondary/40 border border-border"
          >
            <Instagram className="w-3.5 h-3.5" />Instagram
          </a>
        </div>
      </div>

      {/* Footer usuario */}
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
  );

  // ─── MOBILE BOTTOM SHEET ─────────────────────────────────────────────────────
  const MobileSheet = () => (
    <div
      className="md:hidden tp-bottom-sheet"
      style={{
        transform: sheetTransform,
        height: "100dvh",
        transition: dragOffset !== null ? "none" : undefined,
      }}
    >
      {/* Handle + quick stats (arrastrable) */}
      <button
        onClick={onHandleClick}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
        className="w-full flex flex-col items-center pt-2.5 pb-3 px-4 shrink-0"
        style={{ touchAction: "none" }}
      >
        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/40 mb-3" />
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${activeBuses.length > 0 ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
              <span className="text-sm font-semibold text-foreground">{activeBuses.length} activos</span>
            </div>
            {demorasBuses.length > 0 && (
              <span className="text-sm font-semibold" style={{ color: "var(--tp-yellow)" }}>· {demorasBuses.length} demora</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{rutas.length} rutas</span>
            <ChevronUp className={`w-4 h-4 text-muted-foreground transition-transform ${sheetState === "full" ? "rotate-180" : ""}`} />
          </div>
        </div>
      </button>

      {/* Contenido del sheet */}
      <div className="flex-1 overflow-y-auto px-4 pb-safe" style={{ height: "calc(100% - 72px)" }}>
        {/* Buscador */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar ruta..."
            className="pl-10 h-11 text-base bg-background border-border rounded-xl"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Ruta seleccionada */}
        {selectedRuta && (
          <div className="mb-3 rounded-xl border p-3" style={{ borderColor: selectedRuta.color + "60", background: selectedRuta.color + "0D" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: selectedRuta.color }} />
                <span className="font-semibold text-sm text-foreground">{selectedRuta.nombre}</span>
              </div>
              <button onClick={() => setSelectedRutaId(null)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            {selectedRuta.paradas.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {selectedRuta.paradas.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: selectedRuta.color }} />
                    <span>{p.nombre}</span>
                    {i === 0 && <span className="ml-auto text-[9px] opacity-60 font-bold">INICIO</span>}
                    {i === selectedRuta.paradas.length - 1 && selectedRuta.paradas.length > 1 && (
                      <span className="ml-auto text-[9px] opacity-60 font-bold">FIN</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {buses.filter((b) => b.ruta_id === selectedRuta.id && b.estado !== "inactivo").map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1.5 border-t border-border/50 text-xs">
                <span className="font-mono font-bold text-foreground">{b.placa}</span>
                <span className={`px-2 py-0.5 rounded-full font-bold ${b.estado === "activo" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}`}>
                  {b.estado}
                </span>
                {b.velocidad && b.velocidad > 0 && <span className="text-muted-foreground font-mono">{Math.round(b.velocidad)} km/h</span>}
              </div>
            ))}
          </div>
        )}

        {/* Lista de rutas */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
          {selectedRutaId ? "Otras rutas" : "Rutas disponibles"}
        </p>
        {rutas.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Cargando rutas...</p>}
        <div className="space-y-2">
          {rutasFiltradas.filter((r) => r.id !== selectedRutaId).map((ruta) => {
            const rutaBuses = buses.filter((b) => b.ruta_id === ruta.id && b.estado !== "inactivo");
            const enVivo = rutaBuses.length > 0;
            return (
              <button
                key={ruta.id}
                onClick={() => handleSelectRuta(ruta.id)}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-card border border-border hover:border-primary/30 active:bg-primary/5 transition-all text-left active:scale-[0.98]"
              >
                {/* Indicador de color de la ruta */}
                <div
                  className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                  style={{ background: ruta.color + "22" }}
                >
                  <Bus className="w-4.5 h-4.5" style={{ color: ruta.color, width: 18, height: 18 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{ruta.nombre}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{ruta.paradas.length} paradas</span>
                    {enVivo ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        {rutaBuses.length} en vivo
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60">sin buses ahora</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Atención al cliente mobile */}
        <div className="mt-4 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Atención al cliente</p>
          <div className="flex gap-2">
            <a
              href={`https://wa.me/${WHATSAPP_NUMERO}?text=Hola%20TransPadilla%2C%20necesito%20ayuda`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(37,211,102,0.12)", color: "#25D366", border: "1px solid rgba(37,211,102,0.25)" }}
            >
              <MessageCircle className="w-4 h-4" />WhatsApp
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold text-muted-foreground bg-card border border-border"
            >
              <Instagram className="w-4 h-4" />Instagram
            </a>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Tarifa: <span style={{ color: "var(--tp-yellow)" }} className="font-bold">{TARIFA_COP} COP</span> · Muévete siempre con seguridad
          </p>
        </div>

        {/* Footer usuario mobile */}
        <div className="pb-6">
          {user ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{user.nombre.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{user.nombre}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{user.rol}</p>
                </div>
              </div>
              <div className="flex gap-1">
                {(user.rol === "admin" || user.rol === "conductor") && (
                  <Button variant="ghost" size="sm" onClick={() => setLocation(user.rol === "admin" ? "/admin" : "/conductor")} className="h-9 px-3 text-muted-foreground hover:text-primary">
                    <Shield className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { clearAuth(); window.location.reload(); }} className="h-9 px-3 text-muted-foreground">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLocation("/login")}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-primary/10 border border-primary/25 hover:bg-primary/15 active:bg-primary/20 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <LogIn className="w-5 h-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">Iniciar sesión</span>
              </div>
              <ChevronRight className="w-4 h-4 text-primary" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {DesktopSidebar()}

      {/* Mapa */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" data-testid="map-container" />

        {/* ── Controles desktop ── */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="hidden md:flex absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-xl p-2.5 shadow-lg hover:bg-secondary transition-colors items-center justify-center"
          title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
        >
          <Menu className="w-4 h-4 text-muted-foreground" />
        </button>

        {selectedRutaId !== null && (
          <button
            onClick={() => setSelectedRutaId(null)}
            className="hidden md:flex absolute top-3 left-16 z-[1000] items-center gap-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shadow-lg"
          >
            <X className="w-3 h-3" />Ver todas
          </button>
        )}

        {!sidebarOpen && !user && (
          <button
            onClick={() => setLocation("/login")}
            className="hidden md:flex absolute top-3 right-3 z-[1000] items-center gap-2 text-white rounded-xl px-4 py-2.5 text-xs font-semibold shadow-lg hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #1757C2, var(--tp-sky))" }}
          >
            <LogIn className="w-3.5 h-3.5" />Iniciar sesión
          </button>
        )}

        {/* ── Header mobile ── */}
        <div className="md:hidden absolute top-0 left-0 right-0 z-[999] flex items-center justify-between px-3 pt-3 pb-2 pointer-events-none">
          <div className="flex items-center gap-2 bg-card/95 backdrop-blur-md border border-border rounded-xl px-3 py-2 shadow-lg pointer-events-auto">
            <LogoTP size={32} />
            <div>
              <span className="text-sm font-black tracking-widest text-foreground">
                Trans<span style={{ color: "var(--tp-sky)" }}>Padilla</span>
              </span>
              <p className="text-[9px] font-semibold leading-none" style={{ color: "var(--tp-yellow)" }}>Moviendo la Ciudad</p>
            </div>
          </div>
          {!user ? (
            <button
              onClick={() => setLocation("/login")}
              className="flex items-center gap-1.5 text-white rounded-xl px-3 py-2 text-xs font-bold shadow-lg pointer-events-auto"
              style={{ background: "linear-gradient(135deg, #1757C2, var(--tp-sky))" }}
            >
              <LogIn className="w-3.5 h-3.5" />Entrar
            </button>
          ) : (
            <button
              onClick={() => setLocation(user.rol === "admin" ? "/admin" : "/conductor")}
              className="flex items-center gap-1.5 bg-card/95 backdrop-blur-md border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground shadow-lg pointer-events-auto"
            >
              <Shield className="w-3.5 h-3.5 text-primary" />Panel
            </button>
          )}
        </div>

        {/* Guía de bienvenida (primera visita) */}
        {showWelcome && (
          <div className="absolute inset-0 z-[1001] flex items-end md:items-center justify-center p-4 pb-28 md:pb-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-sm rounded-2xl border shadow-2xl p-5"
              style={{ background: "rgba(12,18,32,0.96)", borderColor: "rgba(75,169,216,0.3)", backdropFilter: "blur(16px)" }}>
              <div className="flex items-center gap-3 mb-3">
                <LogoTP size={40} />
                <div>
                  <p className="text-base font-black tracking-wide text-white">
                    Bienvenido a Trans<span style={{ color: "var(--tp-sky)" }}>Padilla</span>
                  </p>
                  <p className="text-[11px] font-semibold" style={{ color: "var(--tp-yellow)" }}>Rastrea tu bus en tiempo real</p>
                </div>
              </div>
              <div className="space-y-2.5 mb-4">
                {[
                  { icon: <Bus className="w-4 h-4" />, txt: "Mira los buses moverse en vivo en el mapa." },
                  { icon: <MapPin className="w-4 h-4" />, txt: "Toca tu ruta para ver sus paradas y buses." },
                  { icon: <LocateFixed className="w-4 h-4" />, txt: "Usa el botón de ubicación para ver qué bus tienes cerca." },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(23,87,194,0.2)", color: "var(--tp-sky)" }}>
                      {step.icon}
                    </div>
                    <p className="text-sm text-white/85">{step.txt}</p>
                  </div>
                ))}
              </div>
              <Button
                onClick={dismissWelcome}
                className="w-full h-11 rounded-xl font-bold text-white border-0"
                style={{ background: "linear-gradient(135deg, #1757C2 0%, var(--tp-sky) 100%)" }}
              >
                Entendido, ver el mapa
              </Button>
            </div>
          </div>
        )}

        {/* Alerta de novedad */}
        {novedad && (
          <div className="absolute top-16 left-3 right-3 md:top-4 md:left-1/2 md:-translate-x-1/2 md:right-auto md:max-w-md z-[1000] backdrop-blur-sm border rounded-2xl px-4 py-3 flex items-start gap-3 shadow-2xl"
            style={{ background: "rgba(245,194,0,0.12)", borderColor: "rgba(245,194,0,0.4)" }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--tp-yellow)" }} />
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: "var(--tp-yellow)" }}>
                Alerta {novedad.placa ? `— Bus ${novedad.placa}` : "de conductor"}
              </p>
              <p className="text-sm text-foreground/80 mt-0.5">{novedad.novedad}</p>
            </div>
            <button onClick={() => setNovedad(null)} className="hover:opacity-70 transition-opacity">
              <X className="w-4 h-4" style={{ color: "var(--tp-yellow)" }} />
            </button>
          </div>
        )}

        {/* Botón "Mi ubicación" (GPS del pasajero) */}
        <button
          onClick={locateMe}
          disabled={locating}
          className="absolute bottom-36 md:bottom-20 left-3 z-[1000] flex items-center justify-center w-11 h-11 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg hover:bg-secondary active:scale-95 transition-all disabled:opacity-60"
          title="Centrar en mi ubicación"
          aria-label="Centrar en mi ubicación"
        >
          {locating
            ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
            : <LocateFixed className="w-5 h-5 text-primary" />}
        </button>

        {/* Indicador en vivo */}
        <div className="absolute bottom-20 md:bottom-4 left-3 z-[1000] flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg">
          <div className="relative">
            <Radio className="w-3.5 h-3.5 text-primary" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          <span className="text-xs text-muted-foreground font-medium">En vivo</span>
        </div>

        {/* Botón WhatsApp flotante */}
        <a
          href={`https://wa.me/${WHATSAPP_NUMERO}?text=Hola%20TransPadilla%2C%20necesito%20informaci%C3%B3n%20sobre%20el%20servicio`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-20 md:bottom-4 right-3 z-[1000] flex items-center gap-2 shadow-xl rounded-xl px-3 py-2 text-xs font-bold transition-opacity hover:opacity-90"
          style={{ background: "#25D366", color: "white" }}
          title="Atención al cliente por WhatsApp"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="hidden md:inline">Atención al cliente</span>
          <Phone className="w-3.5 h-3.5 md:hidden" />
        </a>

        {/* Watermark */}
        <div className="hidden md:block absolute bottom-4 right-52 z-[999] text-[10px] text-muted-foreground/25 font-black tracking-widest select-none">
          TRANSPADILLA
        </div>
      </div>

      {MobileSheet()}
    </div>
  );
}
