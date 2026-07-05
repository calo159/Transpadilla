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
  // Mientras se confirma que el GPS está encendido y con permiso (antes de
  // marcar el viaje como activo). El viaje NO inicia hasta tener una posición real.
  const [iniciando, setIniciando] = useState(false);
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
  //
  // `onFirst(ok)` (opcional) se dispara UNA sola vez con la primera respuesta del
  // watcher: sirve para "sondear" el GPS al iniciar el viaje (ok=true si llegó una
  // posición real; ok=false si el GPS está apagado o el permiso denegado).
  const iniciarWatch = useCallback((onFirst?: (ok: boolean) => void) => {
    let firstFired = false;
    const fireFirst = (ok: boolean) => { if (!firstFired) { firstFired = true; onFirst?.(ok); } };
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
          if (err || !pos) { setGpsError(true); fireFirst(false); return; }
          sendGps(pos.latitude, pos.longitude, (pos.speed ?? 0) * 3.6);
          fireFirst(true);
        },
      ).then((id) => { gpsWatchRef.current = id; }).catch(() => { setGpsError(true); fireFirst(false); });
    } else {
      if (!navigator.geolocation) { fireFirst(false); return; }
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current as number);
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => { sendGps(pos.coords.latitude, pos.coords.longitude, (pos.coords.speed ?? 0) * 3.6); fireFirst(true); },
        () => { setGpsError(true); fireFirst(false); },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }
  }, [sendGps]);

  // Detiene el watcher GPS (según plataforma). Reutilizable por finalizar() y por
  // iniciar() cuando la sonda de GPS falla.
  const detenerWatch = useCallback(() => {
    if (gpsWatchRef.current !== null) {
      if (Capacitor.isNativePlatform()) {
        BackgroundGeolocation.removeWatcher({ id: gpsWatchRef.current as string }).catch(() => {});
      } else {
        navigator.geolocation.clearWatch(gpsWatchRef.current as number);
      }
      gpsWatchRef.current = null;
    }
  }, []);

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

  // Inicia el viaje SOLO si el GPS está encendido y con permiso. Al tocar el botón,
  // pedimos la ubicación (dispara el prompt de permiso); el viaje NO se marca activo
  // hasta recibir la primera posición real. Si el GPS está apagado o el permiso
  // denegado, no inicia y se muestra una guía para activarlo.
  const iniciar = () => {
    if (!busId) { toast({ title: "No tienes un bus asignado. Contacta al administrador.", variant: "destructive" }); return; }
    if (!Capacitor.isNativePlatform() && !navigator.geolocation) {
      toast({ title: "GPS no disponible en este dispositivo", variant: "destructive" }); return;
    }
    if (iniciando || activo) return;

    setIniciando(true);
    setGpsError(false);

    // Watchdog: si en 12s no hubo respuesta del GPS, cancelamos el intento.
    const watchdog = setTimeout(() => {
      detenerWatch();
      setIniciando(false);
      toast({
        title: "No se pudo obtener tu ubicación",
        description: "Enciende el GPS/Ubicación de tu teléfono, sal a un lugar con señal e inténtalo de nuevo.",
        variant: "destructive",
      });
    }, 12000);

    iniciarWatch((ok) => {
      clearTimeout(watchdog);
      setIniciando(false);
      if (ok) {
        // GPS confirmado: ahora sí arranca el viaje.
        setGpsCount(0);
        setActivo(true);
        pedirWakeLock();
        toast({ title: "Recorrido iniciado", description: "Mantén la app abierta; la pantalla quedará encendida." });
      } else {
        // GPS apagado o permiso denegado: cancelamos y guiamos al conductor.
        detenerWatch();
        toast({
          title: "Activa el GPS para iniciar el viaje",
          description:
            "Permite la ubicación cuando el navegador lo pida (toca el ícono de ubicación/candado en la barra de direcciones) y enciende el GPS del teléfono. En Android: Ajustes → Ubicación → Activar. Luego vuelve a tocar Iniciar Turno.",
          variant: "destructive",
        });
      }
    });
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
    detenerWatch();
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

  return (
    <div className="bg-[#f7f9fb] min-h-screen">
      {/* Fixed Top Bar — glassmorphism stitch-style */}
      <header className="fixed top-4 left-4 right-4 z-50 backdrop-blur-md bg-primary/85 rounded-xl shadow-md flex items-center justify-between px-4 h-14 w-[calc(100%-32px)] mx-auto">
        <button onClick={() => setLocation("/")} className="text-white p-2 -ml-1.5 active:scale-90 transition-transform" aria-label="Volver al mapa" title="Volver al mapa">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-display font-extrabold text-lg tracking-wide text-white">TRANSPADILLA</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setCambiarPass(true)} className="text-white/80 hover:text-white p-2 active:scale-90 transition-transform" aria-label="Cambiar contraseña" title="Cambiar contraseña"><KeyRound className="w-4 h-4" /></button>
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
            className="text-white/80 hover:text-white p-2 active:scale-90 transition-transform"
            data-testid="button-salir"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          ><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="max-w-md md:max-w-2xl mx-auto flex flex-col min-h-screen pt-20 px-4 pb-6">
        <div className="flex flex-col gap-4">
          {/* Asignación actual — stitch-style card with glow */}
          <section className="relative overflow-hidden rounded-2xl p-4 flex items-center justify-between shadow-lg" style={{ background: "var(--color-navy)" }}>
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-40 blur-2xl" style={{ background: "var(--color-sky)" }} />
            <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full opacity-30 blur-2xl" style={{ background: "var(--color-gold)" }} />
            <div className="flex items-center gap-3 min-w-0 relative z-10">
              <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Bus className="w-7 h-7 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Asignación actual</p>
                <h2 className="font-display font-bold text-lg text-white leading-tight truncate" data-testid="text-conductor">
                  {selectedBus?.nombre_ruta ? selectedBus.nombre_ruta : selectedBus ? `Bus ${selectedBus.placa}` : "Sin asignación"}
                </h2>
                {selectedBus && <p className="text-xs text-white/70 mt-0.5">Bus <span className="font-mono font-bold">{selectedBus.placa}</span> · {user?.nombre}</p>}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0 ml-2 relative z-10">
              {(() => {
                const sinRed = activo && !gpsError && gpsFallos >= 2;
                const ok = activo && !gpsError && !sinRed;
                const dot = ok ? "var(--color-gold)" : sinRed || gpsError ? "#f87171" : "rgba(255,255,255,0.4)";
                const txt = !activo ? (iniciando ? "ACTIVANDO" : "GPS OFF") : gpsError ? "SIN GPS" : sinRed ? "SIN RED" : "GPS OK";
                return (
                  <>
                    <span className="relative flex w-5 h-5 items-center justify-center">
                      {ok && <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--color-gold)" }} />}
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5" style={{ background: dot }} />
                    </span>
                    <span className="text-[10px] font-semibold text-white/80">{txt}</span>
                  </>
                );
              })()}
              {activo && <span className="text-[11px] font-mono font-bold text-white flex items-center gap-1"><Clock className="w-3 h-3" />{elapsed}</span>}
            </div>
          </section>

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

          {/* Cargando la asignación */}
          {!busId && busesLoading && (
            <div className="bg-white rounded-2xl px-6 py-10 text-center shadow-sm flex flex-col items-center">
              <Loader2 className="w-8 h-8 mb-3 animate-spin" style={{ color: "var(--color-sky)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--color-gray-text)" }}>Cargando tu asignación…</p>
            </div>
          )}

          {/* Sin bus asignado */}
          {!busId && !busesLoading && (
            <div className="bg-white rounded-2xl px-6 py-10 text-center shadow-sm">
              <Bus className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--color-sky)" }} />
              <p className="text-sm font-bold" style={{ color: "var(--color-navy)" }}>Sin bus asignado</p>
              <p className="text-xs mt-1" style={{ color: "var(--color-gray-text)" }}>El administrador debe asignarte un bus para iniciar tu recorrido.</p>
            </div>
          )}

          {/* Botón GRAN turno — stitch-style toggle */}
          {!busId && busesLoading ? null : !activo ? (
            <button onClick={iniciar} disabled={!busId || iniciando} data-testid="button-iniciar" className="w-full rounded-2xl py-12 flex flex-col items-center justify-center gap-4 shadow-lg active:scale-[0.98] transition-transform disabled:opacity-50 text-white border-2 border-transparent" style={{ background: "var(--color-navy)" }}>
              {iniciando ? (
                <>
                  <Loader2 className="w-16 h-16 animate-spin" />
                  <span className="text-xl font-extrabold uppercase tracking-wide">Activando GPS…</span>
                  <span className="text-sm text-white/70">Permite la ubicación para iniciar</span>
                </>
              ) : (
                <>
                  <Play className="w-16 h-16 fill-white" />
                  <span className="text-xl font-extrabold uppercase tracking-wide">Iniciar Turno</span>
                  <span className="text-sm text-white/70">Toque para registrar su inicio de recorrido</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => setConfirmar({ titulo: "Finalizar recorrido", descripcion: "¿Seguro que quieres finalizar el recorrido? Dejarás de transmitir tu ubicación.", textoConfirmar: "Finalizar", destructivo: true, accion: async () => { await finalizar(); } })}
              disabled={finalizarRecorrido.isPending}
              data-testid="button-finalizar"
              className="w-full rounded-2xl py-12 flex flex-col items-center justify-center gap-4 shadow-lg active:scale-[0.98] transition-transform text-white disabled:opacity-60 border-2 border-transparent"
              style={{ background: "var(--color-danger)" }}
            >
              <Square className="w-16 h-16 fill-white" />
              <span className="text-xl font-extrabold uppercase tracking-wide">Finalizar Turno</span>
              <span className="text-sm text-white/80">Recorrido en progreso · {elapsed}</span>
            </button>
          )}

          {/* Ocupación + novedad (solo en turno activo). En escritorio van en dos
              columnas para aprovechar el ancho; en celular quedan apiladas. */}
          {activo && (
            <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 md:items-start">
              {/* Ocupación del vehículo — stitch-style grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider px-1 mb-2" style={{ color: "var(--color-gray-text)" }}>Ocupación del vehículo</h3>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { val: "vacio", label: "Vacío", Icon: User, color: "#38A169" },
                    { val: "medio", label: "Medio", Icon: Users, color: "#F5B731" },
                    { val: "lleno", label: "Lleno", Icon: Users, color: "#E53E3E" },
                  ] as const).map((o) => {
                    const activa = ocupacion === o.val;
                    return (
                      <button key={o.val} onClick={() => enviarOcupacion(o.val)} aria-pressed={activa} aria-label={`Marcar ocupación: ${o.label}`} className="rounded-2xl py-6 flex flex-col items-center gap-3 shadow-sm active:scale-95 transition-all border" style={activa ? { background: o.color, color: "#fff", borderColor: o.color } : { background: "#fff", color: "var(--color-navy)", borderColor: "#eef2f7" }}>
                        <span className="w-14 h-14 rounded-full flex items-center justify-center" style={activa ? { background: "rgba(255,255,255,0.25)" } : { background: "#eef2f7" }}>
                          <o.Icon className="w-7 h-7" />
                        </span>
                        <span className="font-bold text-sm">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reportar incidente / novedad */}
              {selectedBus?.novedad ? (
                <div className="rounded-2xl p-4 shadow-sm" style={{ background: "rgba(245,183,49,0.12)", border: "1px solid rgba(245,183,49,0.45)" }}>
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
                <button onClick={() => setShowCustom(true)} className="w-full rounded-2xl py-6 flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] transition-transform text-white border-2 border-transparent" style={{ background: "var(--color-danger)" }}>
                  <AlertTriangle className="w-7 h-7 fill-white" />
                  <span className="font-extrabold uppercase tracking-wider text-sm">Reportar incidente</span>
                </button>
              ) : (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-gray-text)" }}>Reportar novedad</span>
                    <button onClick={() => { setShowCustom(false); setNovedadCustom(""); }} aria-label="Cerrar" className="p-1.5 -mr-1 rounded-lg" style={{ color: "var(--color-gray-text)" }}><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {NOVEDAD_OPCIONES.map((o) => (
                      <button key={o.label} onClick={() => enviarNovedad(o.texto)} disabled={reportarNovedad.isPending} className="h-11 rounded-xl text-sm font-semibold active:scale-95 transition-all disabled:opacity-50" style={{ background: "var(--color-gray-light)", color: "var(--color-navy)" }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <Textarea data-testid="input-novedad-custom" placeholder="Describe otra novedad..." value={novedadCustom} onChange={(e) => setNovedadCustom(e.target.value)} className="mt-2 text-sm h-20 resize-none rounded-xl bg-white" />
                  <Button onClick={() => enviarNovedad(novedadCustom)} disabled={!novedadCustom.trim() || reportarNovedad.isPending} data-testid="button-novedad" className="w-full h-11 mt-2 text-sm font-bold rounded-xl text-white" style={{ background: "var(--color-blue)" }}>
                    Enviar reporte
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Estado de transmisión + mapa opcional */}
          <div className="flex items-center justify-center gap-2 text-xs py-2">
            <Radio className="w-3.5 h-3.5" style={{ color: activo ? "var(--color-success)" : "var(--color-gray-text)" }} />
            <span style={{ color: "var(--color-gray-text)" }}>{activo ? "Transmitiendo GPS en vivo" : "GPS inactivo"}</span>
          </div>
          <button onClick={() => setShowMapa((v) => !v)} className="w-full flex items-center justify-center gap-2 text-xs py-3 rounded-xl bg-white shadow-sm active:scale-[0.98] transition-transform" style={{ color: "var(--color-navy)" }}>
            <MapPin className="w-3.5 h-3.5" /> {showMapa ? "Ocultar mapa" : "Ver mi ubicación en el mapa"}
          </button>
          <div style={{ display: showMapa ? "block" : "none" }}>
            <div ref={mapContainerRef} className="w-full h-56 rounded-2xl overflow-hidden shadow-sm" data-testid="map-conductor" role="application" aria-label="Mapa con tu ubicación actual" />
          </div>
        </div>
      </div>

      <ConfirmDialog opts={confirmar} onClose={() => setConfirmar(null)} />
      <CambiarPasswordDialog open={cambiarPass} onClose={() => setCambiarPass(false)} />
    </div>
  );
}
