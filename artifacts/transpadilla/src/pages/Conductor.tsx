import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetBuses, useUpdateGps, useReportarNovedad, useFinalizarRecorrido, getGetBusesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, clearAuth } from "@/lib/auth";
import { Bus, LogOut, Play, Square, MapPin, AlertTriangle, Radio, Activity, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { io, type Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useToast } from "@/hooks/use-toast";

const SIM_PUNTOS: [number, number][] = [
  [11.5444, -72.9072], [11.5430, -72.9090], [11.5410, -72.9100],
  [11.5390, -72.9120], [11.5370, -72.9140], [11.5350, -72.9150],
  [11.5360, -72.9130], [11.5380, -72.9110], [11.5400, -72.9090],
  [11.5420, -72.9080], [11.5440, -72.9070],
];

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
  const simIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const simIndexRef = useRef(0);

  const [busId, setBusId] = useState<number | null>(null);
  const [activo, setActivo] = useState(false);
  const [modoSim, setModoSim] = useState(false);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsVel, setGpsVel] = useState<number>(0);
  const [gpsCount, setGpsCount] = useState(0);
  const [novedadTipo, setNovedadTipo] = useState<string>(NOVEDAD_OPCIONES[0]!);
  const [novedadCustom, setNovedadCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const elapsed = useElapsedTime(activo);

  const { data: buses = [] } = useGetBuses({ query: { queryKey: getGetBusesQueryKey() } });
  const updateGps = useUpdateGps({ mutation: { onError: () => {} } });
  const reportarNovedad = useReportarNovedad();
  const finalizarRecorrido = useFinalizarRecorrido();

  const selectedBus = buses.find((b) => b.id === busId);

  useEffect(() => {
    if (!user || (user.rol !== "conductor" && user.rol !== "admin")) {
      setLocation("/");
    }
  }, [user, setLocation]);

  useEffect(() => {
    if (buses.length === 1 && busId === null && !activo) {
      setBusId(buses[0]!.id);
    }
  }, [buses, busId, activo]);

  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      const map = L.map(mapContainerRef.current).setView([11.5444, -72.9072], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OSM" }).addTo(map);
      mapRef.current = map;
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const sendGps = useCallback((lat: number, lng: number, vel: number) => {
    if (!busId) return;
    setGpsLat(lat);
    setGpsLng(lng);
    setGpsVel(vel);
    setGpsCount((c) => c + 1);

    if (mapRef.current) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#3498db;color:white;padding:4px 8px;border-radius:8px;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.6);white-space:nowrap">📍 TU BUS</div>`,
        iconSize: [80, 28], iconAnchor: [40, 14],
      });
      if (busMarkerRef.current) {
        busMarkerRef.current.setLatLng([lat, lng]);
      } else {
        busMarkerRef.current = L.marker([lat, lng], { icon }).addTo(mapRef.current);
      }
      mapRef.current.panTo([lat, lng]);
    }

    updateGps.mutate({ data: { bus_id: busId, lat, lng, velocidad: vel } });
    socketRef.current?.emit("gps_update", { busId, lat, lng, rutaId: selectedBus?.ruta_id });
    queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
  }, [busId, updateGps, selectedBus, queryClient]);

  const iniciar = () => {
    if (!busId) {
      toast({ title: "Selecciona un bus primero", variant: "destructive" });
      return;
    }
    setActivo(true);
    setGpsCount(0);

    if (modoSim) {
      simIndexRef.current = 0;
      simIntervalRef.current = setInterval(() => {
        const [lat, lng] = SIM_PUNTOS[simIndexRef.current % SIM_PUNTOS.length]!;
        simIndexRef.current++;
        sendGps(lat, lng, 30 + Math.random() * 20);
      }, 4000);
    } else {
      if (!navigator.geolocation) {
        toast({ title: "GPS no disponible. Activa el modo simulación.", variant: "destructive" });
        setActivo(false);
        return;
      }
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => sendGps(pos.coords.latitude, pos.coords.longitude, (pos.coords.speed ?? 0) * 3.6),
        () => toast({ title: "Error de GPS — verifica los permisos", variant: "destructive" }),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }
    toast({ title: "Recorrido iniciado", description: selectedBus ? `Bus ${selectedBus.placa}` : undefined });
  };

  const finalizar = async () => {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    if (busId) {
      await finalizarRecorrido.mutateAsync({ data: { bus_id: busId } });
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    }
    setActivo(false);
    setGpsLat(null);
    setGpsLng(null);
    setGpsCount(0);
    busMarkerRef.current?.remove();
    busMarkerRef.current = null;
    toast({ title: "Recorrido finalizado", description: `Duración: ${elapsed}` });
  };

  const enviarNovedad = async () => {
    if (!busId) return;
    const texto = showCustom ? novedadCustom : novedadTipo;
    if (!texto.trim()) {
      toast({ title: "Escribe la novedad", variant: "destructive" });
      return;
    }
    await reportarNovedad.mutateAsync({ data: { bus_id: busId, novedad: texto } });
    queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    setNovedadCustom("");
    toast({ title: "Alerta enviada a pasajeros" });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Panel */}
      <div className="w-80 min-w-80 flex flex-col bg-sidebar border-r border-border overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bus className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold tracking-wider">TRANSPADILLA</span>
          </div>
          <Button
            variant="ghost" size="sm"
            onClick={() => { clearAuth(); setLocation("/"); }}
            className="h-7 px-2 text-muted-foreground"
            data-testid="button-salir"
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {/* Driver + bus info */}
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Conductor</p>
            <p className="font-semibold text-foreground" data-testid="text-conductor">{user?.nombre ?? "—"}</p>
            {selectedBus && (
              <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                <p className="text-xs text-muted-foreground">Bus: <span className="font-mono font-bold text-foreground">{selectedBus.placa}</span></p>
                {selectedBus.nombre_ruta && (
                  <p className="text-xs text-muted-foreground">Ruta: <span className="text-foreground">{selectedBus.nombre_ruta}</span></p>
                )}
              </div>
            )}
          </div>

          {/* Bus selector */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Seleccionar bus</p>
            <Select
              value={busId?.toString() ?? ""}
              onValueChange={(v) => setBusId(parseInt(v, 10))}
              disabled={activo}
            >
              <SelectTrigger data-testid="select-bus" className="bg-card border-border">
                <SelectValue placeholder="Elige tu bus" />
              </SelectTrigger>
              <SelectContent>
                {buses.map((b) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {b.placa} — {b.nombre_ruta ?? "Sin ruta"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {buses.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">No hay buses registrados.</p>
            )}
          </div>

          {/* GPS Status */}
          <div className={`rounded-xl p-3 border transition-colors ${activo ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${activo ? "bg-green-500" : "bg-muted-foreground"}`} />
                <span className="text-xs font-medium text-muted-foreground">
                  {activo ? "GPS activo — transmitiendo" : "GPS inactivo"}
                </span>
              </div>
              {activo && (
                <div className="flex items-center gap-1 text-xs font-mono text-green-400">
                  <Clock className="w-3 h-3" />
                  {elapsed}
                </div>
              )}
            </div>
            {activo && gpsLat !== null && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono mt-1">
                <div><span className="text-muted-foreground">Lat </span><span className="text-foreground">{gpsLat.toFixed(5)}</span></div>
                <div><span className="text-muted-foreground">Lng </span><span className="text-foreground">{gpsLng?.toFixed(5)}</span></div>
                <div><span className="text-muted-foreground">Vel </span><span className="text-green-400 font-bold">{Math.round(gpsVel)} km/h</span></div>
                <div><span className="text-muted-foreground">Envíos </span><span className="text-foreground">{gpsCount}</span></div>
              </div>
            )}
            {!activo && (
              <p className="text-xs text-muted-foreground">Presiona INICIAR para comenzar el recorrido.</p>
            )}
          </div>

          {/* Sim toggle */}
          {!activo && (
            <div className="bg-card border border-border rounded-xl px-3 py-2.5">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  role="switch"
                  aria-checked={modoSim}
                  onClick={() => setModoSim((m) => !m)}
                  className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${modoSim ? "bg-primary" : "bg-muted"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${modoSim ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Modo simulación</p>
                  <p className="text-xs text-muted-foreground">Sin GPS físico — mueve el bus por Riohacha</p>
                </div>
              </label>
            </div>
          )}

          {/* Start / Stop */}
          {!activo ? (
            <Button
              onClick={iniciar}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold h-12 text-base"
              disabled={!busId}
              data-testid="button-iniciar"
            >
              <Play className="w-5 h-5 mr-2" />
              INICIAR RECORRIDO
            </Button>
          ) : (
            <Button
              onClick={finalizar}
              variant="destructive"
              className="w-full font-bold h-12 text-base"
              disabled={finalizarRecorrido.isPending}
              data-testid="button-finalizar"
            >
              <Square className="w-5 h-5 mr-2" />
              FINALIZAR RECORRIDO
            </Button>
          )}

          {/* Novedad reporting */}
          {activo && (
            <div className="bg-card border border-yellow-500/30 rounded-xl p-3 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-yellow-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Reportar novedad a pasajeros
              </p>
              <Select
                value={showCustom ? "custom" : novedadTipo}
                onValueChange={(v) => {
                  if (v === "custom") {
                    setShowCustom(true);
                  } else {
                    setShowCustom(false);
                    setNovedadTipo(v);
                  }
                }}
              >
                <SelectTrigger className="bg-background border-border text-sm" data-testid="select-novedad">
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
                  className="bg-background border-border text-sm h-20 resize-none"
                />
              )}
              <Button
                onClick={enviarNovedad}
                className="w-full bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-semibold"
                disabled={reportarNovedad.isPending}
                data-testid="button-novedad"
              >
                Enviar alerta
              </Button>
            </div>
          )}

          {/* Status footer */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <Activity className="w-3.5 h-3.5" />
            <span>{activo ? "Recorrido en curso" : "En espera"}</span>
            {modoSim && !activo && <span className="ml-auto text-primary text-xs">Simulación activada</span>}
            {modoSim && activo && <span className="ml-auto text-yellow-400 text-xs">● Simulando</span>}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" data-testid="map-conductor" />

        {/* Live badge */}
        <div className="absolute bottom-4 right-4 z-[1000] flex items-center gap-2 bg-card/90 backdrop-blur border border-border rounded-lg px-3 py-1.5 text-xs">
          <Radio className={`w-3.5 h-3.5 ${activo ? "text-green-400" : "text-muted-foreground"}`} />
          <span className="text-muted-foreground">{activo ? "Transmitiendo GPS" : "GPS inactivo"}</span>
        </div>

        {!busId && (
          <div className="absolute inset-0 flex items-center justify-center z-[500] pointer-events-none">
            <div className="bg-card/95 border border-border rounded-xl px-8 py-6 text-center shadow-2xl">
              <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">Selecciona tu bus</p>
              <p className="text-xs text-muted-foreground mt-1">Usa el panel izquierdo para continuar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
