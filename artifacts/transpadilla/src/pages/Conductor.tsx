import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetBuses, useUpdateGps, useReportarNovedad, useFinalizarRecorrido, getGetBusesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, clearAuth, homeForRol, getToken } from "@/lib/auth";
import { Bus, LogOut, Play, Square, AlertTriangle, Radio, Clock, ChevronLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LogoTP } from "@/components/LogoTP";
import { io, type Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useToast } from "@/hooks/use-toast";

const NOVEDAD_OPCIONES = [
  "Tráfico — demora estimada 10 min",
  "Accidente en la vía — espera obligatoria",
  "Problema mecánico — en espera de apoyo",
  "Desvío por vía cerrada",
];

function useElapsedTime(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      startRef.current = Date.now() - seconds * 1000;
      const tick = () => {
        setSeconds(Math.floor((Date.now() - startRef.current!) / 1000));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setSeconds(0);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Conductor() {
  const [, setLocation] = useLocation();
  const user = getUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const busMarkerRef = useRef<L.Marker | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [activo, setActivo] = useState(false);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsVel, setGpsVel] = useState<number>(0);
  const [gpsCount, setGpsCount] = useState(0);
  const [novedadTipo, setNovedadTipo] = useState<string>(NOVEDAD_OPCIONES[0]!);
  const [novedadCustom, setNovedadCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [showNovedad, setShowNovedad] = useState(false);
  const [ocupacion, setOcupacion] = useState<string | null>(null);

  const elapsed = useElapsedTime(activo);

  const { data: buses = [] } = useGetBuses({ query: { queryKey: getGetBusesQueryKey() } });
  const updateGps = useUpdateGps({ mutation: { onError: () => {} } });
  const reportarNovedad = useReportarNovedad();
  const finalizarRecorrido = useFinalizarRecorrido();

  const selectedBus = buses.find((b) => b.conductor_id === (user?.id ?? -1));
  const busId = selectedBus?.id ?? null;

  // Guard de rol: solo un conductor puede ver este panel. Cualquier otro usuario
  // es enviado a su propia página (admin → /admin, pasajero → /).
  useEffect(() => {
    if (!user) { setLocation("/login"); return; }
    if (user.rol !== "conductor") setLocation(homeForRol(user.rol));
  }, [user, setLocation]);

  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([11.5444, -72.9072], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OSM" }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapRef.current = map;
    }
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  const sendGps = useCallback((lat: number, lng: number, vel: number) => {
    if (!busId) return;
    setGpsLat(lat); setGpsLng(lng); setGpsVel(vel); setGpsCount((c) => c + 1);
    if (mapRef.current) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#1757C2;color:white;padding:5px 10px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 2px 12px rgba(23,87,194,.6);white-space:nowrap;border:2px solid rgba(255,255,255,.3)">📍 TU BUS</div>`,
        iconSize: [90, 30], iconAnchor: [45, 15],
      });
      if (busMarkerRef.current) busMarkerRef.current.setLatLng([lat, lng]);
      else busMarkerRef.current = L.marker([lat, lng], { icon }).addTo(mapRef.current);
      mapRef.current.panTo([lat, lng]);
    }
    updateGps.mutate({ data: { bus_id: busId, lat, lng, velocidad: vel } });
    socketRef.current?.emit("gps_update", { busId, lat, lng, rutaId: selectedBus?.ruta_id });
    queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
  }, [busId, updateGps, selectedBus, queryClient]);

  const iniciar = () => {
    if (!busId) { toast({ title: "No tienes un bus asignado. Contacta al administrador.", variant: "destructive" }); return; }
    if (!navigator.geolocation) {
      toast({ title: "GPS no disponible en este dispositivo", variant: "destructive" }); return;
    }
    setActivo(true); setGpsCount(0);
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => sendGps(pos.coords.latitude, pos.coords.longitude, (pos.coords.speed ?? 0) * 3.6),
      () => toast({ title: "Error de GPS — verifica los permisos", variant: "destructive" }),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    toast({ title: "Recorrido iniciado", description: selectedBus ? `Bus ${selectedBus.placa}` : undefined });
  };

  const finalizar = async () => {
    if (gpsWatchRef.current !== null) { navigator.geolocation.clearWatch(gpsWatchRef.current); gpsWatchRef.current = null; }
    if (busId) { await finalizarRecorrido.mutateAsync({ data: { bus_id: busId } }); queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() }); }
    setActivo(false); setGpsLat(null); setGpsLng(null); setGpsCount(0);
    busMarkerRef.current?.remove(); busMarkerRef.current = null;
    setShowNovedad(false); setOcupacion(null);
    toast({ title: "Recorrido finalizado", description: `Duración: ${elapsed}` });
  };

  const enviarOcupacion = async (nivel: "vacio" | "medio" | "lleno") => {
    if (!busId) return;
    setOcupacion(nivel);
    try {
      const res = await fetch("/api/buses/ocupacion", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ bus_id: busId, ocupacion: nivel }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      const etiqueta = nivel === "vacio" ? "Vacío" : nivel === "medio" ? "Medio" : "Lleno";
      toast({ title: `Ocupación: ${etiqueta}` });
    } catch {
      toast({ title: "Error al reportar ocupación", variant: "destructive" });
    }
  };

  const enviarNovedad = async () => {
    if (!busId) return;
    const texto = showCustom ? novedadCustom : novedadTipo;
    if (!texto.trim()) { toast({ title: "Escribe la novedad", variant: "destructive" }); return; }
    await reportarNovedad.mutateAsync({ data: { bus_id: busId, novedad: texto } });
    queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    setNovedadCustom(""); setShowNovedad(false);
    toast({ title: "Alerta enviada a pasajeros" });
  };

  // Evita que el panel del conductor se muestre a quien no es conductor;
  // el useEffect de arriba ya lo está redirigiendo a su propia página.
  if (!user || user.rol !== "conductor") return null;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background overflow-hidden">
      {/* ─── PANEL (top on mobile, left on desktop) ─── */}
      <div className="flex flex-col bg-sidebar border-b md:border-b-0 md:border-r border-border md:w-80 md:min-w-80 md:overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <LogoTP size={32} />
            <div>
              <span className="text-sm font-black tracking-wider text-foreground">
                Trans<span style={{ color: "var(--tp-sky)" }}>Padilla</span>
              </span>
              <p className="text-[10px] font-semibold" style={{ color: "var(--tp-yellow)" }}>Panel Conductor</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="h-8 px-2 text-muted-foreground hover:text-foreground" title="Volver al mapa">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { clearAuth(); setLocation("/"); }} className="h-8 px-2 text-muted-foreground hover:text-destructive" data-testid="button-salir" title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 p-4 md:flex-1">
          {/* Driver info + GPS status */}
          <div className={`rounded-xl p-3 border transition-colors ${activo ? "border-green-500/30" : "bg-card border-border"}`} style={activo ? { background: "rgba(16,185,129,0.05)" } : {}}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Conductor</p>
                <p className="font-semibold text-foreground text-sm" data-testid="text-conductor">{user?.nombre ?? "—"}</p>
                {selectedBus && (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-xs text-muted-foreground">Bus: <span className="font-mono font-bold text-foreground">{selectedBus.placa}</span></p>
                    {selectedBus.nombre_ruta && <p className="text-xs text-muted-foreground">Ruta: <span className="text-foreground">{selectedBus.nombre_ruta}</span></p>}
                  </div>
                )}
              </div>
              {activo && (
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end mb-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-400">GPS activo</span>
                  </div>
                  <div className="flex items-center gap-1 text-base font-mono font-bold text-foreground">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    {elapsed}
                  </div>
                  {gpsVel > 0 && <p className="text-xs text-green-400 font-mono mt-0.5">{Math.round(gpsVel)} km/h</p>}
                </div>
              )}
            </div>
            {activo && gpsLat !== null && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono mt-2 pt-2 border-t border-border/50">
                <div><span className="text-muted-foreground">Lat </span><span className="text-foreground">{gpsLat.toFixed(5)}</span></div>
                <div><span className="text-muted-foreground">Lng </span><span className="text-foreground">{gpsLng?.toFixed(5)}</span></div>
                <div><span className="text-muted-foreground">Envíos </span><span className="text-foreground">{gpsCount}</span></div>
              </div>
            )}
          </div>

          {/* Start / Stop buttons */}
          {!activo ? (
            <Button
              onClick={iniciar}
              className="w-full font-bold text-base rounded-xl"
              style={{ height: "56px", background: "linear-gradient(135deg, #16a34a, #15803d)", fontSize: "16px" }}
              disabled={!busId}
              data-testid="button-iniciar"
            >
              <Play className="w-5 h-5 mr-2 fill-white" />
              INICIAR RECORRIDO
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={finalizar}
                variant="destructive"
                className="w-full font-bold text-base rounded-xl"
                style={{ height: "56px", fontSize: "16px" }}
                disabled={finalizarRecorrido.isPending}
                data-testid="button-finalizar"
              >
                <Square className="w-5 h-5 mr-2 fill-white" />
                FINALIZAR RECORRIDO
              </Button>

              {/* Ocupación del bus */}
              <div className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">¿Qué tan lleno va?</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { val: "vacio", label: "Vacío", color: "#22c55e" },
                    { val: "medio", label: "Medio", color: "#F5C200" },
                    { val: "lleno", label: "Lleno", color: "#ef4444" },
                  ] as const).map((o) => {
                    const activa = ocupacion === o.val;
                    return (
                      <button
                        key={o.val}
                        onClick={() => enviarOcupacion(o.val)}
                        className="h-11 rounded-xl text-sm font-bold border-2 transition-all active:scale-95"
                        style={{
                          borderColor: o.color,
                          background: activa ? o.color : "transparent",
                          color: activa ? "#000" : o.color,
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Novedad toggle */}
              <button
                onClick={() => setShowNovedad((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors"
                style={{ borderColor: "rgba(245,158,11,0.3)", background: showNovedad ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.05)" }}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" style={{ color: "var(--tp-amber)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--tp-amber)" }}>Reportar novedad</span>
                </div>
                <span className="text-xs text-muted-foreground">{showNovedad ? "▲" : "▼"}</span>
              </button>

              {showNovedad && (
                <div className="bg-card border border-border rounded-xl p-3 space-y-2.5">
                  <Select
                    value={showCustom ? "custom" : novedadTipo}
                    onValueChange={(v) => { if (v === "custom") { setShowCustom(true); } else { setShowCustom(false); setNovedadTipo(v); } }}
                  >
                    <SelectTrigger className="bg-background border-border h-11 text-sm rounded-xl" data-testid="select-novedad">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NOVEDAD_OPCIONES.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                      <SelectItem value="custom">Escribir novedad personalizada...</SelectItem>
                    </SelectContent>
                  </Select>
                  {showCustom && (
                    <Textarea
                      data-testid="input-novedad-custom"
                      placeholder="Describe la novedad..."
                      value={novedadCustom}
                      onChange={(e) => setNovedadCustom(e.target.value)}
                      className="bg-background border-border text-sm h-20 resize-none rounded-xl"
                    />
                  )}
                  <Button
                    onClick={enviarNovedad}
                    className="w-full h-11 text-sm font-semibold rounded-xl"
                    style={{ background: "var(--tp-amber)", color: "#000" }}
                    disabled={reportarNovedad.isPending}
                    data-testid="button-novedad"
                  >
                    Enviar alerta a pasajeros
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── MAP ─── */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapContainerRef} className="w-full h-full" data-testid="map-conductor" />

        {/* Live badge */}
        <div className="absolute bottom-4 right-4 z-[1000] flex items-center gap-2 bg-card/90 backdrop-blur border border-border rounded-xl px-3 py-1.5 text-xs shadow-lg">
          <Radio className={`w-3.5 h-3.5 ${activo ? "text-green-400" : "text-muted-foreground"}`} />
          <span className="text-muted-foreground">{activo ? "Transmitiendo GPS" : "GPS inactivo"}</span>
        </div>

        {!busId && !activo && (
          <div className="absolute inset-0 flex items-center justify-center z-[500] pointer-events-none">
            <div className="bg-card/95 border border-border rounded-xl px-8 py-6 text-center shadow-2xl">
              <Bus className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">Sin bus asignado</p>
              <p className="text-xs text-muted-foreground mt-1">El administrador debe asignarte un bus</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
