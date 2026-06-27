import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useGetRutas, useGetBuses, getGetBusesQueryKey } from "@workspace/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { clearAuth, getUser } from "@/lib/auth";
import {
  Bus, MapPin, LogOut, Radio, AlertTriangle, X,
  Search, Clock, LogIn, Shield, ChevronRight, ChevronUp,
  Menu, MessageCircle, Instagram, LocateFixed, Loader2, Star, HelpCircle, Navigation, RefreshCw,
  User, Map as MapIcon, Route as RouteIcon, Check, History, Download, Smartphone, Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoTP } from "@/components/LogoTP";
import { io, type Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchStreetRoute } from "@/lib/routing";
import { useLeafletMap } from "@/hooks/use-leaflet-map";
import { WHATSAPP_NUMERO, INSTAGRAM_URL, TARIFA_COP } from "@/lib/constants";
import type { BusLocation, Novedad } from "@/lib/types";
import { tiempoRelativo } from "@/lib/format";
import { distanciaKm, velEfectiva } from "@/lib/geo";
import { recomendarRuta, busMasCercano } from "@/lib/sugerencia";

/** Escapa HTML para inyectar texto (de la BD/usuario) en los popups de Leaflet
 *  por innerHTML sin riesgo de XSS almacenado (p. ej. la novedad del conductor). */
const escHtml = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Evento `beforeinstallprompt` (no está en los tipos estándar del DOM). */
interface BeforeInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Pasajero() {
  const [, setLocation] = useLocation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useLeafletMap(mapContainerRef, { zoom: 13 });
  const markersRef = useRef<Record<number, L.Marker>>({});
  const routeLayersRef = useRef<Record<number, L.Polyline>>({});
  const stopMarkersRef = useRef<Array<{ rutaId: number; marker: L.Marker }>>([]);
  const socketRef = useRef<Socket | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const destinoMarkerRef = useRef<L.Marker | null>(null);
  const miParadaMarkerRef = useRef<L.Marker | null>(null);
  const queryClient = useQueryClient();

