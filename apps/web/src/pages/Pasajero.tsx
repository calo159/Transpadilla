import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useGetRutas, useGetBuses, getGetBusesQueryKey, useGetBannerActivo, getGetBannerActivoQueryKey } from "@workspace/api-client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { cerrarSesion, getUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import {
  Bus, MapPin, LogOut, Radio, AlertTriangle, X,
  Search, Clock, LogIn, Shield, ChevronRight, ChevronUp,
  Menu, MessageCircle, Instagram, LocateFixed, Loader2, Star, HelpCircle, Navigation, RefreshCw,
  User, Map as MapIcon, Route as RouteIcon, Check, History, Download, Maximize2,
  Share, SquarePlus, MapPinned,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoTP } from "@/components/LogoTP";
import { useToast } from "@/hooks/use-toast";
import {
  pushSoportado, pushDisponibleEnServidor, estadoSuscripcion,
  activarNotificaciones, desactivarNotificaciones, actualizarRutas,
} from "@/lib/push";
import { RutaCard } from "@/components/pasajero/RutaCard";
import { RouteRow } from "@/components/pasajero/RouteRow";
import { ParaderoCard } from "@/components/pasajero/ParaderoCard";
import { io, type Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchStreetRoute } from "@/lib/routing";
import { crearFlechasDireccion } from "@/lib/map-arrows";
import { useLeafletMap } from "@/hooks/use-leaflet-map";
import { WHATSAPP_NUMERO, INSTAGRAM_URL, TARIFA_COP } from "@/lib/constants";
import type { BusLocation, Novedad } from "@/lib/types";
import { tiempoRelativo } from "@/lib/format";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { distanciaKm, velEfectiva, puntoMasCercanoEnLinea, posEnCircuito, distanciaAdelanteM, etaPorParadaDeBus } from "@/lib/geo";
import { recomendarRuta, busMasCercano } from "@/lib/sugerencia";
import { escHtml, colorSeguro } from "@/lib/html";
import { ocupacionInfo, OCUPACION_ORDEN } from "@/lib/ocupacion";

/** Evento `beforeinstallprompt` (no está en los tipos estándar del DOM). */
interface BeforeInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Lugar / punto de interés (GET /api/lugares) para la búsqueda por destino. */
interface Lugar {
  id: number;
  nombre: string;
  categoria: string | null;
  latitud: number;
  longitud: number;
}

