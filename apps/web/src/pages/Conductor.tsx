import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetBuses, useUpdateGps, useReportarNovedad, useFinalizarRecorrido, getGetBusesQueryKey } from "@workspace/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, clearAuth, homeForRol } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Bus, LogOut, Play, Square, AlertTriangle, Radio, Clock, ChevronLeft, Users, MapPin, X, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LogoTP } from "@/components/LogoTP";
import { ConfirmDialog, type ConfirmOpts } from "@/components/ConfirmDialog";
import { CambiarPasswordDialog } from "@/components/CambiarPasswordDialog";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useToast } from "@/hooks/use-toast";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { useLeafletMap } from "@/hooks/useLeafletMap";
import { NOVEDAD_OPCIONES } from "@/lib/constants";

export default function Conductor() {
  const [, setLocation] = useLocation();
  const user = getUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useLeafletMap(mapContainerRef, { zoom: 14 });
  const busMarkerRef = useRef<L.Marker | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [activo, setActivo] = useState(false);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsVel, setGpsVel] = useState<number>(0);
  const [gpsCount, setGpsCount] = useState(0);
  const [novedadCustom, setNovedadCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [ocupacion, setOcupacion] = useState<string | null>(null);
  const [showMapa, setShowMapa] = useState(false);
  const [confirmar, setConfirmar] = useState<ConfirmOpts | null>(null);
  const [cambiarPass, setCambiarPass] = useState(false);
  const [gpsError, setGpsError] = useState(false);

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

  // El mapa lo crea y destruye useLeafletMap (ver declaración de mapRef arriba).

  // El mapa está oculto por defecto; al mostrarlo hay que recalcular su tamaño.
  useEffect(() => {
    if (showMapa) {
      const t = setTimeout(() => mapRef.current?.invalidateSize(), 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [showMapa]);

  const sendGps = useCallback((lat: number, lng: number, vel: number) => {
    if (!busId) return;
    setGpsError(false); // llegó una posición: el GPS está OK
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
    // El backend (POST /buses/gps) persiste y emite "bus:ubicacion" a los
    // pasajeros; no usamos el socket para enviar la posición (no es de confianza).
    updateGps.mutate({ data: { bus_id: busId, lat, lng, velocidad: vel } });
    queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
  }, [busId, updateGps, queryClient]);

  // Inicia (o reinicia) el seguimiento GPS. Se reutiliza al volver a la app por
  // si el navegador suspendió el watch en segundo plano.
  const iniciarWatch = useCallback(() => {
    if (!navigator.geolocation) return;
    if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => sendGps(pos.coords.latitude, pos.coords.longitude, (pos.coords.speed ?? 0) * 3.6),
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  }, [sendGps]);

  // Mantiene la PANTALLA ENCENDIDA durante el recorrido (Wake Lock API), para que
  // no se apague sola y el GPS siga transmitiendo. Una app web no puede transmitir
  // con la pantalla totalmente apagada; esto evita justo ese apagado automático.
  const pedirWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch { /* el navegador puede rechazarlo si la pestaña no está visible */ }
  }, []);

  const liberarWakeLock = useCallback(async () => {
    try { await wakeLockRef.current?.release(); } catch { /* ignore */ }
    wakeLockRef.current = null;
  }, []);

  const iniciar = () => {
    if (!busId) { toast({ title: "No tienes un bus asignado. Contacta al administrador.", variant: "destructive" }); return; }
    if (!navigator.geolocation) {
      toast({ title: "GPS no disponible en este dispositivo", variant: "destructive" }); return;
    }
    setActivo(true); setGpsCount(0);
    iniciarWatch();
    pedirWakeLock();
    toast({ title: "Recorrido iniciado", description: "Mantén la app abierta; la pantalla quedará encendida." });
  };

  // Al volver a la app (desbloquear/cambiar de pestaña): el sistema libera el
  // wake lock y puede haber pausado el GPS, así que los reactivamos.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && activo) {
        pedirWakeLock();
        iniciarWatch();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [activo, pedirWakeLock, iniciarWatch]);

  const finalizar = async () => {
    if (gpsWatchRef.current !== null) { navigator.geolocation.clearWatch(gpsWatchRef.current); gpsWatchRef.current = null; }
    liberarWakeLock();
    if (busId) { await finalizarRecorrido.mutateAsync({ data: { bus_id: busId } }); queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() }); }
    setActivo(false); setGpsLat(null); setGpsLng(null); setGpsCount(0); setGpsError(false);
    busMarkerRef.current?.remove(); busMarkerRef.current = null;
    setShowCustom(false); setOcupacion(null);
    toast({ title: "Recorrido finalizado", description: `Duración: ${elapsed}` });
  };

  const enviarOcupacion = async (nivel: "vacio" | "medio" | "lleno") => {
    if (!busId) return;
    setOcupacion(nivel);
    try {
      const res = await apiFetch("/api/buses/ocupacion", {
        method: "POST",
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

  const enviarNovedad = async (texto: string) => {
    if (!busId || !texto.trim()) return;
    try {
      await reportarNovedad.mutateAsync({ data: { bus_id: busId, novedad: texto.trim() } });
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      setNovedadCustom(""); setShowCustom(false);
      toast({ title: "Reporte enviado a pasajeros" });
    } catch {
      toast({ title: "Error al enviar el reporte", variant: "destructive" });
    }
  };

  const limpiarNovedad = async () => {
    if (!busId) return;
    try {
      const res = await apiFetch("/api/buses/limpiar-novedad", {
        method: "POST",
        body: JSON.stringify({ bus_id: busId }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      toast({ title: "Reporte retirado — bus en estado normal" });
    } catch {
      toast({ title: "Error al retirar el reporte", variant: "destructive" });
    }
  };

  // Evita que el panel del conductor se muestre a quien no es conductor;
  // el useEffect de arriba ya lo está redirigiendo a su propia página.
  if (!user || user.rol !== "conductor") return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Panel del conductor — columna centrada, es lo principal (sin mapa grande) */}
      <div className="max-w-md mx-auto flex flex-col min-h-screen bg-sidebar md:border-x border-border">
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
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="h-8 px-2 text-muted-foreground hover:text-foreground" title="Volver al mapa" aria-label="Volver al mapa">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCambiarPass(true)} className="h-8 px-2 text-muted-foreground hover:text-foreground" title="Cambiar contraseña" aria-label="Cambiar contraseña">
              <KeyRound className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { clearAuth(); setLocation("/"); }} className="h-8 px-2 text-muted-foreground hover:text-destructive" data-testid="button-salir" title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
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

          {/* Aviso persistente si el GPS falla durante el recorrido */}
          {activo && gpsError && (
            <div className="rounded-xl p-3.5 border" style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.1)" }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs font-black uppercase tracking-wide text-red-400">Sin señal de GPS</span>
              </div>
              <p className="text-sm text-foreground">
                No estamos recibiendo tu ubicación. Activa el GPS y da permiso de
                ubicación al navegador; mantén la app abierta y la pantalla encendida.
              </p>
            </div>
          )}

          {/* Sin bus asignado */}
          {!busId && (
            <div className="bg-card border border-border rounded-xl px-6 py-8 text-center">
              <Bus className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">Sin bus asignado</p>
              <p className="text-xs text-muted-foreground mt-1">El administrador debe asignarte un bus para iniciar tu recorrido</p>
            </div>
          )}

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
                onClick={() => setConfirmar({
                  titulo: "Finalizar recorrido",
                  descripcion: "¿Seguro que quieres finalizar el recorrido? Dejarás de transmitir tu ubicación.",
                  textoConfirmar: "Finalizar",
                  destructivo: true,
                  accion: finalizar,
                })}
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

              {/* Reporte de estado */}
              {selectedBus?.novedad ? (
                /* Reporte activo: se mantiene hasta que el conductor lo retire */
                <div className="rounded-xl p-3.5 border" style={{ borderColor: "rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.1)" }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="w-4 h-4" style={{ color: "var(--tp-amber)" }} />
                    <span className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--tp-amber)" }}>Reporte activo</span>
                  </div>
                  <p className="text-sm text-foreground mb-3">{selectedBus.novedad}</p>
                  <Button
                    onClick={limpiarNovedad}
                    variant="outline"
                    className="w-full h-11 rounded-xl font-semibold"
                    data-testid="button-quitar-reporte"
                  >
                    <X className="w-4 h-4 mr-1.5" /> Quitar reporte (volver a normal)
                  </Button>
                </div>
              ) : (
                /* Sin reporte: opciones rápidas (un toque = reportar) */
                <div className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4" style={{ color: "var(--tp-amber)" }} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reportar novedad</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {NOVEDAD_OPCIONES.map((o) => (
                      <button
                        key={o.label}
                        onClick={() => enviarNovedad(o.texto)}
                        disabled={reportarNovedad.isPending}
                        className="h-11 rounded-xl text-sm font-semibold border border-border bg-background hover:bg-secondary active:scale-95 transition-all disabled:opacity-50"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowCustom((v) => !v)}
                    className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground py-1.5"
                  >
                    {showCustom ? "Cancelar" : "Escribir otra novedad…"}
                  </button>
                  {showCustom && (
                    <div className="space-y-2">
                      <Textarea
                        data-testid="input-novedad-custom"
                        placeholder="Describe la novedad..."
                        value={novedadCustom}
                        onChange={(e) => setNovedadCustom(e.target.value)}
                        className="bg-background border-border text-sm h-20 resize-none rounded-xl"
                      />
                      <Button
                        onClick={() => enviarNovedad(novedadCustom)}
                        disabled={!novedadCustom.trim() || reportarNovedad.isPending}
                        className="w-full h-11 text-sm font-semibold rounded-xl"
                        style={{ background: "var(--tp-amber)", color: "#000" }}
                        data-testid="button-novedad"
                      >
                        Enviar reporte
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Estado de transmisión */}
          <div className="flex items-center justify-center gap-2 text-xs py-1">
            <Radio className={`w-3.5 h-3.5 ${activo ? "text-green-400" : "text-muted-foreground"}`} />
            <span className="text-muted-foreground">{activo ? "Transmitiendo GPS en vivo" : "GPS inactivo"}</span>
          </div>

          {/* Mapa opcional — oculto por defecto; lo principal es el panel */}
          <button
            onClick={() => setShowMapa((v) => !v)}
            className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground py-2.5 border border-border rounded-xl transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            {showMapa ? "Ocultar mapa" : "Ver mi ubicación en el mapa"}
          </button>
          <div style={{ display: showMapa ? "block" : "none" }}>
            <div
              ref={mapContainerRef}
              className="w-full h-56 rounded-xl overflow-hidden border border-border"
              data-testid="map-conductor"
            />
          </div>
        </div>
      </div>

      <ConfirmDialog opts={confirmar} onClose={() => setConfirmar(null)} />
      <CambiarPasswordDialog open={cambiarPass} onClose={() => setCambiarPass(false)} />
    </div>
  );
}