  const [selectedRutaId, setSelectedRutaId] = useState<number | null>(null);
  const [etaPorParada, setEtaPorParada] = useState<Record<number, { eta: number; placa: string }>>({});
  // "Seguir mi bus": el mapa hace pan automático al bus elegido cuando se mueve.
  const [siguiendoBusId, setSiguiendoBusId] = useState<number | null>(null);
  const siguiendoBusRef = useRef<number | null>(null);
  // Espejo del ETA por parada para leerlo dentro de updateBusMarker (useCallback []).
  const etaRef = useRef<Record<number, { eta: number; placa: string }>>({});
  const [novedad, setNovedad] = useState<Novedad | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Card de detalle inferior (móvil): minimizado (barra), medio o expandido.
  // Bajarlo NO lo cierra (solo la X); queda en "peek" dejando ver el mapa.
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("half");
  // Vista activa (bottom nav móvil): mapa | favoritos | rutas | paraderos.
  const [vista, setVista] = useState<"mapa" | "favoritos" | "rutas" | "paraderos">("mapa");
  // Menú ☰ del header (acciones: destino, atención, info).
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Estado real de la conexión en vivo (Socket.IO). Empieza false; "connect" lo pone true.
  const [conectado, setConectado] = useState(false);
  const [locating, setLocating] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
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
  // Rutas vistas recientemente (se recuerdan en localStorage). La última abierta
  // va primera; se deduplican y se conservan máximo 4 para acceso rápido.
  const [recientes, setRecientes] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("tp_recientes") ?? "[]") as number[]; }
    catch { return []; }
  });
  const pushReciente = (id: number) => {
    setRecientes((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 4);
      try { localStorage.setItem("tp_recientes", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  // Guía de bienvenida: se muestra solo la primera vez (se recuerda en localStorage).
  const [showWelcome, setShowWelcome] = useState(
    () => typeof localStorage !== "undefined" && !localStorage.getItem("tp_welcome_visto"),
  );
  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem("tp_welcome_visto", "1"); } catch { /* ignore */ }
    // Tras cerrar la guía, deja la lista de rutas abierta y a la vista (móvil).
    setVista("rutas");
  };
  // Panel de ayuda "¿Cómo funciona?" — accesible en cualquier momento con el botón ?.
  const [showAyuda, setShowAyuda] = useState(false);
  // Banner "Instalar app" (PWA). El navegador dispara beforeinstallprompt cuando
  // la app es instalable; lo guardamos para ofrecer la instalación a un toque.
  const [installEvt, setInstallEvt] = useState<BeforeInstallPrompt | null>(null);
  const [installOculto, setInstallOculto] = useState(
    () => typeof localStorage !== "undefined" && !!localStorage.getItem("tp_install_dismissed"),
  );
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPrompt); };
    const onInstalled = () => { setInstallEvt(null); setInstallOculto(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const yaInstalada = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
  const mostrarInstall = !!installEvt && !installOculto && !yaInstalada;
  const instalarApp = async () => {
    if (!installEvt) return;
    await installEvt.prompt();
    try { await installEvt.userChoice; } catch { /* el usuario cerró el diálogo */ }
    setInstallEvt(null); // el evento es de un solo uso
  };
  const descartarInstall = () => {
    setInstallOculto(true);
    try { localStorage.setItem("tp_install_dismissed", "1"); } catch { /* ignore */ }
  };
  // Arrastre del card de detalle (swipe). dragOffset = px en vivo durante el gesto.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; moved: boolean; lastDelta: number } | null>(null);
  const suppressClickRef = useRef(false);
  const user = getUser();

  const {
    data: rutas = [],
    isLoading: rutasLoading,
    isError: rutasError,
    refetch: refetchRutas,
  } = useGetRutas({ query: { queryKey: ["rutas"], refetchInterval: 15000 } });
  const { data: buses = [], refetch: refetchBuses } = useGetBuses({
    query: { queryKey: getGetBusesQueryKey(), refetchInterval: 10000 },
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
  const selectedRuta = useMemo(() => rutas.find((r) => r.id === selectedRutaId), [rutas, selectedRutaId]);
  const activeBuses = useMemo(() => buses.filter((b) => b.estado === "activo"), [buses]);
  const demorasBuses = useMemo(() => buses.filter((b) => b.estado === "demora"), [buses]);

  // El mapa lo crea y destruye useLeafletMap (ver declaración de mapRef arriba).

  // Dibujar rutas y paradas
  useEffect(() => {
    if (!mapRef.current || rutas.length === 0) return;
    const map = mapRef.current;

    Object.values(routeLayersRef.current).forEach((l) => l.remove());
    routeLayersRef.current = {};
    stopMarkersRef.current.forEach(({ marker }) => marker.remove());
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
      const polyline = L.polyline(fallback, { color: ruta.color, weight: 5, opacity: 0.65, dashArray: "6 6", lineCap: "round", lineJoin: "round", interactive: true }).addTo(map);
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
        polyline.setStyle({ opacity: 0.85, dashArray: undefined });
      });
    });
  }, [rutas]);

  // Al seleccionar una ruta: mostrar SOLO esa ruta y SOLO sus paradas.
  // Sin selección: se muestran todas.
  useEffect(() => {
    Object.entries(routeLayersRef.current).forEach(([idStr, polyline]) => {
      const id = Number(idStr);
      if (selectedRutaId === null) polyline.setStyle({ opacity: 0.85, weight: 5 });
      else if (id === selectedRutaId) { polyline.setStyle({ opacity: 1, weight: 7 }); polyline.bringToFront(); }
      else polyline.setStyle({ opacity: 0, weight: 0 }); // oculta las demás rutas
    });
    stopMarkersRef.current.forEach(({ rutaId, marker }) => {
      const visible = selectedRutaId === null || rutaId === selectedRutaId;
      marker.setOpacity(visible ? 1 : 0);
      // Evita que las paradas ocultas capturen clics
      const el = marker.getElement();
      if (el) el.style.pointerEvents = visible ? "auto" : "none";
    });
  }, [selectedRutaId, rutas]);

  const updateBusMarker = useCallback(
    (busId: number, lat: number, lng: number, color = "#2558A5", placa = "", rutaId?: number) => {
      if (!mapRef.current) return;
      const bus = busesRef.current.find((b) => b.id === busId);
      // Valores de BD/usuario escapados (innerHTML del popup) → anti-XSS.
      const routeName = escHtml(bus?.nombre_ruta ?? "");
      const placaSafe = escHtml(placa || "BUS");
      const novedadSafe = bus?.novedad ? escHtml(bus.novedad) : "";
      const vel = bus?.velocidad ?? 0;
      // Colores de OCUPACIÓN (paleta del brief): disponible/medio/lleno.
      const ocupMap: Record<string, { label: string; color: string }> = {
        vacio: { label: "Disponible", color: "#38A169" },
        medio: { label: "Medio lleno", color: "#F5B731" },
        lleno: { label: "Lleno", color: "#E53E3E" },
      };
      const ocup = bus?.ocupacion ? ocupMap[bus.ocupacion] : undefined;

      // ETA de ESTE bus a su próxima parada (si su ruta está seleccionada).
      const etaVals = Object.values(etaRef.current).filter((v) => v.placa === placa);
      const busEta = etaVals.length ? Math.min(...etaVals.map((v) => v.eta)) : null;

      // ── Ícono: cuerpo con color de ruta + placa; punto de ocupación en la esquina ──
      const ocupDot = ocup ? ocup.color : "#9CA3AF"; // gris si no hay dato
      // Íconos SVG inline (sin emoji, regla del UI skill).
      const svgAlerta = `<svg width="9" height="9" viewBox="0 0 24 24" fill="#1B3B6F"><path d="M12 2 1 21h22L12 2Zm0 6a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 9a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg>`;
      const svgBus = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><path d="M6 2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H9v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 4v5h12V6H6Zm2 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm8 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>`;
      const novBadge = bus?.novedad
        ? `<span style="position:absolute;top:-6px;right:-6px;width:15px;height:15px;border-radius:50%;background:#F5B731;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4)">${svgAlerta}</span>`
        : "";
      // Halo pulsante cuando el pasajero sigue este bus (sensación "en vivo").
      const seguido = siguiendoBusRef.current === busId;
      const haloRing = seguido ? "box-shadow:0 4px 14px rgba(0,0,0,.4),0 0 0 4px rgba(245,183,49,.9),0 0 0 9px rgba(245,183,49,.35);" : "box-shadow:0 4px 14px rgba(0,0,0,.4);";
      const icon = L.divIcon({
        className: seguido ? "tp-bus-seguido" : "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;font-family:'Inter',system-ui,sans-serif">
            <div style="position:relative;display:flex;align-items:center;gap:4px;background:${color};color:#fff;min-height:30px;padding:4px 9px;border-radius:12px;font-size:11px;font-weight:800;white-space:nowrap;${haloRing}border:2px solid #fff;letter-spacing:.3px">
              <span style="display:flex;line-height:0">${svgBus}</span>${placaSafe}
              <span style="position:absolute;bottom:-4px;right:-4px;width:12px;height:12px;border-radius:50%;background:${ocupDot};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>
              ${novBadge}
            </div>
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${color};margin-top:-1px;filter:drop-shadow(0 2px 1px rgba(0,0,0,.3))"></div>
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

      // Si estamos siguiendo este bus, centrar el mapa en su nueva posición.
      if (siguiendoBusRef.current === busId && mapRef.current) {
        mapRef.current.panTo([lat, lng]);
      }

      if (markersRef.current[busId]) {
        markersRef.current[busId]!.setLatLng([lat, lng]);
        markersRef.current[busId]!.setIcon(icon);
        markersRef.current[busId]!.setPopupContent(popupContent);
      } else {
        const marker = L.marker([lat, lng], { icon }).bindPopup(popupContent).addTo(mapRef.current!);
        if (rutaId) marker.on("click", () => {
          setSelectedRutaId((prev) => (prev === rutaId ? null : rutaId));
          setSheetSnap("half");
        });
        markersRef.current[busId] = marker;
      }
    },
    []
  );

  // Sincroniza los marcadores con los buses: dibuja los activos con coordenadas y
  // ELIMINA los que ya no están en circulación (evita "buses fantasma" en el mapa).
  useEffect(() => {
    const vivos = new Set<number>();
    buses.forEach((b) => {
      if (b.lat != null && b.lng != null && b.estado !== "inactivo") {
        vivos.add(b.id);
        updateBusMarker(b.id, b.lat, b.lng, b.color_ruta ?? "#2558A5", b.placa, b.ruta_id ?? undefined);
      }
    });
    Object.keys(markersRef.current).forEach((idStr) => {
      const id = Number(idStr);
      if (!vivos.has(id)) {
        markersRef.current[id]?.remove();
        delete markersRef.current[id];
        if (siguiendoBusRef.current === id) setSiguiendoBusId(null);
      }
    });
  }, [buses, updateBusMarker]);

  // Socket.IO — se conecta UNA sola vez (lee busesRef para datos actuales).
  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => setConectado(true));
    socket.on("disconnect", () => setConectado(false));
    socket.io.on("reconnect", () => setConectado(true));
    socket.on("bus:ubicacion", (data: BusLocation) => {
      const bus = busesRef.current.find((b) => b.id === data.busId);
      updateBusMarker(data.busId, data.lat, data.lng, bus?.color_ruta ?? "#2558A5", bus?.placa ?? "BUS", data.rutaId);
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    });
    socket.on("bus:novedad", (data: Novedad) => {
      // Refresca los buses para que el ⚠ aparezca/desaparezca en el marcador.
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      // Solo muestra la alerta cuando hay novedad (no cuando el conductor la retira).
      if (data.novedad) {
        setNovedad(data);
        setTimeout(() => setNovedad(null), 15000);
      }
    });
    socket.on("bus:ocupacion", () => {
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
    });
    return () => { socket.disconnect(); };
  }, [updateBusMarker, queryClient]);

  const handleSelectRuta = (rutaId: number) => {
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
  }, [modoDestino, rutas, userPos]);

  // Tocar el mapa (zona vacía) deselecciona la ruta y cierra el panel — gesto
  // natural en apps de mapas. Los toques en buses/paradas/recorrido no llegan
  // aquí (tienen su propio handler). No aplica en modo destino.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || modoDestino || selectedRutaId === null) return;
    const onClick = () => cerrarCard();
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoDestino, selectedRutaId]);

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

  // Marcador "Súbete aquí": resalta en el mapa la parada más cercana al pasajero
  // de la ruta seleccionada (solo con ubicación activa). Se quita si no aplica.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const quitar = () => { miParadaMarkerRef.current?.remove(); miParadaMarkerRef.current = null; };
    const ruta = rutas.find((r) => r.id === selectedRutaId);
    if (!userPos || !ruta || ruta.paradas.length === 0) { quitar(); return; }
    let mejor = ruta.paradas[0]!, dMin = Infinity;
    for (const p of ruta.paradas) {
      const d = distanciaKm(userPos.lat, userPos.lng, p.latitud, p.longitud);
      if (d < dMin) { dMin = d; mejor = p; }
    }
    const dTxt = dMin < 1 ? `${Math.round(dMin * 1000)} m` : `${dMin.toFixed(1)} km`;
    const icon = L.divIcon({
      className: "",
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px">
          <span class="animate-ping" style="position:absolute;width:30px;height:30px;border-radius:50%;background:rgba(56,161,105,.45)"></span>
          <span style="position:relative;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#38A169;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg></span>
        </div>`,
      iconSize: [34, 34], iconAnchor: [17, 17],
    });
    const popup = `<div style="font-family:'Inter',system-ui,sans-serif"><b style="font-size:13px;color:#16a34a">Súbete aquí</b><br><span style="font-size:12px">${escHtml(mejor.nombre)}</span><br><span style="font-size:11px;color:#64748b">a ${dTxt} de ti</span></div>`;
    if (miParadaMarkerRef.current) {
      miParadaMarkerRef.current.setLatLng([mejor.latitud, mejor.longitud]).setIcon(icon).setPopupContent(popup);
    } else {
      miParadaMarkerRef.current = L.marker([mejor.latitud, mejor.longitud], { icon, zIndexOffset: 500 }).bindPopup(popup).addTo(map);
    }
  }, [selectedRutaId, userPos, rutas]);

  // ETA del próximo bus por parada de la ruta seleccionada (lo calcula el API Node).
  useEffect(() => {
    if (selectedRutaId === null) { setEtaPorParada({}); return; }
    let cancelado = false;
    const cargarEta = async () => {
      try {
        const res = await fetch(`/api/rutas/${selectedRutaId}/eta`);
        if (!res.ok || cancelado) return;
        const data = (await res.json()) as {
          paradas: { parada_id: number; eta_min: number | null; placa: string | null }[];
        };
        const mapa: Record<number, { eta: number; placa: string }> = {};
        for (const p of data.paradas) {
          if (p.eta_min !== null && p.placa) mapa[p.parada_id] = { eta: p.eta_min, placa: p.placa };
        }
        if (!cancelado) setEtaPorParada(mapa);
      } catch { /* ETA no disponible — se ignora */ }
    };
    cargarEta();
    const t = setInterval(cargarEta, 15000);
    return () => { cancelado = true; clearInterval(t); };
  }, [selectedRutaId, buses]);

  // El próximo bus que llega (menor ETA entre las paradas de la ruta).
  const proximoBus = (() => {
    const vals = Object.values(etaPorParada);
    if (!vals.length) return null;
    return vals.reduce((a, b) => (b.eta < a.eta ? b : a));
  })();

  // Mantener el ref sincronizado para el pan dentro de updateBusMarker.
  useEffect(() => { siguiendoBusRef.current = siguiendoBusId; }, [siguiendoBusId]);
  // Espejo del ETA para el popup del bus (updateBusMarker no depende del estado).
  useEffect(() => { etaRef.current = etaPorParada; }, [etaPorParada]);

  // Activar/desactivar el seguimiento de un bus; al activarlo centra el mapa.
  const seguirBus = (busId: number) => {
    const next = siguiendoBusId === busId ? null : busId;
    setSiguiendoBusId(next);
    if (next !== null) {
      const b = buses.find((x) => x.id === next);
      if (b?.lat && b?.lng && mapRef.current) mapRef.current.setView([b.lat, b.lng], 16);
    }
  };
  const busSeguido = buses.find((b) => b.id === siguiendoBusId);

  // Buses activos de la ruta seleccionada, ordenados del más cercano a mí, con
  // la distancia y el tiempo estimado de llegada a MI ubicación.
  const busesRutaSel = useMemo(
    () =>
      (selectedRuta ? buses : [])
        .filter((b) => b.ruta_id === selectedRuta?.id && b.estado !== "inactivo" && b.lat != null && b.lng != null)
        .map((b) => {
          const distKm = userPos ? distanciaKm(userPos.lat, userPos.lng, b.lat!, b.lng!) : null;
          const etaMin = distKm != null ? Math.max(0, Math.round((distKm / velEfectiva(b.velocidad)) * 60)) : null;
          return { bus: b, distKm, etaMin };
        })
        .sort((a, b) => (a.distKm ?? Infinity) - (b.distKm ?? Infinity)),
    [selectedRuta, buses, userPos],
  );

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
    return busMasCercano(buses, sugerencia.ruta.id, { lat: ref.latitud, lng: ref.longitud });
  }, [sugerencia, buses]);

  const armarDestino = () => {
    setModoDestino(true); // el card se oculta solo (no hay ruta/destino aún); el mapa queda libre
  };
  const limpiarDestino = () => {
    setModoDestino(false);
    setDestino(null);
    setSelectedRutaId(null);
  };

  // ── Card de detalle: snap de 3 estados (peek/half/full). Bajarlo NO cierra ──
  // (solo la X cierra). Orden de menor a mayor altura para el paso de los gestos.
  const SNAPS = ["peek", "half", "full"] as const;
  const cerrarCard = () => {
    if (destino) limpiarDestino();
    setSelectedRutaId(null);
    setSheetSnap("half"); // resetea para el próximo abrir
  };
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
  const locateMe = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserPos({ lat: latitude, lng: longitude });
        const map = mapRef.current;
        if (!map) { setLocating(false); return; }
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#2558A5;border:3px solid white;box-shadow:0 0 0 6px rgba(37,88,165,.25)"></div>`,
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
        <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
          <span className="text-xs text-foreground">
            Bus más cercano <span className="font-mono font-bold">{busSugerido.bus.placa}</span>:{" "}
            <span className="font-bold text-green-400">{busSugerido.etaMin <= 0 ? "llegando" : `~${busSugerido.etaMin} min`}</span>
          </span>
          <button
            onClick={() => seguirBus(busSugerido.bus.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
            style={siguiendoBusId === busSugerido.bus.id
              ? { background: "var(--tp-sky)", color: "#001018" }
              : { background: "rgba(123,184,213,0.15)", color: "var(--tp-sky)" }}
          >
            <LocateFixed className="w-3 h-3" />{siguiendoBusId === busSugerido.bus.id ? "Siguiendo" : "Seguir"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground px-1">Esta ruta no tiene buses circulando ahora mismo.</p>
      )}
      {!userPos && (
        <button onClick={locateMe} className="mt-2 text-[11px] font-semibold flex items-center gap-1" style={{ color: "var(--tp-sky)" }}>
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
              Buses de Riohacha en vivo
            </p>
          </div>
        </div>
      </div>

      {/* Stats en vivo */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${activeBuses.length > 0 ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
          <span className="text-muted-foreground font-medium">
            {activeBuses.length > 0 ? `${activeBuses.length} en vivo` : "Sin buses ahora"}
          </span>
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
            style={{ background: "rgba(245,183,49,0.12)", color: "var(--tp-yellow)" }}>
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
            <button onClick={() => setBusqueda("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* ¿A dónde vas? — recomendación por destino */}
        <div className="mt-2.5">{panelDestino}</div>
      </div>

      {/* Lista de rutas */}
      <div className="flex-1 overflow-y-auto py-2">
        {!selectedRutaId && rutas.length > 0 && !busqueda && (
          <div className="mx-3 mb-1 rounded-xl border p-3 flex items-start gap-2.5"
            style={{ borderColor: "rgba(123,184,213,0.35)", background: "rgba(37,88,165,0.10)" }}>
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--tp-sky)" }} />
            <div>
              <p className="text-xs font-bold text-foreground">Elige tu ruta para empezar</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Haz clic en una ruta y verás el bus en vivo y en cuántos minutos llega.</p>
              {activeBuses.length === 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: "var(--tp-yellow)" }}>
                  Aún no hay buses en ruta — aparecerán en el mapa apenas un conductor inicie su recorrido.
                </p>
              )}
            </div>
          </div>
        )}
        {!busqueda && recientes.length > 0 && (() => {
          const recientesRutas = recientes
            .map((id) => rutas.find((r) => r.id === id))
            .filter((r): r is typeof rutas[number] => !!r);
          if (recientesRutas.length === 0) return null;
          return (
            <div className="px-4 pt-1 pb-2">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                <History className="w-3 h-3" /> Recientes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recientesRutas.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectRuta(r.id)}
                    className="flex items-center gap-1.5 max-w-full px-2.5 py-1.5 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors"
                    title={r.nombre}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                    <span className="text-xs font-medium text-foreground truncate max-w-[120px]">{r.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 py-2">
          Rutas disponibles {rutasFiltradas.length !== rutas.length && `(${rutasFiltradas.length})`}
        </p>
        {rutasError ? errorCarga
          : rutasLoading && rutas.length === 0 ? skeletonRutas
          : rutas.length === 0 ? <p className="px-4 py-8 text-xs text-muted-foreground text-center">No hay rutas configuradas todavía.</p>
          : null}
        {busqueda && rutasFiltradas.length === 0 && rutas.length > 0 && (
          <p className="px-4 py-8 text-xs text-muted-foreground text-center">Sin resultados para "{busqueda}"</p>
        )}
        {rutasFiltradas.map((ruta) => {
          const isSelected = selectedRutaId === ruta.id;
          const dimmed = selectedRutaId !== null && !isSelected;
          const rutaBuses = buses.filter((b) => b.ruta_id === ruta.id && b.estado !== "inactivo");
          return (
            <div
              key={ruta.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectRuta(ruta.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelectRuta(ruta.id); } }}
              className={`mx-3 mb-2 rounded-xl border text-left transition-all cursor-pointer ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "border-border bg-card hover:border-primary/40"}`}
              style={{ opacity: dimmed ? 0.45 : 1 }}
            >
              <div className="flex items-center gap-3 p-3">
                <div
                  className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
                  style={{ background: ruta.color + "22" }}
                >
                  <Bus style={{ color: ruta.color, width: 20, height: 20 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate block">{ruta.nombre}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{ruta.paradas.length} paradas</span>
                    {rutaBuses.length > 0 ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />{rutaBuses.length} en vivo
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/50">sin buses ahora</span>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex items-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleFavorito(ruta.id); }}
                    className="p-2 -m-1"
                    aria-label={favoritos.includes(ruta.id) ? "Quitar de favoritas" : "Marcar como favorita"}
                  >
                    <Star
                      className="w-4 h-4"
                      style={favoritos.includes(ruta.id)
                        ? { color: "var(--tp-yellow)", fill: "var(--tp-yellow)" }
                        : { color: "var(--muted-foreground, #94a3b8)" }}
                    />
                  </button>
                </div>
              </div>
              {isSelected && (
                <div className="px-3 pb-3 space-y-2">
                  {/* Hero: tiempo de llegada del próximo bus */}
                  {proximoBus && (
                    <div className="flex items-end justify-between px-2.5 py-2 rounded-lg" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5 text-green-400/80">Próximo bus</p>
                        {proximoBus.eta <= 0 ? (
                          <span className="text-lg font-black text-green-400 leading-none">¡Llegando!</span>
                        ) : (
                          <span className="flex items-baseline gap-1 text-green-400">
                            <span className="text-3xl font-black leading-none">{proximoBus.eta}</span>
                            <span className="text-xs font-bold">min</span>
                          </span>
                        )}
                      </div>
                      <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-foreground/80 px-2 py-1 rounded-lg bg-background/50">
                        <Bus className="w-3 h-3" />{proximoBus.placa}
                      </span>
                    </div>
                  )}
                  {ruta.paradas.length > 0 && (
                    <div>
                      {ruta.paradas.map((p, i, arr) => {
                        const eta = etaPorParada[p.id];
                        const first = i === 0;
                        const last = i === arr.length - 1;
                        return (
                          <div key={p.id} className="relative flex items-center gap-2.5 py-1">
                            <div className="relative flex flex-col items-center self-stretch w-3">
                              <div className="w-0.5 flex-1" style={{ background: first ? "transparent" : ruta.color + "55" }} />
                              <div className="w-2 h-2 rounded-full ring-2 ring-background flex-shrink-0" style={{ background: ruta.color }} />
                              <div className="w-0.5 flex-1" style={{ background: last ? "transparent" : ruta.color + "55" }} />
                            </div>
                            <span className="flex-1 truncate text-xs text-foreground/80">{p.nombre}</span>
                            {(first || last) && <span className="text-[9px] opacity-50 font-bold flex-shrink-0">{first ? "INICIO" : "FIN"}</span>}
                            {eta && (
                              <span className="text-[10px] font-bold text-green-400 whitespace-nowrap flex-shrink-0 px-1.5 py-0.5 rounded-full bg-green-500/10">
                                {eta.eta <= 0 ? "llegando" : `~${eta.eta} min`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Buses en ruta seleccionada — ordenados del más cercano a mí, con ETA a mi ubicación */}
      {selectedRuta && busesRutaSel.length > 0 && (
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {userPos ? "Buses — más cercano primero" : "Buses en ruta"}
            </p>
            {!userPos && (
              <button onClick={locateMe} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: "var(--tp-sky)" }}>
                <LocateFixed className="w-3 h-3" /> Mi ubicación
              </button>
            )}
          </div>
          {busesRutaSel.map(({ bus: b, distKm, etaMin }) => (
            <div key={b.id} className="bg-card border border-border rounded-lg p-2.5 mb-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold text-foreground tracking-wide">{b.placa}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${b.estado === "demora" ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}>
                  {b.estado}
                </span>
              </div>
              {distKm != null ? (
                <p className="text-foreground/80">
                  A {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`} de ti ·{" "}
                  <span className="text-green-400 font-semibold">{etaMin === 0 ? "llegando" : `~${etaMin} min`}</span>
                </p>
              ) : (
                <p className="text-muted-foreground/70">Activa tu ubicación para ver el tiempo de llegada</p>
              )}
              {b.actualizado && (
                <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />{tiempoRelativo(b.actualizado)}
                </p>
              )}
              {b.novedad && (
                <p className="mt-1 flex items-center gap-1" style={{ color: "var(--tp-yellow)" }}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{b.novedad}
                </p>
              )}
              <button
                onClick={() => seguirBus(b.id)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-semibold transition-colors"
                style={siguiendoBusId === b.id
                  ? { background: "var(--tp-sky)", color: "#001018" }
                  : { background: "rgba(123,184,213,0.15)", color: "var(--tp-sky)" }}
              >
                <LocateFixed className="w-3.5 h-3.5" />
                {siguiendoBusId === b.id ? "Siguiendo este bus" : "Seguir este bus"}
              </button>
            </div>
          ))}
        </div>
      )}

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
                  aria-label="Ir al panel"
                >
                  <Shield className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                variant="ghost" size="sm"
                onClick={() => { clearAuth(); window.location.reload(); }}
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
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
  // Card de detalle deslizable: aparece SOLO al seleccionar una ruta/bus o al pedir
  // una recomendación de destino. Se arrastra desde la barrita (swipe ↓ cierra/colapsa,
  // ↑ expande, tap alterna); el contenido scrollea aparte. Mapa limpio el resto del tiempo.
  const MobileSheet = () => {
    if (!selectedRuta && !destino) return null;
    return (
      <div
        className="md:hidden fixed left-0 right-0 bottom-[72px] z-[1000] rounded-t-3xl overflow-hidden animate-in slide-in-from-bottom-8 fade-in duration-300 ease-out"
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
            .map((p, i) => ({ i, eta: etaPorParada[p.id]?.eta }))
            .filter((x): x is { i: number; eta: number } => x.eta != null);
          const nextI = conEta.length ? conEta.sort((a, b) => a.eta - b.eta)[0]!.i : -1;
          const proxEtaMin = nextI >= 0 ? etaPorParada[paradas[nextI]!.id]?.eta : undefined;
          const progresoPct = nextI >= 0 && paradas.length > 1 ? (nextI / (paradas.length - 1)) * 100 : 0;
          const hayDemora = busesRutaSel.some((x) => x.bus.estado === "demora");
          const nov = busesRutaSel.find((x) => x.bus.novedad)?.bus.novedad;
          const proxBus = proximoBus ? buses.find((b) => b.placa === proximoBus.placa) : undefined;
          const ocupProx = proxBus?.ocupacion
            ? ({ vacio: { l: "Disponible", c: "#38A169" }, medio: { l: "Medio lleno", c: "#F5B731" }, lleno: { l: "Lleno", c: "#E53E3E" } } as Record<string, { l: string; c: string }>)[proxBus.ocupacion]
            : null;
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
              <div className="w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-xl shrink-0" style={{ background: "#fff", color: "var(--color-navy)" }}>{rutaNumero}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-lg text-white leading-tight truncate">{selectedRuta.nombre}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: selectedRuta.color }} />
                  {proximoBus && proxEtaMin != null ? (
                    <span className="text-[11px] font-bold flex items-center gap-1" style={{ color: "var(--color-gold)" }}>
                      <Bus className="w-3 h-3" /> Próx · {proxEtaMin <= 0 ? "llegando" : `${proxEtaMin} min`}
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
                <p className="text-sm" style={{ color: "var(--color-gray-text)" }}>No hay buses en circulación en esta ruta ahora.</p>
              )}
            </div>
            {/* Banner de novedad */}
            {nov && (
              <div className="flex items-start gap-2 px-4 py-2.5" style={{ background: "rgba(245,183,49,0.14)" }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--color-gold)" }} />
                <span className="text-xs font-semibold leading-snug" style={{ color: "#9a6a00" }}>{nov}</span>
              </div>
            )}
            {/* Lista de paraderos */}
            {paradas.length > 0 && (
              <ul className="bg-white">
                {paradas.map((p, i) => {
                  const eta = etaPorParada[p.id]?.eta;
                  const past = nextI >= 0 && i < nextI;
                  const current = i === nextI;
                  const cercana = i === miParadaI; // la más cercana a mi ubicación
                  return (
                    <li key={p.id} className="relative flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#f1f4f8", background: current ? "rgba(123,184,213,0.10)" : cercana ? "rgba(56,161,105,0.07)" : "transparent", opacity: past ? 0.55 : 1 }}>
                      {current && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: "var(--color-gold)" }} />}
                      {cercana && !current && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: "var(--color-success)" }} />}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={current ? { background: "rgba(37,88,165,0.12)" } : cercana ? { background: "rgba(56,161,105,0.15)" } : { background: "#eef2f7" }}>
                          {past ? <Check className="w-4 h-4" style={{ color: "var(--color-gray-text)" }} /> : current ? <MapPin className="w-4 h-4" style={{ color: "var(--color-blue)" }} /> : cercana ? <LocateFixed className="w-4 h-4" style={{ color: "var(--color-success)" }} /> : <span className="w-2 h-2 rounded-full" style={{ background: "#cbd5e1" }} />}
                        </span>
                        <div className="min-w-0">
                          <span className={"truncate block text-sm " + (current || cercana ? "font-bold" : "font-medium")} style={{ color: "var(--color-navy)" }}>{p.nombre}</span>
                          {cercana && <span className="text-[10px] font-bold" style={{ color: "var(--color-success)" }}>Súbete aquí · a {miParada.d < 1 ? `${Math.round(miParada.d * 1000)} m` : `${miParada.d.toFixed(1)} km`} de ti</span>}
                        </div>
                      </div>
                      {eta != null && (
                        <div className="text-right shrink-0 ml-2">
                          <div className={"font-display " + (current ? "text-3xl" : "text-lg") + " font-extrabold tabular-nums leading-none"} style={{ color: current ? "var(--color-gold)" : "var(--color-gray-text)" }}>{eta <= 0 ? "•" : eta}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--color-gray-text)" }}>{eta <= 0 ? "llegando" : "min"}</div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {/* Botón Seguir este bus */}
            <div className="px-4 pt-3 pb-1 bg-white">
              {proxBus ? (
                <button onClick={() => seguirBus(proxBus.id)} className="w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform" style={siguiendoBusId === proxBus.id ? { background: "var(--color-sky)", color: "var(--color-navy)" } : { background: "var(--color-blue)", color: "#fff" }}>
                  <LocateFixed className="w-5 h-5" /> {siguiendoBusId === proxBus.id ? "Siguiendo este bus" : "Seguir este bus"}
                  {ocupProx && <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.22)" }}>{ocupProx.l}</span>}
                </button>
              ) : (
                <div className="w-full h-12 rounded-2xl font-semibold flex items-center justify-center" style={{ background: "#eef2f7", color: "var(--color-gray-text)" }}>Sin buses ahora</div>
              )}
            </div>
            {/* Otros buses de la ruta (además del próximo) — para verlos/seguir cualquiera */}
            {(() => {
              const otros = busesRutaSel.filter((x) => x.bus.id !== proxBus?.id);
              if (otros.length === 0) return null;
              const ocupCol: Record<string, string> = { vacio: "#38A169", medio: "#F5B731", lleno: "#E53E3E" };
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
                          {b.ocupacion && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ocupCol[b.ocupacion] }} title="Ocupación" />}
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
    <div className="flex h-screen bg-background overflow-hidden">
      {DesktopSidebar()}

      {/* Mapa */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" data-testid="map-container" />

        {/* FAB "ver ruta completa" — solo con una ruta seleccionada, encima del de ubicación */}
        {vista === "mapa" && selectedRutaId !== null && (
          <button
            onClick={encuadrarRuta}
            className="md:hidden absolute right-4 bottom-[148px] z-[900] flex items-center justify-center w-12 h-12 rounded-full active:scale-95 transition-transform"
            style={{ background: "var(--color-white)", color: "var(--color-navy)", border: "3px solid #fff", boxShadow: "0 6px 16px rgba(15,30,60,0.25)" }}
            aria-label="Ver la ruta completa en el mapa"
            title="Ver ruta completa"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        )}

        {/* FAB ubicación (sky) — abajo-derecha sobre el bottom nav */}
        {vista === "mapa" && (
          <button
            onClick={locateMe}
            disabled={locating}
            className="md:hidden absolute right-4 bottom-[88px] z-[900] flex items-center justify-center w-12 h-12 rounded-full active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: "var(--color-sky)", color: "var(--color-navy)", border: "3px solid #fff", boxShadow: "0 6px 16px rgba(15,30,60,0.25)" }}
            aria-label="Centrar en mi ubicación"
          >
            {locating ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
          </button>
        )}


        {/* ── Controles desktop ── */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="hidden md:flex absolute top-3 left-3 z-[1000] bg-card/95 backdrop-blur-sm border border-border rounded-xl p-2.5 shadow-lg hover:bg-secondary transition-colors items-center justify-center"
          title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
          aria-label={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
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
            style={{ background: "linear-gradient(135deg, #2558A5, var(--tp-sky))" }}
          >
            <LogIn className="w-3.5 h-3.5" />Iniciar sesión
          </button>
        )}

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
              <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full" style={conectado ? { background: "rgba(245,183,49,0.2)", color: "var(--color-gold)" } : { background: "rgba(255,255,255,0.15)", color: "#fff" }}>
                <span className={`w-1.5 h-1.5 rounded-full ${conectado ? "animate-pulse" : ""}`} style={{ background: conectado ? "var(--color-gold)" : "#fcd34d" }} />
                {conectado ? "EN VIVO" : "SIN CONEXIÓN"}
              </span>
            </div>
          </div>
          {/* Búsqueda (tarjeta blanca) */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "var(--color-blue)" }} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onFocus={() => setVista("rutas")}
              placeholder="Buscar ruta…"
              aria-label="Buscar ruta"
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
              <button onClick={armarDestino} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-100" style={{ color: "var(--color-navy)" }}>
                <Navigation className="w-5 h-5 flex-shrink-0" style={{ color: "var(--color-blue)" }} /><span className="font-semibold text-sm">¿A dónde vas? — toca el mapa</span>
              </button>
              <a href={`https://wa.me/${WHATSAPP_NUMERO}?text=Hola%20TransPadilla%2C%20necesito%20ayuda`} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-gray-100 active:bg-gray-100" style={{ color: "var(--color-navy)" }}>
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
                    onClick={() => { clearAuth(); window.location.reload(); }}
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

        {/* Banner "Instalar app" (PWA) — sobre el bottom nav, descartable */}
        {mostrarInstall && (
          <div className="md:hidden fixed left-3 right-3 bottom-[84px] z-[1001] flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-300" style={{ background: "var(--color-navy)" }}>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Smartphone className="w-5 h-5 text-white" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">Instala TransPadilla</p>
              <p className="text-[11px] text-white/70 leading-tight mt-0.5">Ábrela como app, sin abrir el navegador.</p>
            </div>
            <button onClick={instalarApp} className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-bold flex-shrink-0 active:scale-95 transition-transform" style={{ background: "var(--color-gold)", color: "var(--color-navy)" }}>
              <Download className="w-4 h-4" /> Instalar
            </button>
            <button onClick={descartarInstall} aria-label="Ahora no" className="p-1.5 -mr-1 flex-shrink-0 text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Bottom nav (estilo Stitch): Inicio / Rutas / Favoritos / Perfil ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[1002] flex justify-around items-center px-2 pt-2 pb-3 bg-white" style={{ boxShadow: "0 -4px 16px rgba(15,30,60,0.10)" }}>
          {([
            { id: "mapa", label: "Inicio", icon: <MapIcon className="w-5 h-5" /> },
            { id: "rutas", label: "Rutas", icon: <RouteIcon className="w-5 h-5" /> },
            { id: "favoritos", label: "Favoritos", icon: <Star className="w-5 h-5" /> },
            { id: "paraderos", label: "Paraderos", icon: <MapPin className="w-5 h-5" /> },
          ] as const).map((t) => {
            const activo = vista === t.id;
            const badge = t.id === "favoritos" && favoritos.length > 0 ? favoritos.length : null;
            return (
              <button key={t.id} onClick={() => setVista(t.id)} className="relative flex flex-col items-center gap-1 rounded-2xl px-4 py-2 active:scale-90 transition-all" style={activo ? { background: "var(--color-gold)", color: "var(--color-navy)", boxShadow: "0 4px 12px rgba(245,183,49,0.4)" } : { color: "var(--color-blue)" }}>
                <span className="relative">
                  {t.icon}
                  {badge !== null && (
                    <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white" style={{ background: "var(--color-danger)", border: "1.5px solid #fff" }}>
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-bold">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Guía de bienvenida (primera visita) */}
        {showWelcome && (
          <div className="absolute inset-0 z-[1001] flex items-end md:items-center justify-center p-4 pb-28 md:pb-4" style={{ background: "rgba(9,14,26,0.65)", backdropFilter: "blur(3px)" }}>
            <div className="w-full max-w-sm rounded-2xl border shadow-2xl p-5"
              style={{ background: "rgba(12,18,32,0.97)", borderColor: "rgba(123,184,213,0.3)" }}>
              <div className="flex items-center gap-3 mb-3">
                <LogoTP size={40} />
                <div>
                  <p className="text-base font-black tracking-wide text-white">
                    Bienvenido a Trans<span style={{ color: "var(--tp-sky)" }}>Padilla</span>
                  </p>
                  <p className="text-[11px] font-semibold" style={{ color: "var(--tp-yellow)" }}>Rastrea tu bus en tiempo real</p>
                </div>
              </div>
              <p className="text-sm text-white/70 mb-3">En 3 pasos sabes cuándo pasa tu bus:</p>
              <div className="space-y-2.5 mb-4">
                {[
                  { n: "1", txt: "Elige tu ruta en la lista de abajo." },
                  { n: "2", txt: "Mira el bus moverse en vivo en el mapa." },
                  { n: "3", txt: "Lee cuántos minutos faltan para que llegue." },
                ].map((step) => (
                  <div key={step.n} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black text-white"
                      style={{ background: "linear-gradient(135deg, #2558A5 0%, var(--tp-sky) 100%)" }}>
                      {step.n}
                    </div>
                    <p className="text-sm text-white/90">{step.txt}</p>
                  </div>
                ))}
              </div>
              <Button
                onClick={dismissWelcome}
                className="w-full h-12 rounded-xl font-bold text-white border-0 text-base"
                style={{ background: "linear-gradient(135deg, #2558A5 0%, var(--tp-sky) 100%)" }}
              >
                Elegir mi ruta →
              </Button>
              <p className="text-[11px] text-white/40 text-center mt-2">No necesitas cuenta para ver los buses.</p>
            </div>
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
                    { icon: <Clock className="w-4 h-4" />, t: "Tiempo de llegada (ETA)", d: "Minutos estimados que falta para que el bus llegue a tu ubicación o parada." },
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
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e" }} /> Vacío</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#F5C200" }} /> Medio lleno</span>
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
              <div className="px-5 py-3 border-t border-white/10 shrink-0">
                <Button onClick={() => setShowAyuda(false)} className="w-full h-11 rounded-xl font-bold text-white border-0" style={{ background: "linear-gradient(135deg, #2558A5 0%, var(--tp-sky) 100%)" }}>
                  Entendido
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Alerta de novedad — vistosa, con animación de entrada y botón de cerrar */}
        {novedad && (
          <div
            role="alert"
            className="absolute top-16 left-3 right-3 md:top-4 md:left-1/2 md:-translate-x-1/2 md:right-auto md:max-w-md z-[1002] rounded-2xl px-4 py-3.5 flex items-start gap-3 animate-in slide-in-from-top-4 fade-in duration-300"
            style={{ background: "var(--tp-yellow)", color: "#1a1300", boxShadow: "0 12px 40px rgba(245,183,49,0.55)" }}
          >
            <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5 animate-pulse" style={{ color: "#1a1300" }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black uppercase tracking-wide">
                Alerta {novedad.placa ? `— Bus ${novedad.placa}` : "de un conductor"}
              </p>
              <p className="text-sm font-medium mt-0.5" style={{ color: "#2a2000" }}>{novedad.novedad}</p>
            </div>
            <button
              onClick={() => setNovedad(null)}
              className="flex-shrink-0 -mr-1 -mt-0.5 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-black/10 active:bg-black/20"
              style={{ color: "#1a1300" }}
              aria-label="Cerrar alerta"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Botón de ayuda y ubicación — SOLO escritorio (en móvil están en la fila de acciones) */}
        <button
          onClick={() => setShowAyuda(true)}
          className="hidden md:flex absolute md:bottom-36 left-3 z-[1000] items-center justify-center w-11 h-11 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg hover:bg-secondary active:scale-95 transition-all"
          title="¿Cómo funciona?"
          aria-label="¿Cómo funciona?"
        >
          <HelpCircle className="w-5 h-5" style={{ color: "var(--tp-sky)" }} />
        </button>
        <button
          onClick={locateMe}
          disabled={locating}
          className="hidden md:flex absolute md:bottom-20 left-3 z-[1000] items-center justify-center w-11 h-11 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg hover:bg-secondary active:scale-95 transition-all disabled:opacity-60"
          title="Centrar en mi ubicación"
          aria-label="Centrar en mi ubicación"
        >
          {locating
            ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
            : <LocateFixed className="w-5 h-5 text-primary" />}
        </button>

        {/* Chips de estado — apilados verticalmente para no solaparse entre sí */}
        <div className="absolute top-[140px] md:top-3 left-1/2 -translate-x-1/2 z-[1001] flex flex-col items-center gap-2 pointer-events-none">
          {rutasLoading && rutas.length === 0 && (
            <div className="pointer-events-none flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Cargando el mapa…</span>
            </div>
          )}
          {activeBuses.length === 0 && !rutasLoading && rutas.length > 0 && (
            <div className="pointer-events-none flex items-center gap-2 rounded-full shadow-md px-4 py-2" style={{ background: "var(--color-white)", border: "1px solid #e8edf4" }}>
              <Bus className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-gold)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--color-navy)" }}>Sin buses activos · <span style={{ color: "var(--color-gray-text)" }}>5:00 am – 10:00 pm</span></span>
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

        {/* En escritorio: indicador de conexión abajo-izquierda (en móvil está el badge EN VIVO en la TopBar) */}
        <div className="hidden md:flex absolute md:bottom-4 left-3 z-[600] items-center gap-1.5 rounded-full px-3 py-1.5 shadow-md" style={{ background: "var(--color-white)" }}>
          <span className={`w-2 h-2 rounded-full ${conectado ? "animate-pulse" : ""}`} style={{ background: conectado ? "var(--color-success)" : "var(--color-gold)" }} />
          <span className="text-xs font-bold" style={{ color: "var(--color-navy)" }}>{conectado ? "En vivo" : "Reconectando…"}</span>
        </div>

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

      {/* Drawer del mapa (tema claro, solo en la vista "Mapa en vivo") */}
      {vista === "mapa" && <div className="tp-light">{MobileSheet()}</div>}

      {/* ── Vistas de los chips: Favoritos / Rutas / Paraderos ── */}
      {vista !== "mapa" && (
        <div
          key={vista}
          className="tp-light md:hidden fixed left-0 right-0 bottom-0 z-[1000] overflow-y-auto animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out"
          style={{ top: 140, bottom: 72, background: "linear-gradient(180deg,#eaf1fb 0%, #f6f9fc 55%)", touchAction: "pan-y", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
        >
          <div className="px-4 pt-4 pb-6 space-y-4">
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

              // Pill de estado: cuántos buses en vivo, o "sin buses".
              const EstadoPill = (n: number) => {
                const vivos = n > 0;
                return (
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={vivos
                      ? { background: "rgba(56,161,105,0.14)", color: "var(--color-success)" }
                      : { background: "rgba(107,114,128,0.12)", color: "var(--color-gray-text)" }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${vivos ? "animate-pulse" : ""}`} style={{ background: vivos ? "var(--color-success)" : "var(--color-gray-text)" }} />
                    {vivos ? `${n} en vivo` : "Sin buses"}
                  </span>
                );
              };

              // Tarjeta de ruta amplia y táctil (estilo apps de movilidad).
              const RouteCard = (r: typeof rutas[number]) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectRuta(r.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelectRuta(r.id); } }}
                  className="relative w-full flex items-center gap-4 rounded-2xl p-4 pl-5 min-h-[78px] overflow-hidden active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                  style={{ background: `linear-gradient(100deg, ${r.color}14 0%, #ffffff 60%)`, boxShadow: "0 6px 16px rgba(27,59,111,0.10)" }}
                >
                  <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: r.color }} />
                  <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md" style={{ background: r.color }}>
                    <Bus className="w-6 h-6 text-white" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-display block text-[17px] font-bold truncate" style={{ color: "var(--color-navy)" }}>{r.nombre}</span>
                    <span className="mt-1 flex items-center gap-2 flex-wrap">
                      {EstadoPill(rutaBusesVivos(r.id))}
                      {r.paradas.length > 0 && <span className="text-xs" style={{ color: "var(--color-gray-text)" }}>{r.paradas.length} paradas</span>}
                    </span>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorito(r.id); }}
                    className="p-2.5 -mr-1 flex-shrink-0 rounded-full active:scale-90 transition-transform"
                    aria-label={favoritos.includes(r.id) ? "Quitar de favoritas" : "Marcar favorita"}
                  >
                    <Star className="w-6 h-6" style={favoritos.includes(r.id) ? { color: "var(--color-gold)", fill: "var(--color-gold)" } : { color: "#cbd5e1" }} />
                  </button>
                  <ChevronRight className="w-5 h-5 flex-shrink-0 -ml-1" style={{ color: "#cbd5e1" }} />
                </div>
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
                if (rutasFiltradas.length === 0)
                  return Estado(
                    <Search className="w-8 h-8" style={{ color: "var(--color-sky)" }} />,
                    busqueda ? "Sin resultados" : "No hay rutas",
                    busqueda ? `No encontramos rutas para "${busqueda}".` : "Aún no hay rutas configuradas.",
                  );
                // Rutas vistas recientemente (solo sin búsqueda activa).
                const recientesRutas = busqueda
                  ? []
                  : recientes.map((id) => rutas.find((r) => r.id === id)).filter((r): r is typeof rutas[number] => !!r);
                return (
                  <>
                    {recientesRutas.length > 0 && (
                      <>
                        {SubHeader(<History className="w-4 h-4" />, "Recientes")}
                        {recientesRutas.map(RouteCard)}
                        <div className="h-1" />
                      </>
                    )}
                    {Header("Rutas", "Toca una para verla en el mapa", rutasFiltradas.length)}
                    {rutasFiltradas.map(RouteCard)}
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
                  <button onClick={locateMe} disabled={locating} className="inline-flex items-center gap-2 px-6 h-12 rounded-2xl text-white font-bold shadow-sm active:scale-95 transition-transform disabled:opacity-60" style={{ background: "var(--color-blue)" }}>
                    {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />} Usar mi ubicación
                  </button>,
                );
              }
              return <>{Header("Paraderos cercanos", "Ordenados por distancia a ti", paraderos.length)}{paraderos.slice(0, 30).map((x) => (
                <div
                  key={x.parada.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (x.rutas[0]) handleSelectRuta(x.rutas[0].id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (x.rutas[0]) handleSelectRuta(x.rutas[0].id); } }}
                  className="relative w-full flex items-center gap-4 rounded-2xl p-4 pl-5 min-h-[78px] overflow-hidden active:scale-[0.98] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                  style={{ background: "var(--color-white)", boxShadow: "0 6px 16px rgba(27,59,111,0.10)" }}
                >
                  <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: x.rutas[0]?.color ?? "var(--color-sky)" }} />
                  <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: (x.rutas[0]?.color ?? "var(--color-sky)") + "22" }}>
                    <MapPin className="w-6 h-6" style={{ color: x.rutas[0]?.color ?? "var(--color-navy)" }} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-bold truncate" style={{ color: "var(--color-navy)" }}>{x.parada.nombre}</span>
                    <span className="text-xs truncate block mt-0.5" style={{ color: "var(--color-gray-text)" }}>{x.rutas.length} {x.rutas.length === 1 ? "ruta" : "rutas"} · {x.rutas.map((r) => r.nombre).join(" · ")}</span>
                  </span>
                  {x.dist != null && (
                    <span className="text-xs font-bold flex-shrink-0 px-2.5 py-1 rounded-full" style={{ background: "rgba(245,183,49,0.18)", color: "#9a6a00" }}>
                      {x.dist < 1 ? `${Math.round(x.dist * 1000)} m` : `${x.dist.toFixed(1)} km`}
                    </span>
                  )}
                  <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: "#cbd5e1" }} />
                </div>
              ))}</>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