// SVG estáticos del ícono del marcador de bus (sin emoji, regla del UI skill).
// Izados a constantes de módulo: `updateBusMarker` corre en el hot path del GPS
// (una vez por cada posición que llega de cada bus), y estas cadenas no dependen
// de nada por-render — recrearlas ahí era trabajo repetido innecesario.
const SVG_ALERTA_MARCADOR = `<svg width="9" height="9" viewBox="0 0 24 24" fill="#1B3B6F"><path d="M12 2 1 21h22L12 2Zm0 6a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 9a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg>`;
const SVG_BUS_MARCADOR = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M6 2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H9v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 4v5h12V6H6Zm2 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>`;

export default function Pasajero() {
  useDocumentTitle("TransPadilla — Buses de Riohacha en vivo");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useLeafletMap(mapContainerRef, { zoom: 13 });
  const markersRef = useRef<Record<number, L.Marker>>({});
  // Firma visual del último ícono/popup pintado por bus: si no cambia, en un ping
  // que solo mueve el bus evitamos reconstruir el DOM (setIcon/setPopupContent).
  const markerSigRef = useRef<Record<number, string>>({});
  const routeLayersRef = useRef<Record<number, L.Polyline>>({});
  const arrowLayersRef = useRef<Record<number, L.LayerGroup>>({});
  const stopMarkersRef = useRef<Array<{ rutaId: number; marker: L.Marker }>>([]);
  const socketRef = useRef<Socket | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const destinoMarkerRef = useRef<L.Marker | null>(null);
  const miParadaMarkerRef = useRef<L.Marker | null>(null);
  // Un timer de auto-cierre por bus (no uno global): así la novedad de un bus no
  // se pisa ni reinicia el temporizador de la de otro.
  const novedadTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const queryClient = useQueryClient();

  const [selectedRutaId, setSelectedRutaId] = useState<number | null>(null);
  // Espejo de la ruta seleccionada para leerlo dentro del handler del socket
  // (que se monta una sola vez y de otro modo capturaría un valor obsoleto).
  const selectedRutaIdRef = useRef<number | null>(null);
  // Espejos de vista/modoDestino para leerlos dentro del callback async de fetchStreetRoute.
  const vistaRef = useRef<"mapa" | "favoritos" | "rutas" | "paraderos">("mapa");
  const modoDestinoRef = useRef(false);
  const [etaPorParada, setEtaPorParada] = useState<Record<number, { eta: number; placa: string }>>({});
  // "Seguir mi bus": el mapa hace pan automático al bus elegido cuando se mueve.
  const [siguiendoBusId, setSiguiendoBusId] = useState<number | null>(null);
  const siguiendoBusRef = useRef<number | null>(null);
  // Espejo del ETA por parada para leerlo dentro de updateBusMarker (useCallback []).
  const etaRef = useRef<Record<number, { eta: number; placa: string }>>({});
  // Pila de novedades activas (una por bus como máximo, la más reciente de c/u).
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Card de detalle inferior (móvil): minimizado (barra), medio o expandido.
  // Bajarlo NO lo cierra (solo la X); queda en "peek" dejando ver el mapa.
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("half");
  // Vista activa (bottom nav móvil): mapa | favoritos | rutas | paraderos.
  const [vista, setVista] = useState<"mapa" | "favoritos" | "rutas" | "paraderos">("mapa");
  // Menú ☰ del header (acciones: destino, atención, info).
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Índice del ejemplo que rota en el placeholder del buscador (solo cuando está vacío).
  const [ejemploIdx, setEjemploIdx] = useState(0);
  // Ref al buscador (móvil) para enfocarlo desde la bienvenida ("¿A dónde vas?").
  const busquedaRef = useRef<HTMLInputElement>(null);
  // Estado real de la conexión en vivo (Socket.IO). Empieza false; "connect" lo pone true.
  const [conectado, setConectado] = useState(false);
  // Gracia de arranque: en los primeros instantes el socket aún no conectó, así que
  // en vez de un alarmante "SIN CONEXIÓN" se muestra "CONECTANDO…" hasta que pase.
  const [graciaConexion, setGraciaConexion] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGraciaConexion(false), 2500);
    return () => clearTimeout(t);
  }, []);
  const [locating, setLocating] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  // Se incrementa cuando la geometría de calles de una ruta termina de cargar,
  // para que el marcador "Súbete aquí" recalcule sobre la línea real dibujada.
  const [geomVersion, setGeomVersion] = useState(0);
  // "¿A dónde vas?": el usuario arma el modo y toca el mapa para fijar su destino;
  // la app recomienda la ruta y el bus más cercano de esa ruta en vivo.
  const [modoDestino, setModoDestino] = useState(false);
  const [destino, setDestino] = useState<{ lat: number; lng: number } | null>(null);
  // Rutas favoritas del pasajero (se recuerdan en localStorage y van arriba).
  const [favoritos, setFavoritos] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("tp_favoritos") ?? "[]") as number[]; }
    catch { return []; }
  });
  const toggleFavorito = (id: number) => {
    setFavoritos((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("tp_favoritos", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  // Sincroniza los favoritos con el backend (anónimo, por dispositivo) para el
  // reporte "ruta más solicitada". Best-effort: si falla, la UX no se ve afectada.
  // Corre al montar (backfill de los favoritos ya guardados) y cuando cambian.
  useEffect(() => {
    let clienteId: string;
    try {
      clienteId = localStorage.getItem("tp_cliente_id") ?? "";
      if (!clienteId) {
        clienteId = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2));
        localStorage.setItem("tp_cliente_id", clienteId);
      }
    } catch { return; }
    const t = setTimeout(() => {
      void apiFetch("/api/favoritos", {
        method: "POST",
        body: JSON.stringify({ cliente_id: clienteId, rutas: favoritos }),
      }).catch(() => { /* red caída: se reintenta en el próximo cambio */ });
    }, 400);
    return () => clearTimeout(t);
  }, [favoritos]);

  // ── Notificaciones push por ruta (antes era un switch global "todas mis
  // favoritas"; ahora una campana independiente por fila, junto a la estrella) ──
  const [rutasNotificadas, setRutasNotificadas] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("tp_rutas_notificadas") ?? "[]") as number[]; }
    catch { return []; }
  });
  const [pushDisponible, setPushDisponible] = useState(false);
  const [pushActivo, setPushActivo] = useState(false);
  useEffect(() => {
    if (!pushSoportado()) return;
    void pushDisponibleEnServidor().then(async (ok) => {
      setPushDisponible(ok);
      if (!ok) return;
      const activo = await estadoSuscripcion();
      setPushActivo(activo);
      // Migración suave: ya había una suscripción (modelo viejo, "todas mis
      // favoritas") pero nunca se guardó el array por-ruta nuevo → adoptar los
      // favoritos actuales como notificadas, para no dejar de avisarle a nadie.
      if (activo && rutasNotificadas.length === 0 && favoritos.length > 0) {
        setRutasNotificadas(favoritos);
        try { localStorage.setItem("tp_rutas_notificadas", JSON.stringify(favoritos)); } catch { /* ignore */ }
        void actualizarRutas(favoritos);
      }
    });
    // Solo al montar: es una migración de una sola vez, no debe repetirse con cada cambio de favoritos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleNotificarRuta = async (id: number) => {
    const yaNotificada = rutasNotificadas.includes(id);
    const next = yaNotificada ? rutasNotificadas.filter((x) => x !== id) : [...rutasNotificadas, id];
    if (!yaNotificada && !pushActivo) {
      const r = await activarNotificaciones(next);
      if (!r.ok) {
        if (r.motivo === "permiso-denegado") {
          toast({ title: "Permiso denegado", description: "Activa las notificaciones en tu navegador.", variant: "destructive" });
        } else {
          toast({ title: "No se pudo activar", description: "Inténtalo de nuevo más tarde.", variant: "destructive" });
        }
        return;
      }
      setPushActivo(true);
      toast({ title: "Notificaciones activadas", description: "Te avisaremos de esta ruta." });
    } else if (next.length === 0 && pushActivo) {
      await desactivarNotificaciones();
      setPushActivo(false);
    } else {
      await actualizarRutas(next);
    }
    setRutasNotificadas(next);
    try { localStorage.setItem("tp_rutas_notificadas", JSON.stringify(next)); } catch { /* ignore */ }
  };

  // Última ruta vista (se recuerda en localStorage) para acceso rápido a ella.
  const [recientes, setRecientes] = useState<number[]>(() => {
    try { return (JSON.parse(localStorage.getItem("tp_recientes") ?? "[]") as number[]).slice(0, 1); }
    catch { return []; }
  });
  const pushReciente = (id: number) => {
    setRecientes((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 1);
      try { localStorage.setItem("tp_recientes", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  // Pedir la ubicación al entrar (tarjeta suave). Estado del permiso del navegador
  // + un flag para no volver a mostrar la tarjeta si el usuario la cerró.
  const [permisoGeo, setPermisoGeo] = useState<"granted" | "prompt" | "denied" | null>(null);
  const [ubicacionPromptCerrado, setUbicacionPromptCerrado] = useState(
    () => typeof localStorage !== "undefined" && !!localStorage.getItem("tp_ubicacion_pedida"),
  );
  const dismissPromptUbicacion = () => {
    setUbicacionPromptCerrado(true);
    try { localStorage.setItem("tp_ubicacion_pedida", "1"); } catch { /* ignore */ }
  };
  // Guía interactiva paso a paso (spotlight) para primerizos: sombrea todo menos el
  // elemento que hay que pulsar y va avanzando sola según la acción del usuario.
  // Pasos: ubicacion → destino → elegir → resultado. Reemplaza la vieja bienvenida.
  type PasoGuia = "off" | "ubicacion" | "destino" | "elegir" | "resultado";
  const [tourStep, setTourStep] = useState<PasoGuia>("off");
  // Si la guía ya se resolvió (terminada/saltada esta sesión, o ya vista antes):
  // el banner "Instalar app" espera a esto para no competir con la guía ni
  // aparecer de golpe antes de que ni siquiera arranque.
  const [guiaTerminada, setGuiaTerminada] = useState(
    () => typeof localStorage !== "undefined" && !!localStorage.getItem("tp_guia_visto"),
  );
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const ubicacionCardRef = useRef<HTMLDivElement | null>(null);
  const fabDestinoRef = useRef<HTMLButtonElement | null>(null);
  // Si el paso de ubicación entró en esta corrida (para el contador "Paso X de N").
  const tourConUbicacionRef = useRef(false);
  // Evita relanzar la guía sola más de una vez por sesión.
  const guiaArrancadaRef = useRef(false);
  // Panel de ayuda "¿Cómo funciona?" — accesible en cualquier momento con el botón ?.
  const [showAyuda, setShowAyuda] = useState(false);
  // Anuncio a pantalla completa que publica el admin: se muestra a cada visita (no
  // se persiste "visto"). Se cierra con la X o solo a los 15s. 204 → data null.
  const { data: bannerActivo } = useGetBannerActivo({
    query: { queryKey: getGetBannerActivoQueryKey() },
  });
  const banner = bannerActivo && typeof bannerActivo === "object" ? bannerActivo : null;
  const [bannerCerrado, setBannerCerrado] = useState(false);
  const showAnuncio = !!banner && !bannerCerrado;
  useEffect(() => {
    if (!showAnuncio) return;
    const t = setTimeout(() => setBannerCerrado(true), 15000);
    return () => clearTimeout(t);
  }, [showAnuncio]);
  // Banner "Instalar app" (PWA). El navegador dispara beforeinstallprompt cuando
  // la app es instalable; lo guardamos para ofrecer la instalación a un toque.
  const [installEvt, setInstallEvt] = useState<BeforeInstallPrompt | null>(null);
  // Se oculta solo durante esta sesión (no se persiste): así reaparece en cada
  // visita hasta que la app quede instalada (yaInstalada / appinstalled lo cortan).
  const [installOculto, setInstallOculto] = useState(false);
  // El banner entra ~1.2s después de cargar (animado, sin competir con la carga inicial).
  const [bannerVisible, setBannerVisible] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPrompt); };
    const onInstalled = () => { setInstallEvt(null); setInstallOculto(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const t = setTimeout(() => setBannerVisible(true), 1200);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(t);
    };
  }, []);
  // iPhone/iPad: Safari NO soporta beforeinstallprompt → se muestran instrucciones.
  const esIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  // Ya instalada: standalone en Android/desktop o navigator.standalone en iOS.
  const yaInstalada =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" && "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
  // Dentro del APK (build con VITE_API_URL) no tiene sentido ofrecer instalar la PWA.
  const enAPK = !!import.meta.env.VITE_API_URL;
  // Espera a que la guía interactiva termine (o a que ya estuviera vista de antes):
  // no debe competir por espacio/atención con el spotlight ni aparecer antes de que
  // el primerizo ni siquiera la haya visto.
  const mostrarInstall = bannerVisible && !installOculto && !yaInstalada && !enAPK && (!!installEvt || esIOS) && guiaTerminada;
  const instalarApp = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    try { await installEvt.userChoice; } catch { /* el usuario cerró el diálogo */ }
    setInstallEvt(null); // el evento es de un solo uso
  };
  const descartarInstall = () => {
    // Solo para esta sesión: en la próxima visita el banner vuelve a aparecer.
    setInstallOculto(true);
  };
  // Arrastre del card de detalle (swipe). dragOffset = px en vivo durante el gesto.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; moved: boolean; lastDelta: number } | null>(null);
  const suppressClickRef = useRef(false);
  const user = getUser();

  const {
    data: rutasRaw = [],
    isLoading: rutasLoading,
    isError: rutasError,
    refetch: refetchRutas,
  } = useGetRutas({ query: { queryKey: ["rutas"], refetchInterval: 15000 } });
  // El pasajero NO ve las rutas pausadas (activa === false). El admin sí (otra query).
  const rutas = useMemo(() => rutasRaw.filter((r) => r.activa !== false), [rutasRaw]);
  const { data: buses = [], refetch: refetchBuses } = useGetBuses({
    query: { queryKey: getGetBusesQueryKey(), refetchInterval: 10000 },
  });
  // Lugares / puntos de interés que el admin registró: dejan al pasajero buscar su
  // DESTINO por nombre (hospital, mercado…) y disparar la recomendación de ruta.
  const { data: lugares = [] } = useQuery({
    queryKey: ["lugares"],
    queryFn: async (): Promise<Lugar[]> => {
      const res = await apiFetch("/api/lugares");
      if (!res.ok) throw new Error("No se pudieron cargar los lugares");
      return res.json();
    },
    staleTime: 5 * 60_000, // cambian poco; no hace falta refrescarlos seguido
  });
  const reintentarCarga = () => { refetchRutas(); refetchBuses(); };

  // Espejo de `buses` en un ref: permite que el socket y los marcadores lean el
  // estado actual sin recrear/reconectar el efecto en cada refetch.
  const busesRef = useRef(buses);
  useEffect(() => { busesRef.current = buses; }, [buses]);

  // Ruta con buses circulando ahora (lo más accionable para el pasajero).
  const rutaTieneVivos = (id: number) => buses.some((b) => b.ruta_id === id && b.estado !== "inactivo");
  // Cuántos buses de una ruta están circulando ahora (para mostrarlo en la tarjeta).
  const rutaBusesVivos = (id: number) => buses.filter((b) => b.ruta_id === id && b.estado !== "inactivo").length;
  // Orden de la lista (más fácil de usar): favoritas → con buses en vivo → resto,
  // y dentro de cada grupo, alfabético.
  const rutasFiltradas = useMemo(
    () =>
      rutas
        .filter((r) => r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
        .sort((a, b) => {
          const fa = favoritos.includes(a.id), fb = favoritos.includes(b.id);
          if (fa !== fb) return fa ? -1 : 1;
          const la = rutaTieneVivos(a.id), lb = rutaTieneVivos(b.id);
          if (la !== lb) return la ? -1 : 1;
          return a.nombre.localeCompare(b.nombre);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rutas, buses, busqueda, favoritos],
  );
  // Lugares que casan con la búsqueda (por nombre o categoría). Solo con texto:
  // sin búsqueda no se listan (la lista de rutas manda cuando no se busca nada).
  const lugaresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [] as Lugar[];
    return lugares
      .filter((l) => l.nombre.toLowerCase().includes(q) || (l.categoria ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [lugares, busqueda]);
  const selectedRuta = useMemo(() => rutas.find((r) => r.id === selectedRutaId), [rutas, selectedRutaId]);
  const activeBuses = useMemo(() => buses.filter((b) => b.estado === "activo"), [buses]);
  // Ejemplos que rotan en el placeholder del buscador: se arman con datos reales
  // (lugares + rutas) para que quede claro que busca AMBAS cosas; fallback estático.
  const ejemplosBusqueda = useMemo(() => {
    const deLugares = lugares.map((l) => l.nombre).filter(Boolean).slice(0, 3);
    const deRutas = rutas.map((r) => r.nombre).filter(Boolean).slice(0, 2);
    const lista = [...deLugares, ...deRutas];
    return lista.length > 0 ? lista : ["hospital", "mercado", "terminal", "RUTA A"];
  }, [lugares, rutas]);
  // Rota el ejemplo cada ~2.8s, solo mientras el buscador está vacío (para no molestar).
  useEffect(() => {
    if (busqueda !== "" || ejemplosBusqueda.length <= 1) return;
    const t = setInterval(() => setEjemploIdx((i) => (i + 1) % ejemplosBusqueda.length), 2800);
    return () => clearInterval(t);
  }, [busqueda, ejemplosBusqueda.length]);
  const placeholderBusqueda = busqueda === "" && ejemplosBusqueda.length > 0
    ? `Buscar: "${ejemplosBusqueda[ejemploIdx % ejemplosBusqueda.length]}"…`
    : "Busca tu destino o una ruta";
  // ETA aproximada por ruta para la lista del sidebar (sin llamar al endpoint
  // /eta de cada una): distancia del bus más cercano de la ruta a su parada más
  // próxima, a la velocidad efectiva del bus. El detalle de la ruta seleccionada
  // sigue usando el ETA preciso del backend (etaPorParada).
  const etaAproxPorRuta = useMemo(() => {
    const map: Record<number, number | null> = {};
    for (const ruta of rutas) {
      const rutaBuses = buses.filter((b) => b.ruta_id === ruta.id && b.estado !== "inactivo" && b.lat != null && b.lng != null);
      if (rutaBuses.length === 0 || ruta.paradas.length === 0) { map[ruta.id] = null; continue; }
      // Con mi ubicación: ETA del próximo bus que viene hacia mí por el recorrido
      // (distancia por delante en el circuito). Sin ubicación o si no se puede
      // proyectar: bus más cercano a cualquier parada en línea recta (fallback).
      const miPos = userPos && ruta.paradas.length >= 2 ? posEnCircuito(userPos.lat, userPos.lng, ruta.paradas) : null;
      let mejor = Infinity;
      for (const b of rutaBuses) {
        if (miPos) {
          const busPos = posEnCircuito(b.lat!, b.lng!, ruta.paradas);
          const distKm = busPos ? distanciaAdelanteM(busPos.s, miPos.s, miPos.L) / 1000 : distanciaKm(userPos!.lat, userPos!.lng, b.lat!, b.lng!);
          const t = (distKm / velEfectiva(b.velocidad)) * 60;
          if (t < mejor) mejor = t;
        } else {
          for (const p of ruta.paradas) {
            const d = distanciaKm(b.lat!, b.lng!, p.latitud, p.longitud);
            const t = (d / velEfectiva(b.velocidad)) * 60;
            if (t < mejor) mejor = t;
          }
        }
      }
      map[ruta.id] = Number.isFinite(mejor) ? Math.max(0, Math.round(mejor)) : null;
    }
    return map;
  }, [rutas, buses, userPos]);

  // El mapa lo crea y destruye useLeafletMap (ver declaración de mapRef arriba).

  // Dibujar rutas y paradas
  useEffect(() => {
    if (!mapRef.current || rutas.length === 0) return;
    const map = mapRef.current;

    Object.values(routeLayersRef.current).forEach((l) => l.remove());
    routeLayersRef.current = {};
    Object.values(arrowLayersRef.current).forEach((g) => g.remove());
    arrowLayersRef.current = {};
    stopMarkersRef.current.forEach(({ marker }) => marker.remove());
    stopMarkersRef.current = [];

    rutas.forEach((ruta) => {
      const rutaColor = colorSeguro(ruta.color);
      ruta.paradas.forEach((p) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${rutaColor};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.6)"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        });
        const m = L.marker([p.latitud, p.longitud], { icon })
          .bindPopup(`
            <div style="min-width:140px;font-family:'Inter',system-ui,sans-serif">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <div style="width:10px;height:10px;border-radius:50%;background:${rutaColor}"></div>
                <b style="font-size:13px">${escHtml(p.nombre)}</b>
              </div>
              <span style="color:#94a3b8;font-size:11px">${escHtml(ruta.nombre)}</span>
            </div>`)
          .addTo(map);
        // Tocar una parada selecciona la ruta y abre el panel de detalle.
        m.on("click", () => {
          setSelectedRutaId(ruta.id);
          setSheetSnap("half");
          setVista("mapa");
          socketRef.current?.emit("subscribe_ruta", { rutaId: ruta.id });
        });
        stopMarkersRef.current.push({ rutaId: ruta.id, marker: m });
      });

      if (ruta.paradas.length < 2) return;
      const fallback: L.LatLngExpression[] = ruta.paradas.map((p) => [p.latitud, p.longitud]);
      const selInicial = selectedRutaIdRef.current;
      const mostrarInicial = selInicial !== null ? selInicial === ruta.id : (vistaRef.current === "rutas" || modoDestinoRef.current);
      const polyline = L.polyline(fallback, {
        color: rutaColor,
        weight: mostrarInicial ? 5 : 0,
        opacity: mostrarInicial ? 0.65 : 0,
        dashArray: "6 6",
        lineCap: "round",
        lineJoin: "round",
        interactive: true,
      }).addTo(map);
      routeLayersRef.current[ruta.id] = polyline;
      // Tocar la línea de ruta abre el panel de detalle sin mover el mapa.
      polyline.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        setSelectedRutaId(ruta.id);
        setSheetSnap("half");
        setVista("mapa");
        setBusqueda("");
        socketRef.current?.emit("subscribe_ruta", { rutaId: ruta.id });
      });
      fetchStreetRoute(ruta.paradas).then((coords) => {
        polyline.setLatLngs(coords);
        const sel = selectedRutaIdRef.current;
        const mostrar = sel !== null ? sel === ruta.id : (vistaRef.current === "rutas" || modoDestinoRef.current);
        polyline.setStyle(
          sel === ruta.id
            ? { opacity: 1, weight: 7, dashArray: undefined }
            : { opacity: mostrar ? 0.85 : 0, weight: mostrar ? 5 : 0, dashArray: undefined },
        );
        // Flechas de sentido a lo largo de la geometría de calle.
        arrowLayersRef.current[ruta.id]?.remove();
        const flechas = crearFlechasDireccion(coords as [number, number][], rutaColor);
        arrowLayersRef.current[ruta.id] = flechas;
        if (mostrar) flechas.addTo(map);
        setGeomVersion((v) => v + 1);
      });
    });
  }, [rutas]);

  // Al seleccionar una ruta: mostrar SOLO esa ruta y SOLO sus paradas.
  // Sin selección: se muestran todas SOLO mientras se navega en "Rutas" o se elige un destino.
  // En el mapa de inicio, sin ninguna acción del usuario, no se muestra ninguna.
  useEffect(() => {
    const map = mapRef.current;
    const mostrarTodas = vista === "rutas" || modoDestino;
    Object.entries(routeLayersRef.current).forEach(([idStr, polyline]) => {
      const id = Number(idStr);
      if (selectedRutaId !== null) {
        if (id === selectedRutaId) { polyline.setStyle({ opacity: 1, weight: 7 }); polyline.bringToFront(); }
        else polyline.setStyle({ opacity: 0, weight: 0 }); // oculta las demás rutas
      } else if (mostrarTodas) polyline.setStyle({ opacity: 0.85, weight: 5 });
      else polyline.setStyle({ opacity: 0, weight: 0 }); // mapa de inicio: sin rutas trazadas
      // Las flechas de sentido siguen la visibilidad de su ruta.
      const flechas = arrowLayersRef.current[id];
      if (flechas && map) {
        const visible = selectedRutaId === null ? mostrarTodas : id === selectedRutaId;
        if (visible && !map.hasLayer(flechas)) flechas.addTo(map);
        else if (!visible && map.hasLayer(flechas)) flechas.remove();
      }
    });
    stopMarkersRef.current.forEach(({ rutaId, marker }) => {
      const visible = selectedRutaId === null ? mostrarTodas : rutaId === selectedRutaId;
      marker.setOpacity(visible ? 1 : 0);
      // Evita que las paradas ocultas capturen clics
      const el = marker.getElement();
      if (el) el.style.pointerEvents = visible ? "auto" : "none";
    });
  }, [selectedRutaId, rutas, vista, modoDestino]);

  const updateBusMarker = useCallback(
    (busId: number, lat: number, lng: number, color = "#2558A5", placa = "", rutaId?: number) => {
      if (!mapRef.current) return;
      const bus = busesRef.current.find((b) => b.id === busId);
      // Valores de BD/usuario escapados/validados (innerHTML del popup) → anti-XSS.
      const routeName = escHtml(bus?.nombre_ruta ?? "");
      const placaSafe = escHtml(placa || "BUS");
      const novedadSafe = bus?.novedad ? escHtml(bus.novedad) : "";
      const colorSafe = colorSeguro(color);
      const vel = bus?.velocidad ?? 0;
      const ocup = ocupacionInfo(bus?.ocupacion);

      // ETA de ESTE bus a su próxima parada (si su ruta está seleccionada).
      const etaVals = Object.values(etaRef.current).filter((v) => v.placa === placa);
      const busEta = etaVals.length ? Math.min(...etaVals.map((v) => v.eta)) : null;

      const seguido = siguiendoBusRef.current === busId;

      // Si estamos siguiendo este bus, centrar el mapa en su nueva posición.
      if (seguido && mapRef.current) {
        mapRef.current.panTo([lat, lng]);
      }

      const existente = markersRef.current[busId];

      // Firma de todo lo que afecta el ícono/popup. Si no cambió y el marcador ya
      // existe, basta mover (setLatLng) sin reconstruir el DOM (evita parpadeo y CPU).
      const sig = `${placaSafe}|${color}|${bus?.ocupacion ?? ""}|${bus?.novedad ?? ""}|${seguido ? 1 : 0}|${busEta ?? ""}|${Math.round(vel)}|${routeName}`;
      if (existente && markerSigRef.current[busId] === sig) {
        existente.setLatLng([lat, lng]);
        return;
      }
      markerSigRef.current[busId] = sig;

      // ── Ícono: cuerpo con color de ruta + placa; punto de ocupación en la esquina ──
      const ocupDot = ocup ? ocup.color : "#9CA3AF"; // gris si no hay dato
      const novBadge = bus?.novedad
        ? `<span style="position:absolute;top:-6px;right:-6px;width:15px;height:15px;border-radius:50%;background:#F5B731;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4)">${SVG_ALERTA_MARCADOR}</span>`
        : "";
      // Halo pulsante cuando el pasajero sigue este bus (sensación "en vivo") +
      // anillo expansivo (ping) detrás de la píldora, estilo mockup.
      const haloRing = seguido ? "box-shadow:0 4px 14px rgba(0,0,0,.4),0 0 0 4px rgba(245,183,49,.9);" : "box-shadow:0 4px 14px rgba(0,0,0,.4);";
      const pingRing = seguido
        ? `<span class="tp-marker-ping" style="position:absolute;left:50%;top:50%;width:36px;height:36px;border-radius:50%;background:${colorSafe};z-index:-1;pointer-events:none"></span>`
        : "";
      const icon = L.divIcon({
        className: seguido ? "tp-bus-seguido" : "",
        html: `<div class="tp-marker-bob" style="display:flex;flex-direction:column;align-items:center;font-family:'Inter',system-ui,sans-serif">
            <div style="position:relative;display:flex;align-items:center;gap:4px;background:${colorSafe};color:#fff;min-height:30px;padding:4px 9px;border-radius:12px;font-size:11px;font-weight:800;white-space:nowrap;${haloRing}border:2px solid #fff;letter-spacing:.3px">
              ${pingRing}
              <span style="display:flex;line-height:0">${SVG_BUS_MARCADOR}</span>${placaSafe}
              <span style="position:absolute;bottom:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:${ocupDot};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>
              ${novBadge}
            </div>
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${colorSafe};margin-top:-1px;filter:drop-shadow(0 2px 1px rgba(0,0,0,.3))"></div>
          </div>`,
        iconSize: [96, 40], iconAnchor: [48, 40],
      });

      // ── Popup: ETA + ocupación + novedad de un vistazo ──
      const etaHtml = busEta !== null
        ? `<div style="display:flex;align-items:baseline;gap:5px;margin:6px 0 2px">
             <span style="font-size:22px;font-weight:800;color:#16a34a;line-height:1">${busEta <= 1 ? "Llegando" : "~" + Math.round(busEta)}</span>
             ${busEta > 1 ? `<span style="font-size:12px;color:#16a34a;font-weight:600">min a su próxima parada</span>` : ""}
           </div>`
        : "";
      const ocupHtml = ocup
        ? `<span style="display:inline-flex;align-items:center;gap:5px;background:${ocup.color}1f;color:${ocup.color};font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px">
             <span style="width:7px;height:7px;border-radius:50%;background:${ocup.color}"></span>${ocup.label}
           </span>`
        : "";
      const novHtml = bus?.novedad
        ? `<div style="display:flex;gap:5px;align-items:flex-start;background:rgba(245,183,49,.14);border-left:3px solid #F5B731;border-radius:6px;padding:5px 8px;margin-top:7px">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="#F5B731" style="flex-shrink:0;margin-top:1px"><path d="M12 2 1 21h22L12 2Zm0 6a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 9a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg><span style="font-size:11px;color:#9a6a00;font-weight:600;line-height:1.3">${novedadSafe}</span>
           </div>`
        : "";
      const popupContent = `
        <div style="min-width:180px;font-family:'Inter',system-ui,sans-serif">
          <div style="display:flex;align-items:center;gap:6px">
            <b style="font-size:15px;letter-spacing:0.5px">${placaSafe}</b>
            ${vel > 0 ? `<span style="color:#16a34a;font-size:11px;font-weight:600">● ${Math.round(vel)} km/h</span>` : ""}
          </div>
          <div style="color:#64748b;font-size:12px;margin-top:1px">${routeName}</div>
          ${etaHtml}
          ${ocupHtml ? `<div style="margin-top:6px">${ocupHtml}</div>` : ""}
          ${novHtml}
          <div style="color:#94a3b8;font-size:11px;margin-top:7px;border-top:1px solid #eef2f7;padding-top:5px">Tarifa: ${TARIFA_COP} COP</div>
        </div>`;

      if (existente) {
        existente.setLatLng([lat, lng]);
        existente.setIcon(icon);
        existente.setPopupContent(popupContent);
      } else {
        const marker = L.marker([lat, lng], { icon }).bindPopup(popupContent).addTo(mapRef.current!);
        if (rutaId) marker.on("click", () => {
          // Mantener la ruta seleccionada (nunca deseleccionar al tocar el bus,
          // o el marcador desaparecería) sin forzar el sheet a "half": el popup
          // nativo ya muestra el detalle del bus (ETA/ocupación/novedad) flotando
          // sobre el mapa; forzar el snap re-tapaba el mapa si el pasajero lo
          // había colapsado a propósito (p. ej. tras "Seguir este bus").
          setSelectedRutaId(rutaId);
        });
        markersRef.current[busId] = marker;
      }
    },
    []
  );

  // Sincroniza los marcadores con los buses: dibuja SOLO los de la ruta
  // seleccionada (sin ruta seleccionada no se muestra ninguno) y ELIMINA los que
  // ya no corresponden (evita "buses fantasma" en el mapa).
  useEffect(() => {
    const vivos = new Set<number>();
    if (selectedRutaId !== null) {
      buses.forEach((b) => {
        if (b.ruta_id === selectedRutaId && b.lat != null && b.lng != null && b.estado !== "inactivo") {
          vivos.add(b.id);
          updateBusMarker(b.id, b.lat, b.lng, b.color_ruta ?? "#2558A5", b.placa, b.ruta_id ?? undefined);
        }
      });
    }
    Object.keys(markersRef.current).forEach((idStr) => {
      const id = Number(idStr);
      if (!vivos.has(id)) {
        markersRef.current[id]?.remove();
        delete markersRef.current[id];
        delete markerSigRef.current[id];
        if (siguiendoBusRef.current === id) setSiguiendoBusId(null);
      }
    });
  }, [buses, updateBusMarker, selectedRutaId]);

  // Socket.IO — se conecta UNA sola vez (lee busesRef para datos actuales).
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
    const socket = apiUrl
      ? io(apiUrl, { path: "/socket.io", transports: ["websocket", "polling"] })
      : io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => setConectado(true));
    socket.on("disconnect", () => setConectado(false));
    socket.io.on("reconnect", () => setConectado(true));
    socket.on("bus:ubicacion", (data: BusLocation) => {
      // NO se invalida la lista en cada ping (sería una recarga de /api/buses por
      // cada actualización de GPS). El poll cada 10s y los eventos de novedad/
      // ocupación mantienen los metadatos al día; aquí solo movemos el marcador.
      // Solo se pinta el bus si pertenece a la ruta seleccionada.
      if (selectedRutaIdRef.current === null || data.rutaId !== selectedRutaIdRef.current) return;
      const bus = busesRef.current.find((b) => b.id === data.busId);
      updateBusMarker(data.busId, data.lat, data.lng, bus?.color_ruta ?? "#2558A5", bus?.placa ?? "BUS", data.rutaId);
    });
    socket.on("bus:novedad", (data: Novedad) => {
      // Refresca los buses para que el ⚠ aparezca/desaparezca en el marcador.
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      // Solo si es de la ruta que el pasajero está siguiendo. El servidor ya la
      // emite solo a la room de la ruta; esta guarda es defensa en profundidad.
      if (data.rutaId != null && data.rutaId !== selectedRutaIdRef.current) return;
      const timerPrevio = novedadTimersRef.current.get(data.busId);
      if (timerPrevio) clearTimeout(timerPrevio);
      novedadTimersRef.current.delete(data.busId);
      if (data.novedad) {
        // Nueva novedad de este bus: reemplaza solo SU entrada en la pila (no toca
        // las de otros buses), así 2+ novedades simultáneas se ven todas.
        setNovedades((prev) => [...prev.filter((n) => n.busId !== data.busId), data].slice(-3));
        const t = setTimeout(() => {
          setNovedades((prev) => prev.filter((n) => n.busId !== data.busId));
          novedadTimersRef.current.delete(data.busId);
        }, 15000);
        novedadTimersRef.current.set(data.busId, t);
      } else {
        // El conductor retiró la novedad: se quita su alerta de inmediato.
        setNovedades((prev) => prev.filter((n) => n.busId !== data.busId));
      }
    });
    socket.on("bus:ocupacion", () => {
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    });
    return () => {
      socket.disconnect();
      novedadTimersRef.current.forEach((t) => clearTimeout(t));
      novedadTimersRef.current.clear();
    };
  }, [updateBusMarker, queryClient]);

  const handleSelectRuta = (rutaId: number) => {
    setModoDestino(false); // elegir una ruta directo cancela "¿A dónde vas?" si estaba activo
    const next = selectedRutaId === rutaId ? null : rutaId;
    setSelectedRutaId(next);
    if (next !== null) {
      setVista("mapa");
      setBusqueda("");
      pushReciente(next);
      const ruta = rutas.find((r) => r.id === next);
      if (ruta && mapRef.current) {
        if (ruta.paradas.length >= 2)
          mapRef.current.fitBounds(L.latLngBounds(ruta.paradas.map((p) => [p.latitud, p.longitud])), { padding: [40, 40] });
        else if (ruta.paradas.length === 1)
          mapRef.current.setView([ruta.paradas[0]!.latitud, ruta.paradas[0]!.longitud], 14);
      }
      socketRef.current?.emit("subscribe_ruta", { rutaId: next });
      setSheetSnap("half");
    }
  };

  // Reencuadra el mapa sobre la ruta seleccionada (útil tras hacer zoom/pan lejos).
  const encuadrarRuta = () => {
    const ruta = rutas.find((r) => r.id === selectedRutaId);
    if (!ruta || !mapRef.current) return;
    if (ruta.paradas.length >= 2)
      mapRef.current.fitBounds(L.latLngBounds(ruta.paradas.map((p) => [p.latitud, p.longitud])), { padding: [40, 40] });
    else if (ruta.paradas.length === 1)
      mapRef.current.setView([ruta.paradas[0]!.latitud, ruta.paradas[0]!.longitud], 14);
  };

  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 310);
    return () => clearTimeout(t);
  }, [sidebarOpen]);

  // En escritorio, al abrir/cerrar la columna de detalle el mapa cambia de ancho:
  // reencuadra su tamaño para que Leaflet no quede con tiles en blanco.
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 310);
    return () => clearTimeout(t);
  }, [selectedRutaId]);

  // Modo destino: mientras está armado, el siguiente toque en el mapa fija el
  // destino, recomienda la ruta (la resalta/encuadra) y desarma el modo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !modoDestino) return;
    const container = map.getContainer();
    container.style.cursor = "crosshair";
    const onClick = (e: L.LeafletMouseEvent) => {
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      setDestino(p);
      setModoDestino(false);
      const sug = recomendarRuta(rutas, p, userPos ?? undefined);
      if (sug && selectedRutaId !== sug.ruta.id) handleSelectRuta(sug.ruta.id);
      setSheetSnap("half");
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); container.style.cursor = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoDestino, rutas, userPos, selectedRutaId]);

  // Marcador del destino elegido (bandera). Se crea/mueve/elimina según `destino`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!destino) {
      destinoMarkerRef.current?.remove();
      destinoMarkerRef.current = null;
      return;
    }
    const icon = L.divIcon({
      className: "",
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px">
          <span class="tp-destino-pulse"></span>
          <span style="position:relative;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))"><svg width="30" height="30" viewBox="0 0 24 24" fill="#F5B731" stroke="#1B3B6F" stroke-width="1.5"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.5" fill="#1B3B6F" stroke="none"/></svg></span>
        </div>`,
      iconSize: [40, 40], iconAnchor: [20, 36],
    });
    if (destinoMarkerRef.current) destinoMarkerRef.current.setLatLng([destino.lat, destino.lng]);
    else destinoMarkerRef.current = L.marker([destino.lat, destino.lng], { icon }).bindPopup("Tu destino").addTo(map);
  }, [destino]);

  // Marcador "Súbete aquí": resalta el PUNTO más cercano de la línea dibujada de
  // la ruta seleccionada al pasajero (proyección perpendicular sobre la polilínea,
  // no una parada). Solo con ubicación activa; se quita si no aplica.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const quitar = () => { miParadaMarkerRef.current?.remove(); miParadaMarkerRef.current = null; };
    const ruta = rutas.find((r) => r.id === selectedRutaId);
    if (!userPos || !ruta || ruta.paradas.length === 0) { quitar(); return; }
    const capa = routeLayersRef.current[ruta.id];
    const puntos = capa ? (capa.getLatLngs() as L.LatLng[]) : [];
    const linea: [number, number][] = puntos.length > 0
      ? puntos.map((p) => [p.lat, p.lng])
      : ruta.paradas.map((p) => [p.latitud, p.longitud]);
    const cp = puntoMasCercanoEnLinea(userPos.lat, userPos.lng, linea);
    if (!cp) { quitar(); return; }
    const dTxt = cp.distKm < 1 ? `${Math.round(cp.distKm * 1000)} m` : `${cp.distKm.toFixed(1)} km`;
    const icon = L.divIcon({
      className: "",
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px">
          <span class="animate-ping" style="position:absolute;width:30px;height:30px;border-radius:50%;background:rgba(56,161,105,.45)"></span>
          <span style="position:relative;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#38A169;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg></span>
        </div>`,
      iconSize: [34, 34], iconAnchor: [17, 17],
    });
    const popup = `<div style="font-family:'Inter',system-ui,sans-serif"><b style="font-size:13px;color:#16a34a">Súbete aquí</b><br><span style="font-size:12px">El punto más cercano de la ruta</span><br><span style="font-size:11px;color:#64748b">a ${dTxt} de ti</span></div>`;
    if (miParadaMarkerRef.current) {
      miParadaMarkerRef.current.setLatLng([cp.lat, cp.lng]).setIcon(icon).setPopupContent(popup);
    } else {
      miParadaMarkerRef.current = L.marker([cp.lat, cp.lng], { icon, zIndexOffset: 500 }).bindPopup(popup).addTo(map);
    }
  }, [selectedRutaId, userPos, rutas, geomVersion]);

  // ETA del próximo bus por parada de la ruta seleccionada (lo calcula el API Node).
  useEffect(() => {
    if (selectedRutaId === null) { setEtaPorParada({}); return; }
    let cancelado = false;
    const cargarEta = async () => {
      try {
        const res = await apiFetch(`/api/rutas/${selectedRutaId}/eta`);
        if (!res.ok || cancelado) return;
        const data = (await res.json()) as {
          paradas: { parada_id: number; eta_min: number | null; placa: string | null }[];
        };
        // Clave = POSICIÓN en el recorrido (no parada_id): una misma parada puede
        // repetirse en la ruta, y el backend ya devuelve un resultado por posición
        // en el mismo orden que `ruta.paradas`; indexar por parada_id colapsaría
        // las repeticiones y perdería el ETA de todas menos la última.
        const mapa: Record<number, { eta: number; placa: string }> = {};
        data.paradas.forEach((p, i) => {
          if (p.eta_min !== null && p.placa) mapa[i] = { eta: p.eta_min, placa: p.placa };
        });
        if (!cancelado) setEtaPorParada(mapa);
      } catch { /* ETA no disponible — se ignora */ }
    };
    cargarEta();
    const t = setInterval(cargarEta, 15000);
    return () => { cancelado = true; clearInterval(t); };
    // Solo depende de la ruta: el polling de 15s ya refresca; incluir `buses`
    // recreaba el intervalo en cada refetch (~10s) y disparaba fetches de más.
  }, [selectedRutaId]);

  // Mantener el ref sincronizado para el pan dentro de updateBusMarker.
  useEffect(() => { siguiendoBusRef.current = siguiendoBusId; }, [siguiendoBusId]);
  // Espejo de la ruta seleccionada para el handler del socket.
  useEffect(() => { selectedRutaIdRef.current = selectedRutaId; }, [selectedRutaId]);
  // Espejos de vista/modoDestino para el callback async de fetchStreetRoute.
  useEffect(() => { vistaRef.current = vista; }, [vista]);
  useEffect(() => { modoDestinoRef.current = modoDestino; }, [modoDestino]);
  // Espejo del ETA para el popup del bus (updateBusMarker no depende del estado).
  useEffect(() => { etaRef.current = etaPorParada; }, [etaPorParada]);

  // Activar/desactivar el seguimiento de un bus; al activarlo centra el mapa.
  const seguirBus = (busId: number) => {
    const next = siguiendoBusId === busId ? null : busId;
    setSiguiendoBusId(next);
    if (next !== null) {
      const b = buses.find((x) => x.id === next);
      if (b?.lat && b?.lng && mapRef.current) mapRef.current.setView([b.lat, b.lng], 16);
      // Colapsa el sheet a la barra mínima para que el mapa (con el bus recién
      // centrado) quede visible de una vez; la ruta sigue accesible tocando la
      // barrita para reexpandir (mismo gesto que ya existe para "peek").
      setSheetSnap("peek");
    }
  };
  const busSeguido = buses.find((b) => b.id === siguiendoBusId);

  // Buses activos de la ruta seleccionada, ordenados por el PRÓXIMO en llegar a mí
  // según el sentido del recorrido (distancia por delante en el circuito cerrado),
  // no por cercanía en línea recta. Un bus que ya me pasó cae al final.
  const busesRutaSel = useMemo(() => {
    const paradas = selectedRuta?.paradas ?? [];
    const miPos = userPos && paradas.length >= 2 ? posEnCircuito(userPos.lat, userPos.lng, paradas) : null;
    return (selectedRuta ? buses : [])
      .filter((b) => b.ruta_id === selectedRuta?.id && b.estado !== "inactivo" && b.lat != null && b.lng != null)
      .map((b) => {
        let distKm: number | null = null;
        if (miPos) {
          const busPos = posEnCircuito(b.lat!, b.lng!, paradas);
          distKm = busPos ? distanciaAdelanteM(busPos.s, miPos.s, miPos.L) / 1000 : distanciaKm(userPos!.lat, userPos!.lng, b.lat!, b.lng!);
        } else if (userPos) {
          distKm = distanciaKm(userPos.lat, userPos.lng, b.lat!, b.lng!);
        }
        const etaMin = distKm != null ? Math.max(0, Math.round((distKm / velEfectiva(b.velocidad)) * 60)) : null;
        return { bus: b, distKm, etaMin };
      })
      .sort((a, b) => (a.distKm ?? Infinity) - (b.distKm ?? Infinity));
  }, [selectedRuta, buses, userPos]);

  // Bus "en foco": de cuál se muestra el avance por parada (cuáles ya pasó,
  // cuánto falta para las siguientes) en el detalle de la ruta. Si el pasajero
  // sigue uno explícitamente (lista "Otros buses"), es ese; si no, el que está
  // llegando hacia ÉL (busesRutaSel ya viene ordenado así). Así la tarjeta
  // siempre refleja UN bus concreto — no una mezcla del "más rápido por parada"
  // entre varios buses de la misma ruta (confuso con varios buses circulando).
  const busFoco = busSeguido ?? busesRutaSel[0]?.bus ?? null;
  const etaPorParadaMostrado = useMemo(() => {
    if (busFoco && selectedRuta) {
      const etas = etaPorParadaDeBus(selectedRuta.paradas, busFoco);
      const resultado: Record<number, { eta: number; placa: string }> = {};
      Object.entries(etas).forEach(([i, eta]) => { resultado[Number(i)] = { eta, placa: busFoco.placa }; });
      return resultado;
    }
    return etaPorParada;
  }, [busFoco, selectedRuta, etaPorParada]);
  // El próximo bus que llega (menor ETA entre las paradas de la ruta EN FOCO).
  const proximoBus = (() => {
    const vals = Object.values(etaPorParadaMostrado);
    if (!vals.length) return null;
    return vals.reduce((a, b) => (b.eta < a.eta ? b : a));
  })();

  // ── "¿A dónde vas?": recomendación de ruta + bus más cercano ────────────────
  // Recalcula la ruta recomendada cuando cambia el destino, las rutas o el origen.
  const sugerencia = useMemo(
    () => (destino ? recomendarRuta(rutas, destino, userPos ?? undefined) : null),
    [destino, rutas, userPos],
  );
  // El bus más cercano se deriva de `buses` → se actualiza solo con cada posición
  // que llega por el socket (queda "en vivo").
  const busSugerido = useMemo(() => {
    if (!sugerencia) return null;
    const ref = sugerencia.paradaOrigen ?? sugerencia.paradaDestino;
    return busMasCercano(buses, sugerencia.ruta.id, { lat: ref.latitud, lng: ref.longitud }, sugerencia.ruta.paradas);
  }, [sugerencia, buses]);

  const armarDestino = () => {
    setModoDestino(true);
    setSelectedRutaId(null); // oculta el sheet de la ruta previa: el mapa queda libre de una vez
    setDestino(null); // por si ya había un destino marcado (p. ej. "Elegir otro destino")
  };
  const limpiarDestino = () => {
    setModoDestino(false);
    setDestino(null);
    setSelectedRutaId(null);
  };
  // Elegir un LUGAR buscado por nombre = fijar ese punto como destino (sin tener
  // que tocarlo en el mapa) y disparar la recomendación de ruta que ya existe.
  const elegirLugar = (lugar: Lugar) => {
    const p = { lat: lugar.latitud, lng: lugar.longitud };
    setModoDestino(false);
    setBusqueda("");
    setDestino(p);
    setVista("mapa");
    // Limpia la ruta seleccionada ANTES de evaluar la sugerencia: si el lugar
    // queda lejos de toda ruta (sin sugerencia), no debe quedar visible el
    // detalle de una ruta previa que ya no tiene nada que ver con este destino.
    setSelectedRutaId(null);
    const sug = recomendarRuta(rutas, p, userPos ?? undefined);
    if (sug) handleSelectRuta(sug.ruta.id);
    setSheetSnap("half");
    // Centrar el mapa en el destino elegido para que se vea de inmediato.
    if (mapRef.current) mapRef.current.setView([p.lat, p.lng], 15);
  };
  // Bloque de resultados de LUGARES en el buscador (grupo etiquetado, filas
  // compactas). Se muestra arriba de las rutas cuando la búsqueda casa un lugar.
  // Tocar uno fija el destino y dispara la recomendación (elegirLugar).
  const grupoLugares = () => {
    if (lugaresFiltrados.length === 0) return null;
    return (
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest px-1 mb-1.5" style={{ color: "var(--color-gray-text)" }}>
          Lugares
        </p>
        <div className="space-y-1.5">
          {lugaresFiltrados.map((l) => (
            <button
              key={l.id}
              onClick={() => elegirLugar(l)}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
              style={{ background: "var(--color-white)", border: "1px solid #e8edf4" }}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(37,88,165,0.10)" }}>
                <MapPinned className="w-4 h-4" style={{ color: "var(--color-blue)" }} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate" style={{ color: "var(--color-navy)" }}>{l.nombre}</span>
                {l.categoria && <span className="block text-[11px] truncate" style={{ color: "var(--color-gray-text)" }}>{l.categoria}</span>}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold flex-shrink-0" style={{ color: "var(--color-blue)" }}>
                Ver ruta <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ── Card de detalle: snap de 3 estados (peek/half/full). Bajarlo NO cierra ──
  // (solo la X cierra). Orden de menor a mayor altura para el paso de los gestos.
  const SNAPS = ["peek", "half", "full"] as const;
  const cerrarCard = () => {
    if (destino) limpiarDestino();
    setModoDestino(false); // cancela "¿A dónde vas?" si estaba a medio elegir el punto
    setSelectedRutaId(null);
    setSheetSnap("half"); // resetea para el próximo abrir
  };

  // Tecla Escape: cierra lo que esté abierto, de lo más superficial a lo más
  // profundo (ayuda → guía → menú → modo destino → panel de ruta).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showAyuda) setShowAyuda(false);
      else if (tourStep !== "off") terminarGuia();
      else if (menuAbierto) setMenuAbierto(false);
      else if (modoDestino) setModoDestino(false);
      else if (selectedRutaId !== null || destino) cerrarCard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAyuda, tourStep, menuAbierto, modoDestino, selectedRutaId, destino]);
  const onCardTouchStart = (e: React.TouchEvent) => {
    suppressClickRef.current = false;
    dragRef.current = { startY: e.touches[0]!.clientY, moved: false, lastDelta: 0 };
    setDragOffset(0);
  };
  const onCardTouchMove = (e: React.TouchEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = e.touches[0]!.clientY - d.startY;
    d.lastDelta = delta;
    if (Math.abs(delta) > 4) d.moved = true;
    // Feedback al bajar (amortiguado y con tope); subir lo resuelve la altura.
    setDragOffset(delta > 0 ? Math.min(delta * 0.6, 140) : 0);
  };
  const onCardTouchEnd = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragOffset(null);
    if (!d || !d.moved) return; // tap puro → lo maneja onClick de la barrita
    suppressClickRef.current = true; // evita que el click posterior cicle el card
    if (d.lastDelta > 50) {
      // Hacia abajo → un paso menos (full→half→peek), nunca cierra.
      setSheetSnap((s) => SNAPS[Math.max(0, SNAPS.indexOf(s) - 1)]!);
    } else if (d.lastDelta < -50) {
      // Hacia arriba → un paso más (peek→half→full).
      setSheetSnap((s) => SNAPS[Math.min(SNAPS.length - 1, SNAPS.indexOf(s) + 1)]!);
    }
  };
  const onHandleTap = () => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    // Tap en la barrita: cicla peek → half → full → peek.
    setSheetSnap((s) => s === "peek" ? "half" : s === "half" ? "full" : "peek");
  };

  // ── Centrar el mapa en la ubicación del pasajero ───────────────────────────
  // `silencioso`: para el camino automático al entrar (permiso ya concedido) —
  // NO toastea errores ni recentra de forma agresiva; solo fija la ubicación. El
  // centrado + marcador se hacen únicamente si el mapa ya montó (así es seguro
  // llamarlo apenas resuelve el permiso, aunque el mapa aún no exista).
  const locateMe = (opts?: { silencioso?: boolean }) => {
    const silencioso = opts?.silencioso ?? false;
    if (!navigator.geolocation) {
      if (!silencioso) toast({ title: "Ubicación no disponible", description: "Tu dispositivo o navegador no permite ubicarte.", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserPos({ lat: latitude, lng: longitude });
        setLocating(false);
        const map = mapRef.current;
        if (!map) return; // aún sin mapa: la posición ya quedó fijada, es suficiente
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#2558A5;border:3px solid white;box-shadow:0 0 0 6px rgba(37,88,165,.25)"></div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        });
        if (userMarkerRef.current) userMarkerRef.current.setLatLng([latitude, longitude]);
        else userMarkerRef.current = L.marker([latitude, longitude], { icon }).bindPopup("Estás aquí").addTo(map);
        // En el camino silencioso no arrebatamos la vista si el usuario ya está
        // mirando una ruta; en el manual sí centra (es lo que pidió al tocar).
        if (!silencioso || selectedRutaIdRef.current === null) map.setView([latitude, longitude], 15);
      },
      () => {
        setLocating(false);
        if (!silencioso) toast({ title: "No pudimos obtener tu ubicación", description: "Revisa que le hayas dado permiso de ubicación al navegador.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  };
  // Quita "mi ubicación": borra el marcador y limpia la posición (segundo toque del
  // FAB de ubicación = apagarla). Las funciones que la usan (recomendación, paradero
  // más cercano) vuelven solas a su modo "sin ubicación".
  const quitarUbicacion = () => {
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    setUserPos(null);
  };

  // Al entrar: consultar el estado del permiso de ubicación (Permissions API) para
  // decidir, con lógica, qué hacer sin ser agresivos:
  //  - granted → ubicar en silencio (mejores resultados de una, sin diálogo).
  //  - prompt  → dejar que se muestre la tarjeta suave (ver mostrarPromptUbicacion).
  //  - denied  → no molestar (no se puede pedir de nuevo por JS).
  // Navegador sin Permissions API → se queda en "prompt" y sale la tarjeta.
  useEffect(() => {
    if (!navigator.geolocation) { setPermisoGeo("denied"); return; }
    const permisos = navigator.permissions;
    if (!permisos?.query) { setPermisoGeo("prompt"); return; }
    let status: PermissionStatus | null = null;
    const onChange = () => { if (status) setPermisoGeo(status.state as "granted" | "prompt" | "denied"); };
    permisos.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        status = s;
        setPermisoGeo(s.state as "granted" | "prompt" | "denied");
        if (s.state === "granted") locateMe({ silencioso: true });
        s.addEventListener("change", onChange);
      })
      .catch(() => setPermisoGeo("prompt"));
    return () => { status?.removeEventListener("change", onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ¿Mostrar la tarjeta suave que invita a activar la ubicación? Solo si aún no la
  // tenemos, el usuario no la cerró antes, y el navegador realmente puede pedirla
  // (estado "prompt"). Es también el target del paso 1 de la guía interactiva.
  const mostrarPromptUbicacion =
    !userPos && !ubicacionPromptCerrado &&
    permisoGeo === "prompt" && typeof navigator !== "undefined" && !!navigator.geolocation;

  // ── Guía interactiva (spotlight) ─────────────────────────────────────────────
  const iniciarGuia = () => {
    setMenuAbierto(false);
    setVista("mapa");
    // El paso de ubicación solo aplica si la tarjeta va a poder mostrarse.
    const conUbicacion =
      permisoGeo === "prompt" && !ubicacionPromptCerrado && !userPos && !!navigator.geolocation;
    tourConUbicacionRef.current = conUbicacion;
    if (permisoGeo === "granted" && !userPos) locateMe({ silencioso: true });
    setTourStep(conUbicacion ? "ubicacion" : "destino");
  };
  const terminarGuia = () => {
    setTourStep("off");
    setGuiaTerminada(true);
    guiaArrancadaRef.current = true;
    try { localStorage.setItem("tp_guia_visto", "1"); } catch { /* ignore */ }
  };

  // Arranque automático la PRIMERA visita: espera a que carguen las rutas y a
  // conocer el estado del permiso, y entonces lanza la guía (reemplaza la bienvenida).
  useEffect(() => {
    if (guiaArrancadaRef.current || tourStep !== "off") return;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("tp_guia_visto")) { guiaArrancadaRef.current = true; setGuiaTerminada(true); return; }
    // Si falló la carga de rutas, no se puede armar la guía: se da por resuelta
    // igual (así el banner de instalar no queda esperando algo que no va a pasar).
    if (rutasError) { guiaArrancadaRef.current = true; setGuiaTerminada(true); return; }
    if (rutasLoading || rutas.length === 0 || permisoGeo === null) return; // aún no
    guiaArrancadaRef.current = true;
    iniciarGuia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutas, rutasLoading, rutasError, permisoGeo, tourStep]);

  // Avance de la guía según la acción real del usuario (o si el paso deja de aplicar).
  useEffect(() => {
    if (tourStep === "off") return;
    if (tourStep === "ubicacion") {
      // Avanza al ubicarse, o si el paso ya no aplica (cerró la tarjeta / denegó).
      if (userPos || ubicacionPromptCerrado || permisoGeo !== "prompt") setTourStep("destino");
    } else if (tourStep === "destino" && modoDestino) {
      setTourStep("elegir");
    } else if (tourStep === "elegir" && destino) {
      setTourStep("resultado");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep, userPos, ubicacionPromptCerrado, permisoGeo, modoDestino, destino]);

  // Mide el elemento a resaltar del paso actual (coordenadas de viewport). Se
  // recalcula al cambiar de paso, tras un frame/animación de entrada y al redimensionar.
  useEffect(() => {
    if (tourStep === "off") { setTargetRect(null); return; }
    const medir = () => {
      const el =
        tourStep === "ubicacion" ? ubicacionCardRef.current :
        tourStep === "destino" ? fabDestinoRef.current : null;
      setTargetRect(el ? el.getBoundingClientRect() : null);
    };
    medir();
    const raf = requestAnimationFrame(medir);
    const t = setTimeout(medir, 260); // tras la animación de entrada de la tarjeta/FAB
    window.addEventListener("resize", medir);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); window.removeEventListener("resize", medir); };
  }, [tourStep]);

  const fmtDist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

  // Panel "¿A dónde vas?": botón para elegir destino y la tarjeta de resultado.
  // Se muestra arriba de la lista, tanto en el sidebar de escritorio como en el sheet.
  const panelDestino = !destino ? (
    !modoDestino && (
      <button
        onClick={armarDestino}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl font-semibold text-sm transition-colors"
        style={{ background: "rgba(245,183,49,0.12)", color: "var(--tp-yellow)", border: "1px solid rgba(245,183,49,0.3)" }}
      >
        <Navigation className="w-4 h-4" />
        ¿A dónde vas? Elige tu destino en el mapa
      </button>
    )
  ) : sugerencia ? (
    <div className="rounded-xl border p-3.5" style={{ borderColor: sugerencia.ruta.color + "60", background: sugerencia.ruta.color + "0D" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tu mejor ruta</span>
        <button onClick={limpiarDestino} aria-label="Quitar destino" className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: sugerencia.ruta.color + "22" }}>
          <Bus style={{ color: sugerencia.ruta.color, width: 18, height: 18 }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">Toma la {sugerencia.ruta.nombre}</p>
          {sugerencia.paradaOrigen && sugerencia.dCaminaOrigenKm != null && (
            <p className="text-[11px] text-muted-foreground truncate">
              Camina ~{fmtDist(sugerencia.dCaminaOrigenKm)} hasta {sugerencia.paradaOrigen.nombre}
            </p>
          )}
        </div>
      </div>
      {busSugerido ? (
        <>
          {/* Estado (info): qué bus y en cuánto llega */}
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-2" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <Bus className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-success)" }} />
            <span className="text-xs text-foreground min-w-0 truncate">
              Bus más cercano <span className="font-mono font-bold">{busSugerido.bus.placa}</span>{" · "}
              <span className="font-bold" style={{ color: "var(--color-success)" }}>{busSugerido.etaMin <= 0 ? "llegando" : `~${busSugerido.etaMin} min`}</span>
            </span>
          </div>
          {/* Acción (CTA): botón ancho y sólido, claramente tocable */}
          <button
            onClick={() => seguirBus(busSugerido.bus.id)}
            aria-pressed={siguiendoBusId === busSugerido.bus.id}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform"
            style={siguiendoBusId === busSugerido.bus.id
              ? { background: "var(--color-navy)", color: "#fff" }
              : { background: "var(--color-gold)", color: "var(--color-navy)", boxShadow: "0 6px 16px rgba(245,183,49,0.40)" }}
          >
            {siguiendoBusId === busSugerido.bus.id
              ? <><Check className="w-5 h-5" /> Siguiendo este bus</>
              : <><LocateFixed className="w-5 h-5" /> Seguir bus</>}
          </button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground px-1">Esta ruta no tiene buses circulando ahora mismo.</p>
      )}
      {!userPos && (
        <button onClick={() => locateMe()} className="mt-2 text-[11px] font-semibold flex items-center gap-1" style={{ color: "var(--tp-sky)" }}>
          <LocateFixed className="w-3 h-3" /> Activa tu ubicación para una mejor recomendación
        </button>
      )}
    </div>
  ) : (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-foreground">Ninguna ruta pasa cerca</span>
        <button onClick={limpiarDestino} aria-label="Quitar destino" className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Ese punto queda lejos de las rutas actuales. Prueba con otro destino.</p>
      <button onClick={armarDestino} className="mt-2 text-[11px] font-semibold flex items-center gap-1" style={{ color: "var(--tp-yellow)" }}>
        <Navigation className="w-3 h-3" /> Elegir otro destino
      </button>
    </div>
  );

  // Skeleton de carga de rutas (sensación de respuesta inmediata).
  const skeletonRutas = (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="mx-3 flex items-center gap-3 p-3 rounded-xl bg-card border border-border animate-pulse">
          <div className="w-10 h-10 rounded-xl bg-muted/40 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 rounded bg-muted/40" />
            <div className="h-2.5 w-1/3 rounded bg-muted/30" />
          </div>
        </div>
      ))}
    </div>
  );

  // Estado de error de carga, con reintento.
  const errorCarga = (
    <div className="mx-3 rounded-xl border p-4 text-center" style={{ borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}>
      <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
      <p className="text-sm font-semibold text-foreground">No pudimos cargar la información</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">Revisa tu conexión e inténtalo de nuevo.</p>
      <button
        onClick={reintentarCarga}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold"
        style={{ background: "var(--tp-sky)", color: "#001018" }}
      >
        <RefreshCw className="w-4 h-4" /> Reintentar
      </button>
    </div>
  );

  // ─── SIDEBAR DESKTOP ────────────────────────────────────────────────────────
  const DesktopSidebar = () => (
    <div
      className={`hidden md:flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${sidebarOpen ? "tp-rail" : ""}`}
      style={{ width: sidebarOpen ? 300 : 0, minWidth: sidebarOpen ? 300 : 0, borderRight: "1px solid #e6ebf2", background: "#fff" }}
    >
      {/* Encabezado de marca: logo + nombre + badge EN VIVO (sin TopBar navy) */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 shrink-0" style={{ borderBottom: "1px solid #f1f5f9" }}>
        <LogoTP size={36} className="!rounded-[11px]" />
        <div className="flex-1 min-w-0 leading-tight">
          <p className="font-display font-extrabold text-[15px] truncate" style={{ color: "var(--color-navy)" }}>TransPadilla</p>
          <p className="text-[10px] font-medium truncate mt-0.5" style={{ color: "#8a97a8" }}>Riohacha</p>
        </div>
        <span
          role="status"
          aria-live="polite"
          className="notranslate flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
          style={conectado
            ? { background: "rgba(56,161,105,0.12)", color: "#2f8a56" }
            : { background: "var(--color-gray-light)", color: "var(--color-gray-text)" }}
        >
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full ${conectado ? "animate-pulse" : ""}`}
            style={{ background: conectado ? "#38A169" : "var(--color-gray-text)" }}
          />
          {conectado ? "EN VIVO" : graciaConexion ? "CONECTANDO…" : "SIN CONEXIÓN"}
        </span>
      </div>

      {/* Buscador */}
      <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: "1px solid #f1f5f9" }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#8a97a8" }} />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca tu destino o una ruta"
            className="pl-9 h-10 text-xs rounded-xl border-transparent"
            style={{ background: "#f4f7fb", color: "var(--color-navy)" }}
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* Centrar en mi ubicación */}
        <div className="mt-2.5">
          <button
            onClick={() => locateMe()}
            disabled={locating}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 mb-2"
            style={userPos
              ? { background: "rgba(56,161,105,0.10)", color: "var(--color-success)", border: "1px solid rgba(56,161,105,0.3)" }
              : { background: "rgba(123,184,213,0.18)", color: "var(--color-blue)", border: "1px solid rgba(123,184,213,0.4)" }}
          >
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
            {userPos ? "Ubicación activa · volver a centrar" : "Centrar en mi ubicación"}
          </button>
          {/* ¿A dónde vas? — recomendación por destino */}
          {panelDestino}
        </div>
      </div>

      {/* Lista de rutas */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Lugares que casan con la búsqueda (buscar por destino) */}
        {lugaresFiltrados.length > 0 && <div className="px-3 pb-1">{grupoLugares()}</div>}
        <p className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5" style={{ color: "#8a97a8" }}>
          Rutas {rutasFiltradas.length !== rutas.length && `(${rutasFiltradas.length})`}
        </p>
        {rutasError ? errorCarga
          : rutasLoading && rutas.length === 0 ? skeletonRutas
          : rutas.length === 0 ? <p className="px-4 py-8 text-xs text-muted-foreground text-center">No hay rutas configuradas todavía.</p>
          : null}
        {busqueda && rutasFiltradas.length === 0 && lugaresFiltrados.length === 0 && rutas.length > 0 && (
          <p className="px-4 py-8 text-xs text-muted-foreground text-center">Sin resultados para "{busqueda}"</p>
        )}
        <div className="px-2 space-y-0.5">
          {rutasFiltradas.map((ruta) => (
            <RouteRow
              key={ruta.id}
              ruta={ruta}
              vivos={buses.filter((b) => b.ruta_id === ruta.id && b.estado !== "inactivo").length}
              etaMin={etaAproxPorRuta[ruta.id] ?? null}
              favorito={favoritos.includes(ruta.id)}
              selected={selectedRutaId === ruta.id}
              onSelect={() => handleSelectRuta(ruta.id)}
              onToggleFavorito={() => toggleFavorito(ruta.id)}
              notificando={rutasNotificadas.includes(ruta.id)}
              onToggleNotificar={() => toggleNotificarRuta(ruta.id)}
              mostrarNotificar={pushDisponible}
            />
          ))}
        </div>
      </div>

      {/* Atención al cliente */}
      <div className="px-3 py-2.5 shrink-0 space-y-2" style={{ borderTop: "1px solid #f1f5f9" }}>
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-gray-text)" }}>Atención al cliente</p>
        <div className="flex gap-2">
          <a
            href={`https://wa.me/${WHATSAPP_NUMERO}?text=Hola%20TransPadilla%2C%20necesito%20ayuda`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "rgba(37,211,102,0.10)", color: "#16a34a", border: "1px solid rgba(37,211,102,0.25)" }}
          >
            <MessageCircle className="w-3.5 h-3.5" />WhatsApp
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "#fff", color: "var(--color-navy)", border: "1px solid #e5e7eb" }}
          >
            <Instagram className="w-3.5 h-3.5" />Instagram
          </a>
        </div>
      </div>

      {/* Footer usuario */}
      <div className="px-4 py-3 shrink-0" style={{ borderTop: "1px solid #f1f5f9", background: "#F8FAFC" }}>
        {user ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(37,88,165,0.1)", border: "1px solid rgba(37,88,165,0.2)" }}>
                <span className="text-xs font-bold" style={{ color: "var(--color-blue)" }}>{user.nombre.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--color-navy)" }}>{user.nombre}</p>
                <p className="text-[10px] capitalize" style={{ color: "var(--color-gray-text)" }}>{user.rol}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {(user.rol === "admin" || user.rol === "conductor") && (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setLocation(user.rol === "admin" ? "/admin" : "/conductor")}
                  className="h-7 px-2"
                  style={{ color: "var(--color-blue)" }}
                  title="Ir al panel"
                  aria-label="Ir al panel"
                >
                  <Shield className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                variant="ghost" size="sm"
                onClick={() => { void cerrarSesion().finally(() => window.location.reload()); }}
                className="h-7 px-2"
                style={{ color: "var(--color-gray-text)" }}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLocation("/login")}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors group hover:shadow-sm"
            style={{ background: "rgba(37,88,165,0.10)", border: "1px solid rgba(37,88,165,0.25)" }}
          >
            <div className="flex items-center gap-2">
              <LogIn className="w-4 h-4" style={{ color: "var(--color-blue)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--color-navy)" }}>Iniciar sesión</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--color-gray-text)" }} />
          </button>
        )}
        <div className="flex items-center justify-center gap-2 mt-2.5 text-[10px]" style={{ color: "var(--color-gray-text)" }}>
          <a href="/privacidad" className="hover:underline">Privacidad</a>
          <span>·</span>
          <a href="/terminos" className="hover:underline">Términos</a>
        </div>
      </div>
    </div>
  );

  // ─── COLUMNA DE DETALLE (DESKTOP) ────────────────────────────────────────────
  // Al seleccionar una ruta, su detalle (próximo bus, ocupación y buses en vivo)
  // se abre en una segunda columna junto al riel, dejando el mapa grande. Solo
  // escritorio (hidden md:flex); el móvil usa la hoja inferior.
  const DesktopDetail = () => {
    if (!selectedRuta) return null;
    const ruta = selectedRuta;
    // Bus con menor ETA (mismo que muestra el header): se usa como "próximo bus"
    // del hero y como objetivo por defecto del botón "Seguir mi bus".
    const proxBus = proximoBus ? buses.find((b) => b.placa === proximoBus.placa) : undefined;
    const ocupProx = ocupacionInfo(proxBus?.ocupacion);
    const nivelIdx: Record<string, number> = { vacio: 1, medio: 2, lleno: 3 };
    const proxNivel = proxBus?.ocupacion ? (nivelIdx[proxBus.ocupacion] ?? 0) : 0;
    const otrosBuses = busesRutaSel.filter(({ bus: b }) => b.id !== proxBus?.id);
    // Parada más cercana al pasajero (si compartió ubicación) para el subtítulo,
    // igual que el marcador "Súbete aquí" del mapa.
    const paradaCerca = userPos && ruta.paradas.length > 0
      ? ruta.paradas.reduce(
          (best, p) => {
            const d = distanciaKm(userPos.lat, userPos.lng, p.latitud, p.longitud);
            return d < best.d ? { p, d } : best;
          },
          { p: ruta.paradas[0]!, d: Infinity },
        )
      : null;
    return (
      <div
        className="tp-detail-col hidden md:flex flex-col overflow-hidden animate-in slide-in-from-left-4 fade-in duration-300"
        style={{ borderRight: "1px solid #e5e7eb", background: "#fff" }}
      >
        {/* Header: punto de color + nombre de ruta */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 shrink-0" style={{ borderBottom: "1px solid #eef2f7" }}>
          <span className="w-3 h-3 rounded shrink-0" style={{ background: ruta.color }} />
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-extrabold text-base leading-tight truncate" style={{ color: "var(--color-navy)" }}>{ruta.nombre}</h3>
            <p className="text-[11px] truncate mt-0.5" style={{ color: "#8a97a8" }}>
              {paradaCerca
                ? `${paradaCerca.p.nombre} · a ${fmtDist(paradaCerca.d)} de ti`
                : `${ruta.paradas.length} ${ruta.paradas.length === 1 ? "parada" : "paradas"}`}
            </p>
          </div>
          <button onClick={() => setSelectedRutaId(null)} aria-label="Cerrar detalle" title="Cerrar detalle" className="p-2 -mr-1.5 transition-colors hover:opacity-70" style={{ color: "var(--color-gray-text)" }}><X className="w-5 h-5" /></button>
        </div>

        {/* Cuerpo con scroll */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Hero: próximo bus (gradiente navy → azul), ocupación y velocidad */}
          {proximoBus ? (
            <div className="rounded-2xl p-4 text-white relative overflow-hidden" style={{ background: "linear-gradient(155deg, var(--color-navy), var(--color-blue))" }}>
              <div className="absolute -right-5 -top-5 w-24 h-24 rounded-full pointer-events-none" style={{ background: "rgba(245,183,49,0.16)" }} />
              <div className="flex items-center gap-1.5 mb-1.5 relative">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#38A169" }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9ff0be" }}>Próximo bus</span>
              </div>
              <div className="flex items-baseline gap-1.5 relative">
                {proximoBus.eta <= 0 ? (
                  <span className="font-display text-2xl font-black leading-none">¡Llegando!</span>
                ) : (
                  <>
                    <span className="font-display text-[46px] font-extrabold leading-none">{proximoBus.eta}</span>
                    <span className="font-display text-lg font-bold">min</span>
                  </>
                )}
                <span className="ml-auto flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.18)" }}>
                  <Bus className="w-3 h-3" />{proximoBus.placa}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-3 relative text-xs font-semibold" style={{ color: "#cfe0f6" }}>
                {ocupProx && (
                  <span className="flex items-center gap-1.5">
                    <span className="flex items-end gap-[3px]">
                      {[1, 2, 3].map((n) => (
                        <span key={n} className="w-1 rounded-sm" style={{ height: 6 + n * 4, background: proxNivel >= n ? ocupProx.color : "rgba(255,255,255,0.3)" }} />
                      ))}
                    </span>
                    Ocupación {ocupProx.label}
                  </span>
                )}
                {proxBus?.velocidad ? <span>· {Math.round(proxBus.velocidad)} km/h</span> : null}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-4 text-center text-sm font-medium" style={{ background: "var(--color-gray-light)", color: "var(--color-gray-text)" }}>
              No hay buses en esta ruta ahora mismo.
            </div>
          )}

          {/* Leyenda de ocupación */}
          <div className="flex items-center justify-between px-1 text-[10px] font-semibold" style={{ color: "var(--color-gray-text)" }}>
            {OCUPACION_ORDEN.map((nivel) => {
              const info = ocupacionInfo(nivel)!;
              return (
                <span key={nivel} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: info.color }} />{info.label}
                </span>
              );
            })}
          </div>

          {/* Otros buses en esta ruta */}
          {otrosBuses.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest px-1 mb-1.5" style={{ color: "var(--color-gray-text)" }}>Otros buses en esta ruta</p>
              <div className="space-y-1.5">
                {otrosBuses.map(({ bus: b, etaMin }) => {
                  const sig = siguiendoBusId === b.id;
                  const info = ocupacionInfo(b.ocupacion);
                  return (
                    <button
                      key={b.id}
                      onClick={() => seguirBus(b.id)}
                      className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors"
                      style={{ background: sig ? "rgba(37,88,165,0.08)" : "var(--color-gray-light)", border: sig ? "1px solid var(--color-blue)" : "1px solid transparent" }}
                    >
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: ruta.color + "22" }}>
                        <Bus className="w-4 h-4" style={{ color: ruta.color }} />
                      </span>
                      <span className="flex-1 min-w-0 text-left">
                        <span className="font-mono font-bold text-sm block" style={{ color: "var(--color-navy)" }}>{b.placa}</span>
                        <span className="text-[11px]" style={{ color: "var(--color-gray-text)" }}>
                          {etaMin != null ? (etaMin <= 0 ? "llegando" : `~${etaMin} min`) : "Activa tu ubicación"}
                        </span>
                      </span>
                      {info && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: info.color }} title={`Ocupación ${info.label}`} />}
                      <LocateFixed className="w-4 h-4 flex-shrink-0" style={{ color: sig ? "var(--color-blue)" : "#cbd5e1" }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA: seguir el próximo bus + reencuadrar la ruta */}
          <div className="pt-1 space-y-2">
            {proxBus && (
              <button
                onClick={() => seguirBus(proxBus.id)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-transform active:scale-[0.98]"
                style={siguiendoBusId === proxBus.id
                  ? { background: "rgba(37,88,165,0.08)", color: "var(--color-blue)", border: "2px solid var(--color-blue)" }
                  : { background: "var(--color-gold)", color: "#4a3300", boxShadow: "0 10px 22px rgba(245,183,49,.35)" }}
              >
                <LocateFixed className="w-4 h-4" />
                {siguiendoBusId === proxBus.id ? "Siguiendo" : "Seguir bus"}
              </button>
            )}
            <button
              onClick={encuadrarRuta}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold"
              style={{ color: "var(--color-blue)" }}
            >
              <RouteIcon className="w-3.5 h-3.5" /> Ver ruta completa
            </button>
          </div>

          {/* Paradas de la ruta (timeline con ETA por parada) */}
          {ruta.paradas.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest px-1 mb-1.5" style={{ color: "var(--color-gray-text)" }}>Paradas de la ruta</p>
              {ruta.paradas.map((p, i, arr) => {
                const eta = etaPorParadaMostrado[i];
                const first = i === 0;
                const last = i === arr.length - 1;
                return (
                  <div key={p.asignacion_id ?? i} className="relative flex items-center gap-2.5 py-1">
                    <div className="relative flex flex-col items-center self-stretch w-3">
                      <div className="w-0.5 flex-1" style={{ background: first ? "transparent" : ruta.color + "55" }} />
                      <div className="w-2 h-2 rounded-full ring-2 ring-white flex-shrink-0" style={{ background: ruta.color }} />
                      <div className="w-0.5 flex-1" style={{ background: last ? "transparent" : ruta.color + "55" }} />
                    </div>
                    <span className="flex-1 truncate text-xs" style={{ color: "var(--color-navy)" }}>{p.nombre}</span>
                    {(first || last) && <span className="text-[9px] font-bold flex-shrink-0" style={{ color: "#94a3b8" }}>{first ? "INICIO" : "FIN"}</span>}
                    {eta && (
                      <span className="text-[10px] font-bold text-green-600 whitespace-nowrap flex-shrink-0 px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)" }}>
                        {eta.eta <= 0 ? "llegando" : `~${eta.eta} min`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── MOBILE BOTTOM SHEET ─────────────────────────────────────────────────────
  // Card de detalle deslizable: aparece SOLO al seleccionar una ruta/bus o al pedir
  // una recomendación de destino. Se arrastra desde la barrita (swipe ↓ cierra/colapsa,
  // ↑ expande, tap alterna); el contenido scrollea aparte. Mapa limpio el resto del tiempo.
  // z-[1002]: al expandirse debe quedar SOBRE la capa ambiente z-[1001] (buscador,
  // banner instalar, bienvenida, píldora) para que su cabecera con la X (más abajo)
  // no quede tapada por el buscador y sea fácil de cerrar. Sigue por debajo de los
  // modales (ayuda/banner full) y no solapa el bottom-nav (está anclada en bottom-[72px]).
  const MobileSheet = () => {
    if (!selectedRuta && !destino) return null;
    return (
      <div
        className="md:hidden fixed left-0 right-0 bottom-[72px] z-[1002] rounded-t-3xl overflow-hidden animate-in slide-in-from-bottom-8 fade-in duration-300 ease-out"
        style={{
          background: "var(--color-white)",
          boxShadow: "0 -8px 28px rgba(27,59,111,0.18)",
          transform: dragOffset !== null ? `translateY(${Math.max(0, dragOffset)}px)` : undefined,
          transition: dragOffset !== null ? "none" : "transform 0.25s ease",
        }}
      >
        {/* Barrita de arrastre: swipe ↓ minimiza (peek) · swipe ↑ expande · tap cicla. NO cierra. */}
        <div
          onTouchStart={onCardTouchStart}
          onTouchMove={onCardTouchMove}
          onTouchEnd={onCardTouchEnd}
          onClick={onHandleTap}
          className="flex flex-col items-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing touch-none select-none"
          role="button"
          aria-label={sheetSnap === "peek" ? "Subir el detalle" : "Bajar o minimizar el detalle"}
        >
          <div className="h-1.5 w-11 rounded-full" style={{ background: "rgba(27,59,111,0.30)" }} />
          <ChevronUp
            className="w-4 h-4 -mb-1 transition-transform duration-200"
            style={{ color: "rgba(27,59,111,0.35)", transform: sheetSnap === "full" ? "rotate(180deg)" : "none" }}
          />
        </div>
        {/* Contenido (altura según snap: peek=barra, half, full) */}
        <div
          className="px-4 pb-6"
          style={{
            maxHeight: sheetSnap === "peek" ? "78px" : sheetSnap === "half" ? "54vh" : "84vh",
            overflowY: sheetSnap === "peek" ? "hidden" : "auto",
            transition: "max-height 0.25s ease",
            touchAction: "pan-y",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* ¿A dónde vas? — recomendación por destino */}
          {panelDestino && <div className="mb-3 mt-1">{panelDestino}</div>}
        {/* Ruta seleccionada — diseño Stitch (Detalle de Ruta) */}
        {selectedRuta && (() => {
          const rutaNumero = rutas.findIndex((r) => r.id === selectedRuta.id) + 1;
          const paradas = selectedRuta.paradas;
          const conEta = paradas
            .map((_p, i) => ({ i, eta: etaPorParadaMostrado[i]?.eta }))
            .filter((x): x is { i: number; eta: number } => x.eta != null);
          const nextI = conEta.length ? conEta.sort((a, b) => a.eta - b.eta)[0]!.i : -1;
          const proxEtaMin = nextI >= 0 ? etaPorParadaMostrado[nextI]?.eta : undefined;
          const progresoPct = nextI >= 0 && paradas.length > 1 ? (nextI / (paradas.length - 1)) * 100 : 0;
          const hayDemora = busesRutaSel.some((x) => x.bus.estado === "demora");
          const busesConNovedad = busesRutaSel.filter((x) => x.bus.novedad);
          const proxBus = proximoBus ? buses.find((b) => b.placa === proximoBus.placa) : undefined;
          const ocupProx = ocupacionInfo(proxBus?.ocupacion);
          // Parada más cercana a mi ubicación (para sugerir dónde subir).
          const miParada = userPos
            ? paradas.reduce(
                (best, p, i) => {
                  const d = distanciaKm(userPos.lat, userPos.lng, p.latitud, p.longitud);
                  return best.i < 0 || d < best.d ? { i, d } : best;
                },
                { i: -1, d: Infinity },
              )
            : { i: -1, d: Infinity };
          const miParadaI = miParada.i;
          return (
          <div className="-mx-4 -mt-1">
            {/* Header navy (sticky). En peek: tócalo para expandir; el panel no se cierra. */}
            <div
              className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
              style={{ background: "var(--color-navy)", cursor: sheetSnap === "peek" ? "pointer" : "default" }}
              onClick={sheetSnap === "peek" ? () => setSheetSnap("half") : undefined}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-xl shrink-0 shadow-md" style={{ background: selectedRuta.color, color: "#fff" }}>{rutaNumero}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-lg text-white leading-tight truncate">{selectedRuta.nombre}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: selectedRuta.color }} />
                  {proximoBus && proxEtaMin != null ? (
                    <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: "var(--color-gold)" }}>
                      <Bus className="w-3 h-3" /> Bus <span className="font-mono">{proximoBus.placa}</span> · {proxEtaMin <= 0 ? "llegando" : `${proxEtaMin} min`}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">Ruta</span>
                  )}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); cerrarCard(); }} aria-label="Cerrar" className="text-white/80 p-2.5 -mr-1.5"><X className="w-5 h-5" /></button>
            </div>
            {/* Estado en vivo + barra de progreso con bus dorado */}
            <div className="px-4 py-3 bg-white border-b" style={{ borderColor: "#eef2f7" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: "var(--color-gray-text)" }}>
                  <Radio className="w-3.5 h-3.5" /> Estado en vivo
                  {proxBus?.actualizado && <span className="font-medium normal-case tracking-normal opacity-80">· {tiempoRelativo(proxBus.actualizado)}</span>}
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={hayDemora ? { background: "rgba(229,62,62,0.12)", color: "var(--color-danger)" } : { background: "rgba(123,184,213,0.25)", color: "var(--color-navy)" }}>{hayDemora ? "CON DEMORA" : "A TIEMPO"}</span>
              </div>
              {proximoBus ? (
                <>
                  <div className="relative h-1.5 rounded-full" style={{ background: "#e6e9ef" }}>
                    <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: progresoPct + "%", background: "var(--color-navy)" }} />
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center shadow-md" style={{ left: progresoPct + "%", background: "var(--color-gold)", border: "2px solid #fff" }}>
                      <Bus className="w-3.5 h-3.5" style={{ color: "var(--color-navy)" }} />
                    </div>
                  </div>
                  <div className="flex justify-between mt-1.5 text-[11px]" style={{ color: "var(--color-gray-text)" }}>
                    <span className="truncate max-w-[45%]">{paradas[0]?.nombre}</span>
                    <span className="truncate max-w-[45%] text-right">{paradas[paradas.length - 1]?.nombre}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm" style={{ color: "var(--color-gray-text)" }}>No hay buses en esta ruta ahora mismo.</p>
              )}
            </div>
            {/* Banner de novedad — una línea por cada bus con novedad activa */}
            {busesConNovedad.length > 0 && (
              <div className="px-4 py-2.5 flex flex-col gap-1.5" style={{ background: "rgba(245,183,49,0.14)" }}>
                {busesConNovedad.map(({ bus: b }) => (
                  <div key={b.id} className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--color-gold)" }} />
                    <span className="text-xs font-semibold leading-snug" style={{ color: "#9a6a00" }}>
                      {busesConNovedad.length > 1 ? `Bus ${b.placa}: ` : ""}{b.novedad}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Lista de paraderos — línea de tiempo estilo metro (línea vertical del
                color de la ruta uniendo las paradas). Cada parada es tocable: centra
                el mapa en ella y minimiza la hoja para verla. */}
            {paradas.length > 0 && (
              <div className="flex items-center justify-between px-4 pt-3 pb-1.5 bg-white">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-gray-text)" }}>Paraderos del recorrido</span>
                <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: "var(--color-blue)" }}><MapPin className="w-3 h-3" /> Toca para verla</span>
              </div>
            )}
            {paradas.length > 0 && (
              <ul className="bg-white">
                {paradas.map((p, i) => {
                  const eta = etaPorParadaMostrado[i]?.eta;
                  const past = nextI >= 0 && i < nextI;
                  const current = i === nextI;
                  const cercana = i === miParadaI; // la más cercana a mi ubicación
                  const isFirst = i === 0;
                  const isLast = i === paradas.length - 1;
                  const irAParada = () => {
                    if (mapRef.current) mapRef.current.setView([p.latitud, p.longitud], 16);
                    setSheetSnap("peek");
                  };
                  // Color de los segmentos de línea: gris si el tramo ya lo pasó el
                  // bus, color de la ruta si está por venir.
                  const lineaArriba = i <= nextI && nextI >= 0 ? "#d7dde6" : `${selectedRuta.color}80`;
                  const lineaAbajo = i < nextI && nextI >= 0 ? "#d7dde6" : `${selectedRuta.color}80`;
                  return (
                    <li
                      key={p.asignacion_id ?? i}
                      onClick={irAParada}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); irAParada(); } }}
                      aria-label={`Ver ${p.nombre} en el mapa`}
                      className="relative flex items-stretch gap-3 pr-4 border-b cursor-pointer transition-colors active:bg-black/[0.03]"
                      style={{ borderColor: "#f1f4f8", background: current ? "rgba(123,184,213,0.10)" : cercana ? "rgba(56,161,105,0.07)" : "transparent", opacity: past ? 0.55 : 1 }}
                    >
                      {current && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: "var(--color-gold)" }} />}
                      {cercana && !current && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: "var(--color-success)" }} />}
                      {/* Rail: los segmentos de línea (flex-1) y el punto viven en su
                          propia columna, así la línea SIEMPRE queda centrada bajo el
                          círculo y jamás se solapa con el texto o el ETA. */}
                      <div className="flex flex-col items-center flex-shrink-0 ml-4" style={{ width: 28 }} aria-hidden="true">
                        <span className="w-[3px] flex-1 rounded-full" style={{ background: lineaArriba, visibility: isFirst ? "hidden" : "visible" }} />
                        <span className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm" style={current ? { background: "rgba(37,88,165,0.12)", boxShadow: `0 0 0 3px ${selectedRuta.color}22` } : cercana ? { background: "rgba(56,161,105,0.15)" } : { background: "#eef2f7" }}>
                          {past ? <Check className="w-4 h-4" style={{ color: "var(--color-gray-text)" }} /> : current ? <MapPin className="w-4 h-4" style={{ color: "var(--color-blue)" }} /> : cercana ? <LocateFixed className="w-4 h-4" style={{ color: "var(--color-success)" }} /> : <span className="w-2 h-2 rounded-full" style={{ background: selectedRuta.color, opacity: 0.7 }} />}
                        </span>
                        <span className="w-[3px] flex-1 rounded-full" style={{ background: lineaAbajo, visibility: isLast ? "hidden" : "visible" }} />
                      </div>
                      {/* Contenido: nombre + sublabel a la izquierda, ETA a la derecha */}
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2 py-3">
                        <div className="min-w-0">
                          <span className={"truncate block text-sm " + (current || cercana ? "font-bold" : "font-medium")} style={{ color: "var(--color-navy)" }}>{p.nombre}</span>
                          {cercana ? (
                            <span className="text-[10px] font-bold" style={{ color: "var(--color-success)" }}>Súbete aquí · a {miParada.d < 1 ? `${Math.round(miParada.d * 1000)} m` : `${miParada.d.toFixed(1)} km`} de ti</span>
                          ) : current ? (
                            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-blue)" }}>Próxima parada del bus</span>
                          ) : null}
                        </div>
                        {eta != null && (
                          <div className="text-right shrink-0">
                            <div className={"font-display " + (current ? "text-3xl" : "text-lg") + " font-extrabold tabular-nums leading-none"} style={{ color: current ? "var(--color-gold)" : "var(--color-gray-text)" }}>{eta <= 0 ? "•" : eta}</div>
                            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--color-gray-text)" }}>{eta <= 0 ? "llegando" : "min"}</div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {/* Botón Seguir este bus */}
            <div className="px-4 pt-3 pb-1 bg-white">
              {proxBus ? (
                <button onClick={() => seguirBus(proxBus.id)} className="w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" style={siguiendoBusId === proxBus.id ? { background: "var(--color-sky)", color: "var(--color-navy)" } : { background: "var(--color-blue)", color: "#fff" }}>
                  <LocateFixed className="w-5 h-5" /> {siguiendoBusId === proxBus.id ? "Siguiendo" : "Seguir bus"}
                  {ocupProx && <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.22)" }}>{ocupProx.label}</span>}
                </button>
              ) : (
                <div className="w-full h-12 rounded-2xl font-semibold flex items-center justify-center" style={{ background: "#eef2f7", color: "var(--color-gray-text)" }}>Sin buses ahora</div>
              )}
            </div>
            {/* Otros buses de la ruta (además del próximo) — para verlos/seguir cualquiera */}
            {(() => {
              const otros = busesRutaSel.filter((x) => x.bus.id !== proxBus?.id);
              if (otros.length === 0) return null;
              return (
                <div className="px-4 pb-3 pt-2 bg-white">
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--color-gray-text)" }}>Otros buses en esta ruta</p>
                  <div className="space-y-2">
                    {otros.map(({ bus: b, distKm, etaMin }) => {
                      const sig = siguiendoBusId === b.id;
                      return (
                        <button key={b.id} onClick={() => seguirBus(b.id)} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 active:scale-[0.98] transition-transform" style={{ background: sig ? "rgba(123,184,213,0.18)" : "var(--color-gray-light)", border: sig ? "1px solid var(--color-sky)" : "1px solid transparent" }}>
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: selectedRuta.color + "22" }}><Bus className="w-4 h-4" style={{ color: selectedRuta.color }} /></span>
                          <span className="flex-1 min-w-0 text-left">
                            <span className="font-mono font-bold text-sm block" style={{ color: "var(--color-navy)" }}>{b.placa}</span>
                            <span className="text-[11px]" style={{ color: "var(--color-gray-text)" }}>
                              {distKm != null ? `${distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`} · ${etaMin === 0 ? "llegando" : `~${etaMin} min`}` : "Activa tu ubicación para el tiempo"}
                            </span>
                          </span>
                          {ocupacionInfo(b.ocupacion) && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ocupacionInfo(b.ocupacion)!.color }} title="Ocupación" />}
                          <LocateFixed className="w-4 h-4 flex-shrink-0" style={{ color: sig ? "var(--color-sky)" : "#cbd5e1" }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          );
        })()}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#fff" }}>

      {/* ── Fila sidebar + mapa (escritorio sin TopBar: el sidebar lleva la marca) ── */}
      <div className="flex flex-1 overflow-hidden">
      {DesktopSidebar()}
      {DesktopDetail()}

      {/* Mapa */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" data-testid="map-container" role="application" aria-label="Mapa de Riohacha con los buses en tiempo real" />

        {/* Pastilla flotante "N buses en vivo" (solo escritorio) */}
        <div
          className="hidden md:flex absolute top-4 left-4 z-[900] items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: "#fff", boxShadow: "0 8px 20px rgba(15,30,60,0.14)" }}
        >
          {/* Sin ruta elegida el mapa no muestra buses, así que en vez de un conteo
              (que contradiría lo visible) se guía al usuario a elegir una ruta. */}
          <span
            className={`w-2 h-2 rounded-full ${activeBuses.length > 0 && selectedRutaId !== null ? "animate-pulse" : ""}`}
            style={{ background: activeBuses.length > 0 ? "var(--color-success)" : "var(--color-gray-text)" }}
          />
          <span className="text-xs font-bold" style={{ color: "var(--color-navy)" }}>
            {selectedRutaId === null
              ? (activeBuses.length > 0 ? "Elige una ruta" : "Sin buses ahora")
              : activeBuses.length > 0
                ? `${activeBuses.length} bus${activeBuses.length > 1 ? "es" : ""} en vivo`
                : "Sin buses ahora"}
          </span>
        </div>

        {/* FAB "ver ruta completa" — solo con una ruta seleccionada, encima del de ubicación.
            z-index por encima del bottom nav (z-[1002]) y el offset suma el "notch" del
            gesto (safe-area-inset-bottom): así, en CUALQUIER navegador/dispositivo, queda
            claramente arriba de la barra "Inicio/Rutas/…" y no se ve tapado por ella. */}
        {vista === "mapa" && selectedRutaId !== null && (
          <button
            onClick={encuadrarRuta}
            className="absolute right-4 z-[1010] flex items-center justify-center w-12 h-12 rounded-full active:scale-95 transition-transform bottom-[calc(148px_+_env(safe-area-inset-bottom,0px))] md:bottom-[72px]"
            style={{ background: "var(--color-white)", color: "var(--color-navy)", border: "3px solid #fff", boxShadow: "0 6px 16px rgba(15,30,60,0.25)" }}
            aria-label="Ver la ruta completa en el mapa"
            title="Ver ruta completa"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        )}

        {/* FAB ubicación (sky) — abajo-derecha. Toca para ubicarte; toca de nuevo para
            quitar tu ubicación (toggle). Cuando está activa, el borde se pone navy. */}
        {vista === "mapa" && (
          <button
            onClick={() => (userPos ? quitarUbicacion() : locateMe())}
            disabled={locating}
            className="absolute right-4 z-[1010] flex items-center justify-center w-12 h-12 rounded-full active:scale-95 transition-transform disabled:opacity-60 bottom-[calc(88px_+_env(safe-area-inset-bottom,0px))] md:bottom-4"
            style={{ background: "var(--color-sky)", color: "var(--color-navy)", border: userPos ? "3px solid var(--color-navy)" : "3px solid #fff", boxShadow: "0 6px 16px rgba(15,30,60,0.25)" }}
            aria-label={userPos ? "Quitar mi ubicación" : "Centrar en mi ubicación"}
            aria-pressed={!!userPos}
          >
            {locating ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
          </button>
        )}

        {/* Botón "¿A dónde vas?" (gold) — abajo-izquierda. Píldora CON texto: su
            función (recomendar ruta por destino) no se descubre si es solo un ícono. */}
        {vista === "mapa" && (
          <button
            ref={fabDestinoRef}
            onClick={() => (modoDestino || destino ? limpiarDestino() : armarDestino())}
            className="absolute left-4 z-[1010] flex items-center gap-2 h-12 pl-4 pr-5 rounded-full active:scale-95 transition-transform bottom-[calc(88px_+_env(safe-area-inset-bottom,0px))] md:bottom-4"
            style={{ background: "var(--color-gold)", color: "var(--color-navy)", border: modoDestino || destino ? "3px solid var(--color-navy)" : "3px solid #fff", boxShadow: "0 6px 16px rgba(15,30,60,0.25)" }}
            aria-label={modoDestino || destino ? "Cancelar destino" : "Elegir mi destino en el mapa"}
            aria-pressed={modoDestino || !!destino}
          >
            <Navigation className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-extrabold whitespace-nowrap">¿A dónde vas?</span>
          </button>
        )}


        {/* En escritorio, la columna de detalle tiene su propia ✕; no hace falta
            un botón "Ver todas" flotante (el móvil cierra desde la hoja inferior). */}

        {/* Backdrop para cerrar el menú ☰ al tocar fuera */}
        {menuAbierto && (
          <div className="md:hidden fixed inset-0 z-[1000]" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
        )}

        {/* ── Header móvil (estilo Stitch): tarjeta navy flotante + búsqueda + menú ── */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-[1001] px-3 pt-3 flex flex-col gap-2">
          {/* Tarjeta navy */}
          <div className="rounded-2xl px-3 py-2.5" style={{ background: "linear-gradient(135deg, #24487e 0%, #1B3B6F 60%, #16335f 100%)", boxShadow: "0 8px 24px rgba(15,30,60,0.35)" }}>
            <div className="flex items-center justify-between">
              <button onClick={() => setMenuAbierto((o) => !o)} className="p-1 rounded-full text-white active:scale-90 transition-transform" aria-label="Menú">
                {menuAbierto ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <span className="font-display font-extrabold text-xl tracking-wide text-white">TRANSPADILLA</span>
              <button onClick={() => setLocation(user ? (user.rol === "admin" ? "/admin" : "/conductor") : "/login")} className="p-1 rounded-full text-white active:scale-90 transition-transform" aria-label={user ? "Mi panel" : "Cuenta"}>
                <User className="w-6 h-6" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1 px-1">
              <span className="text-[11px] font-medium text-white/80">Moviendo la Ciudad</span>
              <span role="status" aria-live="polite" className="notranslate flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full" style={conectado ? { background: "rgba(245,183,49,0.2)", color: "var(--color-gold)" } : { background: "rgba(255,255,255,0.15)", color: "#fff" }}>
                <span aria-hidden="true" className="tp-livedot" style={{ width: 6, height: 6, background: conectado ? "var(--color-gold)" : "#fcd34d", animationPlayState: conectado ? "running" : "paused" }} />
                {conectado ? "EN VIVO" : graciaConexion ? "CONECTANDO…" : "SIN CONEXIÓN"}
              </span>
            </div>
          </div>
          {/* Búsqueda (tarjeta blanca) */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "var(--color-blue)" }} />
            <input
              ref={busquedaRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onFocus={() => setVista("rutas")}
              placeholder={placeholderBusqueda}
              aria-label="Busca tu destino o una ruta"
              className="w-full h-12 pl-12 pr-10 text-sm rounded-2xl outline-none border-0 shadow-md"
              style={{ background: "#fff", color: "var(--color-navy)" }}
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5" style={{ color: "var(--color-gray-text)" }} aria-label="Limpiar búsqueda">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Menú ☰ desplegable con acciones */}
          {menuAbierto && (
            <div className="rounded-2xl bg-white shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" onClick={() => setMenuAbierto(false)}>
              <a href={`https://wa.me/${WHATSAPP_NUMERO}?text=Hola%20TransPadilla%2C%20necesito%20ayuda`} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-100" style={{ color: "var(--color-navy)" }}>
                <MessageCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#25D366" }} /><span className="font-semibold text-sm">Atención al cliente (WhatsApp)</span>
              </a>
              <button onClick={() => setShowAyuda(true)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-t border-gray-100 active:bg-gray-100" style={{ color: "var(--color-navy)" }}>
                <HelpCircle className="w-5 h-5 flex-shrink-0" style={{ color: "var(--color-sky)" }} /><span className="font-semibold text-sm">¿Cómo funciona?</span>
              </button>
              {user && (
                <>
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(37,88,165,0.12)" }}>
                      <span className="text-sm font-bold" style={{ color: "var(--color-navy)" }}>{user.nombre.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--color-navy)" }}>{user.nombre}</p>
                      <p className="text-xs capitalize" style={{ color: "var(--color-gray-text)" }}>{user.rol}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { void cerrarSesion().finally(() => window.location.reload()); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-gray-100 active:bg-red-50 text-left"
                  >
                    <LogOut className="w-5 h-5 flex-shrink-0" style={{ color: "#ef4444" }} />
                    <span className="font-semibold text-sm" style={{ color: "#ef4444" }}>Cerrar sesión</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Banner "Instalar app" (PWA) — tarjeta de marca sobre el bottom nav, descartable */}
        {mostrarInstall && (
          <div
            className="md:hidden fixed left-3 right-3 bottom-[84px] z-[1001] rounded-2xl p-3.5 animate-in fade-in slide-in-from-bottom-4 duration-300 tp-gradient"
            style={{ border: "1px solid rgba(245,183,49,0.45)", boxShadow: "var(--shadow-xl)" }}
          >
            <button
              onClick={descartarInstall}
              aria-label="Ahora no"
              className="absolute top-2.5 right-2.5 p-1 rounded-lg text-white/55 hover:text-white active:scale-90 transition"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 pr-6">
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white shadow-md">
                <LogoTP size={34} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-display text-[15px] font-extrabold text-white leading-tight">Instala TransPadilla</p>
                <p className="text-[11.5px] text-white/75 leading-snug mt-0.5">
                  Ábrela como app, más rápido y sin ocupar espacio.
                </p>
              </div>
            </div>

            {esIOS && !installEvt ? (
              /* iOS: no hay diálogo nativo → instrucción visual */
              <div
                className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-white"
                style={{ background: "rgba(255,255,255,0.12)" }}
              >
                <span className="opacity-90">Toca</span>
                <Share className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-gold)" }} />
                <span className="opacity-90">y luego</span>
                <SquarePlus className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-gold)" }} />
                <span className="opacity-90 truncate">"Agregar a inicio"</span>
              </div>
            ) : (
              <button
                onClick={instalarApp}
                className="mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold active:scale-[0.98] transition-transform"
                style={{ background: "var(--color-gold)", color: "var(--color-navy)" }}
              >
                <Download className="w-4 h-4" /> Instalar la app
              </button>
            )}
          </div>
        )}

        {/* ── Bottom nav (estilo Stitch): Inicio / Rutas / Favoritos / Perfil ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[1002] flex justify-around items-center px-2 pt-2 pb-3 bg-white" style={{ boxShadow: "0 -4px 16px rgba(15,30,60,0.10)" }} aria-label="Navegación principal">
          {([
            { id: "mapa", label: "Inicio", icon: <MapIcon className="w-5 h-5" /> },
            { id: "rutas", label: "Rutas", icon: <RouteIcon className="w-5 h-5" /> },
            { id: "favoritos", label: "Favoritos", icon: <Star className="w-5 h-5" /> },
            { id: "paraderos", label: "Paraderos", icon: <MapPin className="w-5 h-5" /> },
          ] as const).map((t) => {
            const activo = vista === t.id;
            const badge = t.id === "favoritos" && favoritos.length > 0 ? favoritos.length : null;
            return (
              <button key={t.id} onClick={() => { setModoDestino(false); if (t.id === "mapa") cerrarCard(); setVista(activo ? "mapa" : t.id); }} aria-current={activo ? "page" : undefined} aria-label={badge !== null ? `${t.label} (${badge})` : t.label} className="relative flex flex-col items-center gap-1 rounded-2xl px-4 py-2 active:scale-90 transition-all" style={activo ? { background: "var(--color-gold)", color: "var(--color-navy)", boxShadow: "0 4px 12px rgba(245,183,49,0.4)" } : { color: "var(--color-blue)" }}>
                <span className="relative">
                  {t.icon}
                  {badge !== null && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white" style={{ background: "var(--color-danger)", border: "1.5px solid #fff" }}>
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-bold">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Guía interactiva (spotlight): sombrea todo menos el elemento a pulsar y
            avanza sola con la acción del usuario. Reemplaza la vieja bienvenida. */}
        {tourStep !== "off" && (() => {
          const conUbic = tourConUbicacionRef.current;
          const total = conUbic ? 4 : 3;
          const idxMap: Record<PasoGuia, number> = conUbic
            ? { off: 0, ubicacion: 1, destino: 2, elegir: 3, resultado: 4 }
            : { off: 0, ubicacion: 0, destino: 1, elegir: 2, resultado: 3 };
          const paso = idxMap[tourStep];
          const copia: Record<Exclude<PasoGuia, "off">, { titulo: string; texto: React.ReactNode }> = {
            ubicacion: { titulo: "Activa tu ubicación", texto: <>Toca <b>Activar</b> para ver qué bus te sirve y cuánto falta para que llegue a ti.</> },
            destino: { titulo: "Dinos a dónde vas", texto: <>Pulsa <b>¿A dónde vas?</b> para elegir tu destino.</> },
            elegir: { titulo: "Marca tu destino", texto: <>Toca en el mapa el lugar a donde quieres llegar (o búscalo por nombre).</> },
            resultado: { titulo: "¡Listo!", texto: <>Aquí tienes la ruta que debes tomar y el bus más cercano, con los minutos que faltan.</> },
          };
          const { titulo, texto } = copia[tourStep as Exclude<PasoGuia, "off">];
          const winH = typeof window !== "undefined" ? window.innerHeight : 800;
          const winW = typeof window !== "undefined" ? window.innerWidth : 400;
          // Solo hay hueco recortado en los pasos con un target medido.
          const conHueco = !!targetRect && (tourStep === "ubicacion" || tourStep === "destino");
          const pad = 8;
          const hx = conHueco ? Math.max(0, targetRect!.left - pad) : 0;
          const hy = conHueco ? Math.max(0, targetRect!.top - pad) : 0;
          const hw = conHueco ? Math.min(winW - hx, targetRect!.width + pad * 2) : 0;
          const hh = conHueco ? Math.min(winH - hy, targetRect!.height + pad * 2) : 0;
          const velo = "rgba(9,14,26,0.72)";
          // Posición de la burbuja según el paso. En "destino" el target (el FAB
          // "¿A dónde vas?") está pegado a la izquierda, no al centro: la burbuja se
          // alinea con él (left:16, igual que el left-4 del botón) en vez de quedar
          // centrada en medio de la pantalla, lejos de lo que se está señalando.
          const bocadillo: React.CSSProperties =
            tourStep === "ubicacion"
              ? { top: (conHueco ? hy + hh : 150) + 14 }
              : tourStep === "destino"
              ? { bottom: (conHueco ? winH - hy : 150) + 14, left: 16, right: "auto" as const }
              : tourStep === "elegir"
              ? { bottom: 150 }
              : { top: 132 };
          const bocadilloClase =
            tourStep === "destino"
              ? "fixed z-[1092] w-[calc(100vw-32px)] max-w-[300px] animate-in fade-in slide-in-from-bottom-2 duration-300"
              : "fixed z-[1092] left-1/2 -translate-x-1/2 w-[calc(100vw-32px)] max-w-[340px] animate-in fade-in slide-in-from-bottom-2 duration-300";
          return (
            <>
              {conHueco ? (
                <>
                  {/* 4 rectángulos oscuros alrededor del hueco; capturan el toque para
                      que solo se pueda pulsar el elemento resaltado (queda en el hueco). */}
                  <div className="fixed left-0 z-[1090]" style={{ top: 0, width: "100vw", height: hy, background: velo }} onClick={(e) => e.stopPropagation()} />
                  <div className="fixed left-0 z-[1090]" style={{ top: hy + hh, width: "100vw", height: Math.max(0, winH - (hy + hh)), background: velo }} onClick={(e) => e.stopPropagation()} />
                  <div className="fixed z-[1090]" style={{ left: 0, top: hy, width: hx, height: hh, background: velo }} onClick={(e) => e.stopPropagation()} />
                  <div className="fixed z-[1090]" style={{ left: hx + hw, top: hy, width: Math.max(0, winW - (hx + hw)), height: hh, background: velo }} onClick={(e) => e.stopPropagation()} />
                  {/* Anillo dorado sobre el hueco (no captura toques). */}
                  <div
                    className="fixed z-[1091] pointer-events-none rounded-2xl"
                    style={{ left: hx, top: hy, width: hw, height: hh, border: "2px solid var(--color-gold)", boxShadow: "0 0 0 3px rgba(245,183,49,0.25), 0 0 22px rgba(245,183,49,0.55)" }}
                  />
                </>
              ) : null}

              {/* Burbuja guía */}
              <div className={bocadilloClase} style={bocadillo}>
                <div className="rounded-2xl shadow-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, var(--color-navy), var(--color-blue))", border: "1px solid rgba(245,183,49,0.4)" }}>
                  <div className="flex items-start gap-2.5 px-4 pt-3.5 pb-2">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(245,183,49,0.22)" }}>
                      {tourStep === "ubicacion" ? <LocateFixed className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
                        : tourStep === "resultado" ? <Bus className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
                        : <Navigation className="w-4 h-4" style={{ color: "var(--color-gold)" }} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider leading-none mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>Paso {paso} de {total}</p>
                      <p className="text-sm font-extrabold text-white leading-tight">{titulo}</p>
                    </div>
                  </div>
                  <p className="px-4 text-xs text-white/85 leading-snug">{texto}</p>
                  <div className="px-4 pt-2.5 pb-3 flex items-center justify-between gap-2">
                    <button onClick={terminarGuia} className="text-[11px] font-semibold text-white/60 hover:text-white transition-colors">
                      {tourStep === "resultado" ? "Cerrar" : "Saltar guía"}
                    </button>
                    {tourStep === "resultado" && (
                      <button
                        onClick={terminarGuia}
                        className="text-xs font-bold rounded-xl px-4 py-2 active:scale-[0.98] transition-transform"
                        style={{ background: "var(--color-gold)", color: "var(--color-navy)" }}
                      >
                        ¡Entendido!
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* Anuncio a pantalla completa (banner del admin) */}
        {showAnuncio && banner && (
          <div
            onClick={() => setBannerCerrado(true)}
            className="fixed inset-0 z-[1200] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.9)" }}
          >
            <img
              src={banner.imagen_url}
              alt={banner.titulo ?? "Anuncio"}
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setBannerCerrado(true)}
              aria-label="Cerrar anuncio"
              className="absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border border-white/30 shadow-lg"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Panel de ayuda "¿Cómo funciona?" */}
        {showAyuda && (
          <div onClick={() => setShowAyuda(false)} className="absolute inset-0 z-[1003] flex items-end md:items-center justify-center p-3 md:p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto w-full max-w-md rounded-2xl border shadow-2xl flex flex-col max-h-[85vh]"
              style={{ background: "rgba(12,18,32,0.98)", borderColor: "rgba(123,184,213,0.3)", backdropFilter: "blur(16px)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <LogoTP size={32} />
                  <div>
                    <p className="text-sm font-black tracking-wide text-white">¿Cómo funciona?</p>
                    <p className="text-[11px]" style={{ color: "var(--tp-yellow)" }}>Guía rápida de TransPadilla</p>
                  </div>
                </div>
                <button onClick={() => setShowAyuda(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10" aria-label="Cerrar ayuda">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Contenido */}
              <div className="overflow-y-auto px-5 py-4 space-y-4">
                {/* Funciones */}
                <div className="space-y-3">
                  {[
                    { icon: <Navigation className="w-4 h-4" />, t: "¿A dónde vas?", d: "Pulsa “Elegir destino” y toca tu destino en el mapa: te decimos qué ruta tomar y cuál es el bus más cercano de esa ruta." },
                    { icon: <Search className="w-4 h-4" />, t: "Buscar ruta", d: "Escribe el nombre de tu ruta para encontrarla al instante." },
                    { icon: <MapPin className="w-4 h-4" />, t: "Seleccionar ruta", d: "Toca una ruta para resaltarla en el mapa y ver sus paradas y buses. Aparecen primero tus favoritas y las que tienen buses en vivo." },
                    { icon: <LocateFixed className="w-4 h-4" />, t: "Mi ubicación", d: "Centra el mapa en ti. Así los buses se ordenan del más cercano y ves cuánto tardan en llegar a ti." },
                    { icon: <Clock className="w-4 h-4" />, t: "Tiempo de llegada", d: "Minutos estimados que falta para que el bus llegue a tu ubicación o parada." },
                    { icon: <LocateFixed className="w-4 h-4" />, t: "Seguir un bus", d: "Elige un bus y el mapa lo seguirá automáticamente mientras se mueve." },
                    { icon: <Star className="w-4 h-4" />, t: "Favoritos", d: "Toca la estrella en cualquier ruta para guardarla; siempre aparece arriba en la lista." },
                    { icon: <MessageCircle className="w-4 h-4" />, t: "Atención al cliente", d: "Escríbenos por WhatsApp ante cualquier duda o reclamo." },
                  ].map((f, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(37,88,165,0.2)", color: "var(--tp-sky)" }}>
                        {f.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{f.t}</p>
                        <p className="text-xs text-white/65 leading-snug">{f.d}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Leyenda de ocupación */}
                <div className="pt-3 border-t border-white/10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">Ocupación del bus</p>
                  <div className="flex flex-wrap gap-3 text-xs text-white/80">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e" }} /> Disponible</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#F5C200" }} /> Medio</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444" }} /> Lleno</span>
                  </div>
                  <p className="text-[11px] text-white/45 mt-2 leading-snug">El borde de color de cada bus en el mapa indica su ocupación.</p>
                </div>

                {/* Leyenda de estado / alertas */}
                <div className="pt-3 border-t border-white/10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-2">Estado del bus</p>
                  <div className="space-y-1.5 text-xs text-white/80">
                    <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded-full font-bold bg-green-500/20 text-green-400 text-[10px]">activo</span> En recorrido, normal.</span>
                    <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 text-[10px]">demora</span> Con una novedad reportada por el conductor.</span>
                    <span className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" style={{ color: "var(--tp-yellow)" }} /> Alerta: aviso del conductor (accidente, desvío, reparación…).</span>
                  </div>
                </div>

                <p className="text-[11px] text-white/40 text-center pt-1">
                  Tarifa: <span style={{ color: "var(--tp-yellow)" }} className="font-bold">{TARIFA_COP} COP</span> · No necesitas cuenta para ver los buses.
                </p>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-white/10 shrink-0 space-y-2">
                <button
                  onClick={() => { setShowAyuda(false); iniciarGuia(); }}
                  className="w-full h-11 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
                  style={{ background: "rgba(245,183,49,0.14)", color: "var(--tp-yellow)", border: "1px solid rgba(245,183,49,0.35)" }}
                >
                  <Navigation className="w-4 h-4" /> Ver guía paso a paso
                </button>
                <Button onClick={() => setShowAyuda(false)} className="w-full h-11 rounded-xl font-bold text-white border-0" style={{ background: "linear-gradient(135deg, #2558A5 0%, var(--tp-sky) 100%)" }}>
                  Entendido
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Alertas de novedad — se apilan: cada bus con novedad tiene su propia tarjeta. */}
        {novedades.length > 0 && (
          <div className="absolute top-16 left-3 right-3 md:top-4 md:left-1/2 md:-translate-x-1/2 md:right-auto md:max-w-lg z-[1002] flex flex-col gap-2">
            {novedades.map((n) => (
              <div
                key={n.busId}
                role="alert"
                className="rounded-2xl px-4 py-3.5 flex items-start gap-3 animate-in slide-in-from-top-4 fade-in duration-300"
                style={{ background: "var(--tp-yellow)", color: "#1a1300", boxShadow: "0 12px 40px rgba(245,183,49,0.55)" }}
              >
                <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5 animate-pulse" style={{ color: "#1a1300" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black uppercase tracking-wide">
                    Alerta {n.placa ? `— Bus ${n.placa}` : "de un conductor"}
                  </p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: "#2a2000" }}>{n.novedad}</p>
                </div>
                <button
                  onClick={() => {
                    const t = novedadTimersRef.current.get(n.busId);
                    if (t) clearTimeout(t);
                    novedadTimersRef.current.delete(n.busId);
                    setNovedades((prev) => prev.filter((x) => x.busId !== n.busId));
                  }}
                  className="flex-shrink-0 -mr-1 -mt-0.5 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/10 active:bg-black/20"
                  style={{ color: "#1a1300" }}
                  aria-label="Cerrar alerta"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Chips de estado del MAPA — se ocultan si hay un menú/panel abierto (Rutas,
            Favoritos, Paraderos o ☰) para no solaparse con su encabezado. */}
        {vista === "mapa" && !menuAbierto && (
        <div className="absolute top-[140px] md:top-3 left-1/2 -translate-x-1/2 z-[1001] flex flex-col items-center gap-2 pointer-events-none">
          {rutasLoading && rutas.length === 0 && (
            <div className="pointer-events-none flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Cargando el mapa…</span>
            </div>
          )}
          {activeBuses.length === 0 && !rutasLoading && rutas.length > 0 && selectedRutaId === null && !modoDestino && (
            <div className="pointer-events-none flex items-center gap-2 rounded-full shadow-md px-4 py-2" style={{ background: "var(--color-white)", border: "1px solid #e8edf4" }}>
              <Bus className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-gold)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--color-navy)" }}>Sin buses activos · <span style={{ color: "var(--color-gray-text)" }}>5:00 am – 10:00 pm</span></span>
            </div>
          )}
          {/* Tarjeta suave: invita a activar la ubicación al entrar (mejores
              resultados). Solo sale si el navegador puede pedirla y no la cerró.
              Tiene prioridad sobre el chip "elige una ruta" para no apilarlos. */}
          {mostrarPromptUbicacion && (
            <div
              ref={ubicacionCardRef}
              className="pointer-events-auto relative rounded-2xl shadow-xl overflow-hidden w-[calc(100vw-32px)] max-w-[300px] animate-in fade-in slide-in-from-top-2 duration-300"
              style={{ background: "linear-gradient(135deg, var(--color-navy), var(--color-blue))" }}
            >
              <button
                onClick={dismissPromptUbicacion}
                aria-label="Ahora no"
                title="Ahora no"
                className="absolute top-1.5 right-1.5 p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors z-10"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-start gap-2.5 pl-3 pr-7 pt-2.5 pb-2">
                <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(245,183,49,0.22)" }}>
                  <LocateFixed className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
                </span>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wider leading-none mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>Ubicación</p>
                  <p className="text-xs font-semibold text-white leading-snug">Actívala para ver qué bus te sirve y cuánto falta para que llegue a ti.</p>
                </div>
              </div>
              <div className="px-3 pb-2.5 flex items-center gap-2">
                <button
                  onClick={() => locateMe()}
                  disabled={locating}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                  style={{ background: "var(--color-gold)", color: "var(--color-navy)" }}
                >
                  {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                  {locating ? "Activando…" : "Activar"}
                </button>
                <button
                  onClick={dismissPromptUbicacion}
                  className="text-xs font-semibold px-3 py-2 rounded-xl text-white/70 hover:text-white transition-colors"
                >
                  Ahora no
                </button>
              </div>
            </div>
          )}
          {modoDestino && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl px-3.5 py-2 shadow-xl" style={{ background: "var(--tp-yellow)", color: "#1a1300" }}>
              <Navigation className="w-4 h-4" />
              <span className="text-xs font-bold">Toca tu destino en el mapa</span>
              <button onClick={() => setModoDestino(false)} className="ml-1 p-1 hover:opacity-70" aria-label="Cancelar">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {busSeguido && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg" style={{ background: "var(--tp-sky)", color: "#001018" }}>
              <LocateFixed className="w-4 h-4 animate-pulse" />
              <span className="text-xs font-bold">Siguiendo {busSeguido.placa}</span>
              <button onClick={() => setSiguiendoBusId(null)} className="ml-1 p-1 hover:opacity-70" aria-label="Dejar de seguir">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        )}

        {/* Indicador de conexión desktop ocultado: el badge EN VIVO está en el TopBar */}

        {/* FAB de soporte por WhatsApp — SOLO escritorio (en móvil está en la fila de acciones) */}
        <a
          href={`https://wa.me/${WHATSAPP_NUMERO}?text=Hola%20TransPadilla%2C%20necesito%20informaci%C3%B3n%20sobre%20el%20servicio`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex absolute md:bottom-4 md:right-3 z-[1000] items-center justify-center w-12 h-12 rounded-full shadow-xl transition-transform active:scale-95 hover:scale-105"
          style={{ background: "#25D366", color: "white" }}
          title="Atención al cliente por WhatsApp"
          aria-label="Atención al cliente por WhatsApp"
        >
          <MessageCircle className="w-6 h-6" />
        </a>

        {/* Watermark */}
        <div className="hidden md:block absolute bottom-4 right-52 z-[999] text-[10px] text-muted-foreground/25 font-black tracking-widest select-none">
          TRANSPADILLA
        </div>
      </div>
      </div>{/* cierre flex flex-1 overflow-hidden (fila sidebar+mapa) */}

      {/* Drawer del mapa (tema claro, solo en la vista "Mapa en vivo") */}
      {vista === "mapa" && <div className="tp-light">{MobileSheet()}</div>}

      {/* ── Vistas de los chips: Favoritos / Rutas / Paraderos ── */}
      {vista !== "mapa" && (
        <div
          key={vista}
          className="tp-light md:hidden fixed left-0 right-0 bottom-0 z-[1000] overflow-y-auto animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out"
          style={{ top: 140, bottom: 72, background: "linear-gradient(180deg,#eaf1fb 0%, #f6f9fc 55%)", touchAction: "pan-y", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
        >
          <div className="tp-stagger px-4 pt-4 pb-6 space-y-4">
            {(() => {
              // Encabezado de sección reutilizable (título grande + contador + subtítulo).
              const Header = (titulo: string, subtitulo: string, n?: number) => (
                <div className="pt-1 pb-1 mb-1">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-7 rounded-full flex-shrink-0" style={{ background: "var(--color-gold)" }} />
                    <h2 className="font-display text-2xl font-extrabold leading-tight" style={{ color: "var(--color-navy)" }}>{titulo}</h2>
                    {n != null && (
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full text-white shadow-sm" style={{ background: "var(--color-blue)" }}>{n}</span>
                    )}
                  </div>
                  <p className="text-sm mt-1 ml-4" style={{ color: "var(--color-gray-text)" }}>{subtitulo}</p>
                </div>
              );

              // Tarjeta de ruta estilo "transit" (compartida con el sidebar de escritorio).
              const RouteCard = (r: typeof rutas[number]) => (
                <RutaCard
                  key={r.id}
                  ruta={r}
                  vivos={rutaBusesVivos(r.id)}
                  etaMin={etaAproxPorRuta[r.id] ?? null}
                  demora={buses.some((b) => b.ruta_id === r.id && b.estado === "demora")}
                  favorito={favoritos.includes(r.id)}
                  onSelect={() => handleSelectRuta(r.id)}
                  onToggleFavorito={() => toggleFavorito(r.id)}
                  notificando={rutasNotificadas.includes(r.id)}
                  onToggleNotificar={() => toggleNotificarRuta(r.id)}
                  mostrarNotificar={pushDisponible}
                />
              );

              // Subencabezado compacto (ícono + título) para secciones dentro de una vista.
              const SubHeader = (icon: React.ReactNode, titulo: string) => (
                <div className="flex items-center gap-1.5 px-1 pt-1 pb-2" style={{ color: "var(--color-gray-text)" }}>
                  {icon}
                  <span className="text-[11px] font-bold uppercase tracking-widest">{titulo}</span>
                </div>
              );

              // Estado vacío / informativo elegante (ícono en círculo + CTA grande).
              const Estado = (icon: React.ReactNode, titulo: string, desc: string, cta?: React.ReactNode) => (
                <div className="text-center pt-16 px-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(123,184,213,0.18)" }}>
                    {icon}
                  </div>
                  <p className="text-lg font-bold" style={{ color: "var(--color-navy)" }}>{titulo}</p>
                  <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--color-gray-text)" }}>{desc}</p>
                  {cta && <div className="mt-5">{cta}</div>}
                </div>
              );

              if (vista === "favoritos") {
                if (rutasLoading && rutas.length === 0) return skeletonRutas;
                const favs = rutas.filter((r) => favoritos.includes(r.id));
                return favs.length === 0
                  ? Estado(
                      <Star className="w-8 h-8" style={{ color: "var(--color-sky)" }} />,
                      "Aún no tienes favoritas",
                      "Toca la estrella en cualquier ruta y aparecerá aquí para acceso rápido.",
                      <button onClick={() => { setVista("rutas"); setBusqueda(""); }} className="inline-flex items-center gap-2 px-6 h-12 rounded-2xl text-white font-bold shadow-sm active:scale-95 transition-transform" style={{ background: "var(--color-blue)" }}>
                        <RouteIcon className="w-4 h-4" /> Ver todas las rutas
                      </button>,
                    )
                  : <>{Header("Mis favoritos", "Tus rutas guardadas para acceso rápido", favs.length)}{favs.map(RouteCard)}</>;
              }

              if (vista === "rutas") {
                if (rutasError) return errorCarga;
                if (rutasLoading && rutas.length === 0) return skeletonRutas;
                // Sin coincidencias NI en rutas NI en lugares: estado vacío útil.
                if (rutasFiltradas.length === 0 && lugaresFiltrados.length === 0) {
                  if (!busqueda) {
                    return Estado(
                      <Search className="w-8 h-8" style={{ color: "var(--color-sky)" }} />,
                      "No hay rutas",
                      "Aún no hay rutas configuradas.",
                    );
                  }
                  return Estado(
                    <Navigation className="w-8 h-8" style={{ color: "var(--color-sky)" }} />,
                    "Sin resultados",
                    `No encontramos "${busqueda}" entre las rutas ni los lugares. Prueba con un nombre de lugar (hospital, mercado, terminal…) o marca tu destino en el mapa.`,
                    <button
                      onClick={() => { setBusqueda(""); setVista("mapa"); armarDestino(); }}
                      className="inline-flex items-center gap-2 px-6 h-12 rounded-2xl text-white font-bold shadow-sm active:scale-95 transition-transform"
                      style={{ background: "var(--color-blue)" }}
                    >
                      <Navigation className="w-4 h-4" /> ¿A dónde vas?
                    </button>,
                  );
                }
                // Rutas vistas recientemente (solo sin búsqueda activa).
                const recientesRutas = busqueda
                  ? []
                  : recientes.map((id) => rutas.find((r) => r.id === id)).filter((r): r is typeof rutas[number] => !!r);
                // Lista agrupada por estado (con/sin buses ahora) para leerla de un vistazo.
                const enServicio = rutasFiltradas.filter((r) => rutaTieneVivos(r.id));
                const sinBuses = rutasFiltradas.filter((r) => !rutaTieneVivos(r.id));
                const seccion = (dot: React.ReactNode, titulo: string, n: number, badgeBg: string) => (
                  <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
                    {dot}
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-gray-text)" }}>{titulo}</span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: badgeBg }}>{n}</span>
                  </div>
                );
                return (
                  <>
                    {/* CTA "¿A dónde vas?" — el camino para quien no sabe qué ruta tomar */}
                    {!busqueda && (
                      <button
                        onClick={() => { setVista("mapa"); armarDestino(); }}
                        className="w-full rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                        style={{ background: "linear-gradient(135deg, #2558A5 0%, #1B3B6F 70%)", boxShadow: "0 8px 20px rgba(27,59,111,0.20)" }}
                      >
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(245,183,49,0.20)" }}>
                          <Navigation className="w-5 h-5" style={{ color: "var(--color-gold)" }} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-display font-extrabold text-white text-[15px]">¿A dónde vas?</span>
                          <span className="block text-[12px] text-white/75 leading-snug">Elige tu destino y te decimos qué bus tomar</span>
                        </span>
                        <ChevronRight className="w-5 h-5 flex-shrink-0 text-white/70" />
                      </button>
                    )}
                    {/* Lugares que casan con la búsqueda (buscar por destino) */}
                    {grupoLugares()}
                    {recientesRutas.length > 0 && (
                      <>
                        {SubHeader(<History className="w-4 h-4" />, "Última ruta")}
                        {recientesRutas.map(RouteCard)}
                        <div className="h-1" />
                      </>
                    )}
                    {/* Agrupadas por estado: primero las que sirven ahora */}
                    {enServicio.length > 0 && (
                      <>
                        {seccion(<span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--color-success)" }} />, "En servicio ahora", enServicio.length, "var(--color-success)")}
                        {enServicio.map(RouteCard)}
                      </>
                    )}
                    {sinBuses.length > 0 && (
                      <>
                        {seccion(<span className="w-2 h-2 rounded-full" style={{ background: "#c3ccd9" }} />, "Sin buses ahora", sinBuses.length, "#9aa7b8")}
                        {sinBuses.map(RouteCard)}
                      </>
                    )}
                  </>
                );
              }

              // Paraderos cercanos (usa la ubicación del pasajero)
              const paraderos = (() => {
                const m = new Map<number, { parada: typeof rutas[number]["paradas"][number]; rutas: typeof rutas }>();
                for (const r of rutas) for (const p of r.paradas) {
                  const e = m.get(p.id);
                  if (e) e.rutas.push(r); else m.set(p.id, { parada: p, rutas: [r] });
                }
                const arr = [...m.values()].map((x) => ({
                  ...x,
                  dist: userPos ? distanciaKm(userPos.lat, userPos.lng, x.parada.latitud, x.parada.longitud) : null,
                }));
                if (userPos) arr.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
                return arr;
              })();

              if (rutasLoading && rutas.length === 0) return skeletonRutas;
              if (!userPos) {
                return Estado(
                  <MapPin className="w-8 h-8" style={{ color: "var(--color-sky)" }} />,
                  "Activa tu ubicación",
                  "Para mostrarte los paraderos más cercanos a ti, ordenados por distancia.",
                  <button onClick={() => locateMe()} disabled={locating} className="inline-flex items-center gap-2 px-6 h-12 rounded-2xl text-white font-bold shadow-sm active:scale-95 transition-transform disabled:opacity-60" style={{ background: "var(--color-blue)" }}>
                    {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />} Usar mi ubicación
                  </button>,
                );
              }
              return <>{Header("Paraderos cercanos", "Ordenados por distancia a ti", paraderos.length)}{paraderos.slice(0, 30).map((x) => (
                <ParaderoCard
                  key={x.parada.id}
                  parada={x.parada}
                  rutas={x.rutas}
                  dist={x.dist}
                  onSelect={() => { if (x.rutas[0]) handleSelectRuta(x.rutas[0].id); }}
                />
              ))}</>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
