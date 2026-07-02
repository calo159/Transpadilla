import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetBuses, useUpdateGps, useReportarNovedad, useFinalizarRecorrido, getGetBusesQueryKey } from "@workspace/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { getUser, cerrarSesion, homeForRol } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
import { Bus, LogOut, Play, Square, AlertTriangle, Radio, Clock, ChevronLeft, Users, User, MapPin, X, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LogoTP } from "@/components/LogoTP";
import { ConfirmDialog, type ConfirmOpts } from "@/components/ConfirmDialog";
import { CambiarPasswordDialog } from "@/components/CambiarPasswordDialog";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useToast } from "@/hooks/use-toast";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { useLeafletMap } from "@/hooks/use-leaflet-map";
import { NOVEDAD_OPCIONES } from "@/lib/constants";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function Conductor() {
  useDocumentTitle("Conductor · TransPadilla");
  const [, setLocation] = useLocation();
  const user = getUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useLeafletMap(mapContainerRef, { zoom: 14 });
  const busMarkerRef = useRef<L.Marker | null>(null);
  const gpsWatchRef = useRef<number | string | null>(null);
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
  // Cuántos envíos de ubicación fallaron seguidos (red caída). Si es > 0, el
  // conductor ve "SIN RED" para saber que su ubicación no está llegando.
  const [gpsFallos, setGpsFallos] = useState(0);

  const elapsed = useElapsedTime(activo);

  const { data: buses = [], isLoading: busesLoading } = useGetBuses({ query: { queryKey: getGetBusesQueryKey() } });
  const updateGps = useUpdateGps({ mutation: {
    onError: () => setGpsFallos((n) => n + 1),
    onSuccess: () => setGpsFallos(0),
  } });
  const reportarNovedad = useReportarNovedad();
  const finalizarRecorrido = useFinalizarRecorrido();

  const selectedBus = user ? buses.find((b) => b.conductor_id === user.id) : null;
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
        html: `<div style="background:#2558A5;color:white;padding:5px 10px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 2px 12px rgba(37,88,165,.6);white-space:nowrap;border:2px solid rgba(255,255,255,.3)">TU BUS</div>`,
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

  // Inicia (o reinicia) el seguimiento GPS.
  // En nativo (Capacitor) usa BackgroundGeolocation → Foreground Service de Android,
  // que sigue enviando aunque la pantalla esté apagada.
  // En web sigue usando navigator.geolocation.watchPosition.
  const iniciarWatch = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      // Cancela watcher anterior si existe
      if (gpsWatchRef.current !== null) {
        BackgroundGeolocation.removeWatcher({ id: gpsWatchRef.current as string }).catch(() => {});
        gpsWatchRef.current = null;
      }
      BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "TransPadilla — GPS activo",
          backgroundMessage: "Enviando tu posición al sistema de rastreo.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 5,
        },
        (pos, err) => {
          if (err || !pos) { setGpsError(true); return; }
          sendGps(pos.latitude, pos.longitude, (pos.speed ?? 0) * 3.6);
        },
      ).then((id) => { gpsWatchRef.current = id; }).catch(() => setGpsError(true));
    } else {
      if (!navigator.geolocation) return;
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current as number);
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => sendGps(pos.coords.latitude, pos.coords.longitude, (pos.coords.speed ?? 0) * 3.6),
        () => setGpsError(true),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }
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

  const finalizar = async (): Promise<boolean> => {
    // Primero confirmamos con el backend que el recorrido terminó. Si la red
    // falla, NO limpiamos el estado local: el bus sigue activo y el conductor
    // puede reintentar (evita que el front diga "finalizado" y el backend no).
    if (busId) {
      try {
        await finalizarRecorrido.mutateAsync({ data: { bus_id: busId } });
        queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      } catch {
        toast({ title: "No se pudo finalizar — revisa tu conexión e inténtalo de nuevo", variant: "destructive" });
        return false;
      }
    }
    if (gpsWatchRef.current !== null) {
      if (Capacitor.isNativePlatform()) {
        BackgroundGeolocation.removeWatcher({ id: gpsWatchRef.current as string }).catch(() => {});
      } else {
        navigator.geolocation.clearWatch(gpsWatchRef.current as number);
      }
      gpsWatchRef.current = null;
    }
    liberarWakeLock();
    setActivo(false); setGpsLat(null); setGpsLng(null); setGpsCount(0); setGpsError(false); setGpsFallos(0);
    busMarkerRef.current?.remove(); busMarkerRef.current = null;
    setShowCustom(false); setOcupacion(null);
    toast({ title: "Recorrido finalizado", description: `Duración: ${elapsed}` });
    return true;
  };

  // Cerrar sesión debe terminar la transmisión GPS si había un recorrido activo
  // (si no, el bus queda "fantasma": activo y con la última posición congelada).
  // Reutiliza finalizar(), que ya es best-effort-seguro: si el backend falla no
  // limpia nada y avisa, así que aquí tampoco cerramos sesión en ese caso.
  const salir = async () => {
    if (activo) {
      const finalizado = await finalizar();
      if (!finalizado) return;
    }
    await cerrarSesion();
    setLocation("/");
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

  // Estado real de GPS resumido, para el subtítulo del card de turno.
  const sinRed = activo && !gpsError && gpsFallos >= 2; // 2+ fallos seguidos = red caída
  const gpsOk = activo && !gpsError && !sinRed;
  const turnoSub = !activo ? "GPS detenido"
    : gpsError ? "Sin señal de GPS"
    : sinRed ? "Sin red — reintentando"
    : "GPS compartiendo ubicación";
  const turnoInk = gpsOk ? "var(--color-success)" : (gpsError || sinRed) ? "var(--color-danger)" : "var(--color-gray-text)";

  // El switch de turno y el botón de viaje comparten la misma acción real:
  // iniciar() (pide GPS + Wake Lock) o el confirm de finalizar().
  const pedirFinalizar = () => setConfirmar({
    titulo: "Finalizar recorrido",
    descripcion: "¿Seguro que quieres finalizar el recorrido? Dejarás de transmitir tu ubicación.",
    textoConfirmar: "Finalizar", destructivo: true,
    accion: async () => { await finalizar(); },
  });
  const toggleTurno = () => { if (activo) pedirFinalizar(); else iniciar(); };

  return (
    <div className="tp-light tp-conductor-bg min-h-screen">
      <div className="tp-conductor-panel max-w-md md:max-w-2xl mx-auto flex flex-col min-h-screen" style={{ background: "#f4f7fb" }}>
        {/* Header con gradiente navy (mockup 4a) */}
        <header className="relative overflow-hidden shrink-0 px-4 pt-4 pb-5" style={{ background: "linear-gradient(160deg,#1B3B6F,#2558A5)" }}>
          <div className="absolute -right-8 -top-5 w-36 h-36 rounded-full" style={{ background: "rgba(245,183,49,.12)" }} />
          <div className="relative flex items-center gap-3">
            <LogoTP size={36} />
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold text-[15px] leading-none text-white">Panel del Conductor</div>
              <div className="text-[11px] mt-1 truncate" style={{ color: "#9cc0e8" }} data-testid="text-conductor">
                {selectedBus ? `Bus ${selectedBus.placa}${selectedBus.nombre_ruta ? ` · ${selectedBus.nombre_ruta}` : ""}` : "Sin asignación"}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setLocation("/")} className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform" style={{ background: "rgba(255,255,255,.14)" }} aria-label="Volver al mapa" title="Volver al mapa"><ChevronLeft className="w-[18px] h-[18px]" /></button>
              <button onClick={() => setCambiarPass(true)} className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform" style={{ background: "rgba(255,255,255,.14)" }} aria-label="Cambiar contraseña" title="Cambiar contraseña"><KeyRound className="w-[18px] h-[18px]" /></button>
              <button
                onClick={() => {
                  if (activo) {
                    setConfirmar({
                      titulo: "Cerrar sesión",
                      descripcion: "Tienes un recorrido activo. Se finalizará y dejarás de transmitir tu ubicación antes de cerrar sesión. ¿Continuar?",
                      textoConfirmar: "Cerrar sesión",
                      destructivo: true,
                      accion: salir,
                    });
                  } else {
                    void salir();
                  }
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
                style={{ background: "rgba(255,255,255,.14)" }}
                data-testid="button-salir"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              ><LogOut className="w-[18px] h-[18px]" /></button>
            </div>
          </div>
        </header>

        {/* Content (solapa levemente sobre el header) */}
        <div className="flex-1 flex flex-col gap-4 px-4 pt-4 pb-4 overflow-y-auto -mt-2">
          {/* Cargando la asignación (evita el falso "sin bus" mientras llega el dato) */}
          {!busId && busesLoading && (
            <div className="bg-white rounded-2xl px-6 py-8 text-center tp-shadow-card flex flex-col items-center">
              <Loader2 className="w-8 h-8 mb-3 animate-spin" style={{ color: "var(--color-sky)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--color-gray-text)" }}>Cargando tu asignación…</p>
            </div>
          )}

          {/* Sin bus asignado (solo una vez confirmado que no hay) */}
          {!busId && !busesLoading && (
            <div className="bg-white rounded-2xl px-6 py-8 text-center tp-shadow-card">
              <Bus className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--color-sky)" }} />
              <p className="text-sm font-bold" style={{ color: "var(--color-navy)" }}>Sin bus asignado</p>
              <p className="text-xs mt-1" style={{ color: "var(--color-gray-text)" }}>El administrador debe asignarte un bus para iniciar tu recorrido.</p>
            </div>
          )}

          {/* Card Turno / GPS con switch (control primario) */}
          {busId && (
            <div className="bg-white rounded-[18px] p-4 tp-shadow-card flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: gpsOk ? "rgba(56,161,105,.12)" : "var(--color-gray-light)" }}>
                <Radio className="w-[22px] h-[22px]" style={{ color: turnoInk }} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold text-sm" style={{ color: "var(--color-navy)" }}>{activo ? "En línea" : "Fuera de servicio"}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="tp-livedot" style={{ width: 6, height: 6, background: turnoInk, animationPlayState: gpsOk ? "running" : "paused" }} />
                  <span className="text-[11px] font-semibold" style={{ color: turnoInk }}>{turnoSub}</span>
                  {activo && <span className="text-[11px] font-mono font-bold flex items-center gap-1 ml-1" style={{ color: "var(--color-navy)" }}><Clock className="w-3 h-3" />{elapsed}</span>}
                </div>
              </div>
              <button
                onClick={toggleTurno}
                role="switch"
                aria-checked={activo}
                aria-label={activo ? "Finalizar turno" : "Iniciar turno"}
                className="relative shrink-0 rounded-full transition-colors"
                style={{ width: 52, height: 30, background: activo ? "var(--color-success)" : "#cbd5e1" }}
              >
                <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 24, height: 24, left: activo ? 25 : 3, boxShadow: "0 2px 5px rgba(0,0,0,.2)" }} />
              </button>
            </div>
          )}

          {/* GPS detalle (en turno) */}
          {activo && gpsLat !== null && (
            <div className="grid grid-cols-3 gap-2 -mt-1 text-xs font-mono px-1" style={{ color: "var(--color-gray-text)" }}>
              <div>Lat <span style={{ color: "var(--color-navy)" }}>{gpsLat.toFixed(4)}</span></div>
              <div>Lng <span style={{ color: "var(--color-navy)" }}>{gpsLng?.toFixed(4)}</span></div>
              <div>Envíos <span style={{ color: "var(--color-navy)" }}>{gpsCount}</span>{gpsVel > 0 && <span className="ml-1" style={{ color: "var(--color-success)" }}>· {Math.round(gpsVel)} km/h</span>}{gpsFallos > 0 && <span className="ml-1 font-bold" style={{ color: "var(--color-danger)" }}>· {gpsFallos} sin enviar</span>}</div>
            </div>
          )}

          {/* Sin señal de GPS */}
          {activo && gpsError && (
            <div className="rounded-2xl p-4 flex items-start gap-2" style={{ background: "rgba(229,62,62,0.1)", border: "1px solid rgba(229,62,62,0.4)" }}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--color-danger)" }} />
              <div>
                <p className="text-xs font-black uppercase tracking-wide" style={{ color: "var(--color-danger)" }}>Sin señal de GPS</p>
                <p className="text-sm mt-1" style={{ color: "var(--color-navy)" }}>Activa el GPS y da permiso de ubicación; mantén la app abierta y la pantalla encendida.</p>
              </div>
            </div>
          )}

          {/* Ocupación + novedad (solo en turno activo). En escritorio van en dos
              columnas para aprovechar el ancho; en celular quedan apiladas. */}
          {activo && (
            <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 md:items-start">
              {/* Ocupación del vehículo (cards grandes) */}
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.09em] px-1 mb-2" style={{ color: "var(--color-gray-text)" }}>Reportar ocupación</h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { val: "vacio", label: "Vacío", Icon: User, color: "#38A169" },
                    { val: "medio", label: "Medio", Icon: Users, color: "#F5B731" },
                    { val: "lleno", label: "Lleno", Icon: Users, color: "#E53E3E" },
                  ] as const).map((o) => {
                    const activa = ocupacion === o.val;
                    return (
                      <button key={o.val} onClick={() => enviarOcupacion(o.val)} aria-pressed={activa} aria-label={`Marcar ocupación: ${o.label}`} className="rounded-[18px] py-4 flex flex-col items-center gap-2.5 active:scale-95 transition-all" style={activa ? { background: o.color, color: "#fff", boxShadow: `0 8px 20px ${o.color}44` } : { background: "#fff", color: "var(--color-navy)", border: "1px solid #eef2f7" }}>
                        <span className="w-10 h-10 rounded-full flex items-center justify-center" style={activa ? { background: "rgba(255,255,255,0.25)" } : { background: "var(--color-gray-light)" }}>
                          <o.Icon className="w-[21px] h-[21px]" />
                        </span>
                        <span className="font-display font-bold text-xs">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reportar incidente / novedad */}
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.09em] px-1 mb-2" style={{ color: "var(--color-gray-text)" }}>Reportar novedad</h3>
                {selectedBus?.novedad ? (
                  <div className="rounded-[18px] p-4 tp-shadow-card" style={{ background: "rgba(245,183,49,0.12)", border: "1px solid rgba(245,183,49,0.45)" }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <AlertTriangle className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
                      <span className="text-xs font-black uppercase tracking-wide" style={{ color: "#7a5200" }}>Reporte activo</span>
                    </div>
                    <p className="text-sm mb-3" style={{ color: "var(--color-navy)" }}>{selectedBus.novedad}</p>
                    <button
                      onClick={() => setConfirmar({ titulo: "Quitar reporte", descripcion: `¿Retirar el reporte "${selectedBus.novedad}"? El bus volverá a aparecer en estado normal.`, textoConfirmar: "Quitar", accion: limpiarNovedad })}
                      data-testid="button-quitar-reporte"
                      className="w-full h-11 rounded-xl font-semibold flex items-center justify-center gap-1.5" style={{ background: "#fff", color: "var(--color-navy)", border: "1px solid #e2e8f0" }}>
                      <X className="w-4 h-4" /> Quitar reporte (volver a normal)
                    </button>
                  </div>
                ) : !showCustom ? (
                  <div className="flex gap-2 flex-wrap">
                    {NOVEDAD_OPCIONES.map((o) => (
                      <button key={o.label} onClick={() => enviarNovedad(o.texto)} disabled={reportarNovedad.isPending}
                        className="inline-flex items-center gap-1.5 rounded-[20px] px-3.5 py-2.5 text-[11px] font-semibold active:scale-95 transition-all disabled:opacity-50"
                        style={{ background: "#fff", border: "1px solid #eef2f7", color: "#7a5200" }}>
                        <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#c9911c" }} />{o.label}
                      </button>
                    ))}
                    <button onClick={() => setShowCustom(true)}
                      className="inline-flex items-center gap-1.5 rounded-[20px] px-3.5 py-2.5 text-[11px] font-semibold active:scale-95 transition-all"
                      style={{ background: "#fff", border: "1px solid #eef2f7", color: "var(--color-blue)" }}>
                      + Otra
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-[18px] p-4 tp-shadow-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-gray-text)" }}>Otra novedad</span>
                      <button onClick={() => { setShowCustom(false); setNovedadCustom(""); }} aria-label="Cerrar" className="p-1.5 -mr-1 rounded-lg" style={{ color: "var(--color-gray-text)" }}><X className="w-4 h-4" /></button>
                    </div>
                    <Textarea data-testid="input-novedad-custom" placeholder="Describe otra novedad..." value={novedadCustom} onChange={(e) => setNovedadCustom(e.target.value)} className="text-sm h-20 resize-none rounded-xl bg-white" />
                    <Button onClick={() => enviarNovedad(novedadCustom)} disabled={!novedadCustom.trim() || reportarNovedad.isPending} data-testid="button-novedad" className="w-full h-11 mt-2 text-sm font-bold rounded-xl text-white" style={{ background: "var(--color-blue)" }}>
                      Enviar reporte
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats (en turno) — datos reales: tiempo en servicio + envíos GPS */}
          {activo && (
            <div className="flex gap-2.5">
              <div className="flex-1 bg-white rounded-2xl p-3.5 tp-shadow-card">
                <div className="font-display font-extrabold text-[22px] leading-none" style={{ color: "var(--color-blue)" }}>{elapsed}</div>
                <div className="text-[10px] mt-1.5" style={{ color: "var(--color-gray-text)" }}>En servicio hoy</div>
              </div>
              <div className="flex-1 bg-white rounded-2xl p-3.5 tp-shadow-card">
                <div className="font-display font-extrabold text-[22px] leading-none" style={{ color: "var(--color-success)" }}>{gpsCount}</div>
                <div className="text-[10px] mt-1.5" style={{ color: "var(--color-gray-text)" }}>Envíos GPS</div>
              </div>
            </div>
          )}

          {/* Mapa opcional */}
          <button onClick={() => setShowMapa((v) => !v)} className="w-full flex items-center justify-center gap-2 text-xs py-2.5 rounded-xl bg-white tp-shadow-card" style={{ color: "var(--color-navy)" }}>
            <MapPin className="w-3.5 h-3.5" /> {showMapa ? "Ocultar mapa" : "Ver mi ubicación en el mapa"}
          </button>
          <div style={{ display: showMapa ? "block" : "none" }}>
            <div ref={mapContainerRef} className="w-full h-56 rounded-2xl overflow-hidden tp-shadow-card" data-testid="map-conductor" role="application" aria-label="Mapa con tu ubicación actual" />
          </div>
        </div>

        {/* Footer fijo: Iniciar / Detener viaje (comparte estado con el switch) */}
        {busId && (
          <div className="shrink-0 px-4 pt-3.5 pb-4 bg-white rounded-t-[22px]" style={{ boxShadow: "0 -6px 20px rgba(15,30,60,.06)" }}>
            {!activo ? (
              <button onClick={iniciar} disabled={busesLoading} data-testid="button-iniciar"
                className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-2.5 font-display font-extrabold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-50 tp-shadow-fab"
                style={{ background: "var(--color-gold)", color: "#4a3300" }}>
                <Play className="w-[19px] h-[19px]" style={{ fill: "#4a3300" }} /> Iniciar viaje
              </button>
            ) : (
              <button onClick={pedirFinalizar} disabled={finalizarRecorrido.isPending} data-testid="button-finalizar"
                className="w-full h-[54px] rounded-2xl flex items-center justify-center gap-2.5 font-display font-extrabold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60"
                style={{ background: "#fff", color: "var(--color-danger)", border: "2px solid var(--color-danger)" }}>
                <Square className="w-[19px] h-[19px]" style={{ fill: "var(--color-danger)" }} /> Detener viaje
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog opts={confirmar} onClose={() => setConfirmar(null)} />
      <CambiarPasswordDialog open={cambiarPass} onClose={() => setCambiarPass(false)} />
    </div>
  );
}
