import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useGetRutas, useGetBuses, getGetBusesQueryKey } from "@workspace/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { clearAuth, getUser } from "@/lib/auth";
import {
  Bus, MapPin, LogOut, Radio, AlertTriangle, X,
  Search, Clock, LogIn, Shield, ChevronRight, ChevronUp,
  Menu, MessageCircle, Instagram, LocateFixed, Loader2, Star, HelpCircle, Navigation, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoTP } from "@/components/LogoTP";
import { io, type Socket } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchStreetRoute } from "@/lib/routing";
import { useLeafletMap } from "@/hooks/useLeafletMap";
import { WHATSAPP_NUMERO, INSTAGRAM_URL, TARIFA_COP } from "@/lib/constants";
import type { BusLocation, Novedad } from "@/lib/types";
import { tiempoRelativo } from "@/lib/format";
import { distanciaKm, velEfectiva } from "@/lib/geo";
import { recomendarRuta, busMasCercano } from "@/lib/sugerencia";

type SheetState = "collapsed" | "half" | "full";

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
  const queryClient = useQueryClient();

  const [selectedRutaId, setSelectedRutaId] = useState<number | null>(null);
  const [etaPorParada, setEtaPorParada] = useState<Record<number, { eta: number; placa: string }>>({});
  // "Seguir mi bus": el mapa hace pan automático al bus elegido cuando se mueve.
  const [siguiendoBusId, setSiguiendoBusId] = useState<number | null>(null);
  const siguiendoBusRef = useRef<number | null>(null);
  const [novedad, setNovedad] = useState<Novedad | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [busqueda, setBusqueda] = useState("");
  // Estado real de la conexión en vivo (Socket.IO). Para no mentir con "En vivo".
  const [conectado, setConectado] = useState(true);
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
  // Guía de bienvenida: se muestra solo la primera vez (se recuerda en localStorage).
  const [showWelcome, setShowWelcome] = useState(
    () => typeof localStorage !== "undefined" && !localStorage.getItem("tp_welcome_visto"),
  );
  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem("tp_welcome_visto", "1"); } catch { /* ignore */ }
    // Tras cerrar la guía, deja la lista de rutas abierta y a la vista (móvil).
    setSheetState("full");
  };
  // Panel de ayuda "¿Cómo funciona?" — accesible en cualquier momento con el botón ?.
  const [showAyuda, setShowAyuda] = useState(false);
  // Arrastre del bottom sheet (swipe). dragOffset = px en vivo durante el gesto.
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startPx: number; moved: boolean } | null>(null);
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
  // Orden de la lista (más fácil de usar): favoritas → con buses en vivo → resto,
  // y dentro de cada grupo, alfabético.
  const rutasFiltradas = rutas
    .filter((r) => r.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => {
      const fa = favoritos.includes(a.id), fb = favoritos.includes(b.id);
      if (fa !== fb) return fa ? -1 : 1;
      const la = rutaTieneVivos(a.id), lb = rutaTieneVivos(b.id);
      if (la !== lb) return la ? -1 : 1;
      return a.nombre.localeCompare(b.nombre);
    });
  const selectedRuta = rutas.find((r) => r.id === selectedRutaId);
  const activeBuses = buses.filter((b) => b.estado === "activo");
  const demorasBuses = buses.filter((b) => b.estado === "demora");

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
                <b style="font-size:13px">${p.nombre}</b>
              </div>
              <span style="color:#94a3b8;font-size:11px">${ruta.nombre}</span>
            </div>`)
          .addTo(map);
        // Tocar una parada también selecciona su ruta (coherente con tocar un bus).
        m.on("click", () => setSelectedRutaId(ruta.id));
        stopMarkersRef.current.push({ rutaId: ruta.id, marker: m });
      });

      if (ruta.paradas.length < 2) return;
      const fallback: L.LatLngExpression[] = ruta.paradas.map((p) => [p.latitud, p.longitud]);
      const polyline = L.polyline(fallback, { color: ruta.color, weight: 5, opacity: 0.65, dashArray: "6 6", lineCap: "round", lineJoin: "round" }).addTo(map);
      routeLayersRef.current[ruta.id] = polyline;
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
    (busId: number, lat: number, lng: number, color = "#1757C2", placa = "", rutaId?: number) => {
      if (!mapRef.current) return;
      const bus = busesRef.current.find((b) => b.id === busId);
      const routeName = bus?.nombre_ruta ?? "";
      const vel = bus?.velocidad ?? 0;
      const novText = bus?.novedad ? `<span style="color:var(--tp-yellow,#F5C200)">⚠ ${bus.novedad}</span><br>` : "";
      const ocupMap: Record<string, { label: string; color: string }> = {
        vacio: { label: "Vacío", color: "#22c55e" },
        medio: { label: "Medio lleno", color: "#F5C200" },
        lleno: { label: "Lleno", color: "#ef4444" },
      };
      const ocup = bus?.ocupacion ? ocupMap[bus.ocupacion] : undefined;
      const ocupText = ocup
        ? `<span style="color:${ocup.color};font-size:12px">● Ocupación: ${ocup.label}</span><br>`
        : "";

      // Punto de estado: ámbar si tiene novedad, verde si va normal.
      const dotColor = bus?.novedad ? "#F5C200" : "#22c55e";
      const dotHtml = `<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;margin-left:3px;box-shadow:0 0 0 2px rgba(255,255,255,.55)"></span>`;
      const icon = L.divIcon({
        className: "",
        html: `<div style="display:flex;flex-direction:column;align-items:center;font-family:'Inter',system-ui,sans-serif">
            <div style="display:flex;align-items:center;gap:4px;background:${color};color:#fff;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.45);border:2px solid rgba(255,255,255,.9);letter-spacing:.4px">
              <span style="font-size:12px;line-height:1">🚌</span>${placa || "BUS"}${dotHtml}
            </div>
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${color};margin-top:-1px;filter:drop-shadow(0 2px 1px rgba(0,0,0,.3))"></div>
          </div>`,
        iconSize: [96, 38], iconAnchor: [48, 38],
      });

      const popupContent = `
        <div style="min-width:170px;font-family:'Inter',system-ui,sans-serif">
          <b style="font-size:14px;letter-spacing:0.5px">${placa || "BUS"}</b><br>
          <span style="color:#64748b;font-size:12px">${routeName}</span><br>
          ${vel > 0 ? `<span style="color:#22c55e;font-size:12px">● ${Math.round(vel)} km/h</span><br>` : ""}
          ${ocupText}
          ${novText}
          <span style="color:#94a3b8;font-size:11px">Tarifa: ${TARIFA_COP} COP</span>
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
        if (rutaId) marker.on("click", () => setSelectedRutaId((prev) => (prev === rutaId ? null : rutaId)));
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
        updateBusMarker(b.id, b.lat, b.lng, b.color_ruta ?? "#1757C2", b.placa, b.ruta_id ?? undefined);
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
    setConectado(socket.connected);
    socket.on("connect", () => setConectado(true));
    socket.on("disconnect", () => setConectado(false));
    socket.io.on("reconnect", () => setConectado(true));
    socket.on("bus:ubicacion", (data: BusLocation) => {
      const bus = busesRef.current.find((b) => b.id === data.busId);
      updateBusMarker(data.busId, data.lat, data.lng, bus?.color_ruta ?? "#1757C2", bus?.placa ?? "BUS", data.rutaId);
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
      setSheetState("half");
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); container.style.cursor = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoDestino, rutas, userPos]);

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
          <span style="font-size:28px;line-height:1;position:relative;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">📍</span>
        </div>`,
      iconSize: [40, 40], iconAnchor: [20, 36],
    });
    if (destinoMarkerRef.current) destinoMarkerRef.current.setLatLng([destino.lat, destino.lng]);
    else destinoMarkerRef.current = L.marker([destino.lat, destino.lng], { icon }).bindPopup("Tu destino").addTo(map);
  }, [destino]);

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
  const busesRutaSel = (selectedRuta ? buses : [])
    .filter((b) => b.ruta_id === selectedRuta?.id && b.estado !== "inactivo" && b.lat != null && b.lng != null)
    .map((b) => {
      const distKm = userPos ? distanciaKm(userPos.lat, userPos.lng, b.lat!, b.lng!) : null;
      const etaMin = distKm != null ? Math.max(0, Math.round((distKm / velEfectiva(b.velocidad)) * 60)) : null;
      return { bus: b, distKm, etaMin };
    })
    .sort((a, b) => (a.distKm ?? Infinity) - (b.distKm ?? Infinity));

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
    setModoDestino(true);
    setSheetState("collapsed"); // libera el mapa para tocarlo (móvil)
  };
  const limpiarDestino = () => {
    setModoDestino(false);
    setDestino(null);
    setSelectedRutaId(null);
  };

  const cycleSheet = () => {
    setSheetState((s) => s === "collapsed" ? "half" : s === "half" ? "full" : "collapsed");
  };

  const sheetTranslate = sheetState === "collapsed" ? "calc(100% - 136px)" : sheetState === "half" ? "45%" : "0%";

  // ── Arrastre del bottom sheet (swipe up/down) ──────────────────────────────
  const snapPx = (state: SheetState): number => {
    const h = window.innerHeight;
    if (state === "collapsed") return h - 136;
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
    setDragOffset(Math.min(h - 136, Math.max(0, d.startPx + delta)));
  };
  const onSheetTouchEnd = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) { setDragOffset(null); return; } // tap puro → lo maneja onClick
    suppressClickRef.current = true; // evita que el click posterior cicle el sheet
    const h = window.innerHeight;
    const current = dragOffset ?? d.startPx;
    const points: [SheetState, number][] = [["full", 0], ["half", h * 0.45], ["collapsed", h - 136]];
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
        setUserPos({ lat: latitude, lng: longitude });
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

  const fmtDist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

  // Panel "¿A dónde vas?": botón para elegir destino y la tarjeta de resultado.
  // Se muestra arriba de la lista, tanto en el sidebar de escritorio como en el sheet.
  const panelDestino = !destino ? (
    !modoDestino && (
      <button
        onClick={armarDestino}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl font-semibold text-sm transition-colors"
        style={{ background: "rgba(245,194,0,0.12)", color: "var(--tp-yellow)", border: "1px solid rgba(245,194,0,0.3)" }}
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
              : { background: "rgba(75,169,216,0.15)", color: "var(--tp-sky)" }}
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
        {/* ¿A dónde vas? — recomendación por destino */}
        <div className="mt-2.5">{panelDestino}</div>
      </div>

      {/* Lista de rutas */}
      <div className="flex-1 overflow-y-auto py-2">
        {!selectedRutaId && rutas.length > 0 && (
          <div className="mx-3 mb-1 rounded-xl border p-3 flex items-start gap-2.5"
            style={{ borderColor: "rgba(75,169,216,0.35)", background: "rgba(23,87,194,0.10)" }}>
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
              {b.novedad && <p className="mt-1" style={{ color: "var(--tp-yellow)" }}>⚠ {b.novedad}</p>}
              <button
                onClick={() => seguirBus(b.id)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-semibold transition-colors"
                style={siguiendoBusId === b.id
                  ? { background: "var(--tp-sky)", color: "#001018" }
                  : { background: "rgba(75,169,216,0.15)", color: "var(--tp-sky)" }}
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
  const MobileSheet = () => (
    <div
      className="md:hidden flex flex-col tp-bottom-sheet"
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
        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/40 mb-2.5" />
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${activeBuses.length > 0 ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
              <span className="text-sm font-semibold text-foreground">
                {activeBuses.length > 0 ? `${activeBuses.length} en vivo` : "Sin buses ahora"}
              </span>
            </div>
            {demorasBuses.length > 0 && (
              <span className="text-sm font-semibold" style={{ color: "var(--tp-yellow)" }}>· {demorasBuses.length} demora</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sheetState === "collapsed" && !selectedRutaId ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 animate-pulse"
                style={{ background: "rgba(75,169,216,0.18)", color: "var(--tp-sky)" }}>
                Elige tu ruta <ChevronUp className="w-3.5 h-3.5" />
              </span>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">{rutas.length} rutas</span>
                <ChevronUp className={`w-4 h-4 text-muted-foreground transition-transform ${sheetState === "full" ? "rotate-180" : ""}`} />
              </>
            )}
          </div>
        </div>
      </button>

      {/* Buscador SIEMPRE visible en el peek (entrada principal, tipo app de transporte) */}
      <div className="px-4 pb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onFocus={() => setSheetState("full")}
            placeholder="¿A dónde vas? Busca tu ruta"
            className="pl-10 h-11 text-base bg-background border-border rounded-xl"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Contenido del sheet (scrollable) */}
      <div className="flex-1 overflow-y-auto px-4 pb-safe min-h-0 flex flex-col">
        {/* ¿A dónde vas? — recomendación por destino */}
        {panelDestino && <div className="mb-3">{panelDestino}</div>}
        {/* Ruta seleccionada */}
        {selectedRuta && (
          <div className="mb-3 rounded-xl border p-3" style={{ borderColor: selectedRuta.color + "60", background: selectedRuta.color + "0D" }}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: selectedRuta.color }} />
                <span className="font-bold text-sm text-foreground truncate">{selectedRuta.nombre}</span>
              </div>
              <button onClick={() => setSelectedRutaId(null)} aria-label="Cerrar ruta" className="text-muted-foreground hover:text-foreground p-1 -mr-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Hero: el tiempo de llegada del próximo bus es lo principal */}
            {proximoBus ? (
              <div className="flex items-end justify-between mb-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5 text-green-400/80">Próximo bus</p>
                  {proximoBus.eta <= 0 ? (
                    <span className="text-2xl font-black text-green-400 leading-none">¡Llegando!</span>
                  ) : (
                    <span className="flex items-baseline gap-1 text-green-400">
                      <span className="text-4xl font-black leading-none">{proximoBus.eta}</span>
                      <span className="text-sm font-bold">min</span>
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs font-mono font-bold text-foreground/80 px-2 py-1 rounded-lg bg-background/50">
                  <Bus className="w-3.5 h-3.5" />{proximoBus.placa}
                </span>
              </div>
            ) : (
              <div className="mb-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground" style={{ background: "rgba(148,163,184,0.08)" }}>
                No hay buses en circulación en esta ruta ahora.
              </div>
            )}
            {selectedRuta.paradas.length > 0 && (
              <div className="mb-2">
                {selectedRuta.paradas.map((p, i, arr) => {
                  const eta = etaPorParada[p.id];
                  const first = i === 0;
                  const last = i === arr.length - 1;
                  return (
                    <div key={p.id} className="relative flex items-center gap-3 py-1">
                      {/* Línea de tiempo de la ruta (conector + punto) */}
                      <div className="relative flex flex-col items-center self-stretch w-3">
                        <div className="w-0.5 flex-1" style={{ background: first ? "transparent" : selectedRuta.color + "55" }} />
                        <div className="w-2.5 h-2.5 rounded-full ring-2 ring-background flex-shrink-0" style={{ background: selectedRuta.color }} />
                        <div className="w-0.5 flex-1" style={{ background: last ? "transparent" : selectedRuta.color + "55" }} />
                      </div>
                      <span className="flex-1 truncate text-xs text-foreground/80">{p.nombre}</span>
                      {(first || last) && (
                        <span className="text-[9px] font-bold opacity-50 flex-shrink-0">{first ? "INICIO" : "FIN"}</span>
                      )}
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
            {/* Buses de la ruta — ordenados del más cercano a mí, con ETA a mi ubicación */}
            <div className="mt-1 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {userPos ? "Buses — el más cercano a ti primero" : "Buses en circulación"}
                </span>
                {!userPos && (
                  <button onClick={locateMe} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: "var(--tp-sky)" }}>
                    <LocateFixed className="w-3 h-3" /> Usar mi ubicación
                  </button>
                )}
              </div>
              {busesRutaSel.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">No hay buses en circulación ahora.</p>
              ) : (
                <div className="space-y-1.5">
                  {busesRutaSel.map(({ bus: b, distKm, etaMin }) => (
                    <div key={b.id} className="flex items-center gap-2 py-1 text-xs">
                      <span className="font-mono font-bold text-foreground">{b.placa}</span>
                      {b.estado === "demora" && <span className="px-1.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400">demora</span>}
                      {distKm != null ? (
                        <span className="text-muted-foreground">
                          a {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`} ·{" "}
                          <span className="text-green-400 font-semibold">{etaMin === 0 ? "llegando" : `~${etaMin} min`}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">activa tu ubicación</span>
                      )}
                      <button
                        onClick={() => seguirBus(b.id)}
                        className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg font-semibold transition-colors"
                        style={siguiendoBusId === b.id
                          ? { background: "var(--tp-sky)", color: "#001018" }
                          : { background: "rgba(75,169,216,0.15)", color: "var(--tp-sky)" }}
                      >
                        <LocateFixed className="w-3 h-3" />
                        {siguiendoBusId === b.id ? "Siguiendo" : "Seguir"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lista de rutas */}
        {!selectedRutaId && rutas.length > 0 && (
          <div className="mb-3 rounded-xl border p-3 flex items-start gap-2.5"
            style={{ borderColor: "rgba(75,169,216,0.35)", background: "rgba(23,87,194,0.10)" }}>
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--tp-sky)" }} />
            <div>
              <p className="text-sm font-bold text-foreground">Elige tu ruta para empezar</p>
              <p className="text-xs text-muted-foreground mt-0.5">Toca una ruta y verás el bus en vivo y en cuántos minutos llega.</p>
              {activeBuses.length === 0 && (
                <p className="text-xs mt-1.5" style={{ color: "var(--tp-yellow)" }}>
                  Aún no hay buses en ruta — aparecerán en el mapa apenas un conductor inicie su recorrido.
                </p>
              )}
            </div>
          </div>
        )}
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
          {selectedRutaId ? "Otras rutas" : "Rutas disponibles"}
        </p>
        {rutasError ? <div className="-mx-1">{errorCarga}</div>
          : rutasLoading && rutas.length === 0 ? <div className="-mx-1">{skeletonRutas}</div>
          : rutas.length === 0 ? <p className="text-xs text-muted-foreground text-center py-6">No hay rutas configuradas todavía.</p>
          : null}
        <div className="space-y-2">
          {rutasFiltradas.filter((r) => r.id !== selectedRutaId).map((ruta) => {
            const rutaBuses = buses.filter((b) => b.ruta_id === ruta.id && b.estado !== "inactivo");
            const enVivo = rutaBuses.length > 0;
            return (
              <div
                key={ruta.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectRuta(ruta.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelectRuta(ruta.id); } }}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-card border border-border hover:border-primary/30 active:bg-primary/5 transition-all text-left active:scale-[0.98] cursor-pointer"
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
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleFavorito(ruta.id); }}
                  className="p-2 -m-1 flex-shrink-0"
                  aria-label={favoritos.includes(ruta.id) ? "Quitar de favoritas" : "Marcar como favorita"}
                >
                  <Star
                    className="w-5 h-5"
                    style={favoritos.includes(ruta.id)
                      ? { color: "var(--tp-yellow)", fill: "var(--tp-yellow)" }
                      : { color: "var(--muted-foreground, #94a3b8)" }}
                  />
                </button>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
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

        {/* Pie de marca: ancla el fondo para que el espacio sobrante no se vea vacío */}
        <div className="mt-auto pt-6 pb-8 flex flex-col items-center gap-1.5 opacity-40">
          <LogoTP size={26} />
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">
            TRANSPADILLA · RIOHACHA
          </p>
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
              <p className="text-[9px] font-semibold leading-none" style={{ color: "var(--tp-yellow)" }}>Buses en vivo · Riohacha</p>
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
              <p className="text-sm text-white/70 mb-3">En 3 pasos sabes cuándo pasa tu bus:</p>
              <div className="space-y-2.5 mb-4">
                {[
                  { n: "1", txt: "Elige tu ruta en la lista de abajo." },
                  { n: "2", txt: "Mira el bus moverse en vivo en el mapa." },
                  { n: "3", txt: "Lee cuántos minutos faltan para que llegue." },
                ].map((step) => (
                  <div key={step.n} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black text-white"
                      style={{ background: "linear-gradient(135deg, #1757C2 0%, var(--tp-sky) 100%)" }}>
                      {step.n}
                    </div>
                    <p className="text-sm text-white/90">{step.txt}</p>
                  </div>
                ))}
              </div>
              <Button
                onClick={dismissWelcome}
                className="w-full h-12 rounded-xl font-bold text-white border-0 text-base"
                style={{ background: "linear-gradient(135deg, #1757C2 0%, var(--tp-sky) 100%)" }}
              >
                Elegir mi ruta →
              </Button>
              <p className="text-[11px] text-white/40 text-center mt-2">No necesitas cuenta para ver los buses.</p>
            </div>
          </div>
        )}

        {/* Panel de ayuda "¿Cómo funciona?" */}
        {showAyuda && (
          <div className="absolute inset-0 z-[1003] flex items-end md:items-center justify-center p-3 md:p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
            <div
              className="pointer-events-auto w-full max-w-md rounded-2xl border shadow-2xl flex flex-col max-h-[85vh]"
              style={{ background: "rgba(12,18,32,0.98)", borderColor: "rgba(75,169,216,0.3)", backdropFilter: "blur(16px)" }}
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
                    { icon: <Star className="w-4 h-4" />, t: "Favoritos", d: "Marca con ⭐ tus rutas frecuentes; quedan siempre arriba." },
                    { icon: <MessageCircle className="w-4 h-4" />, t: "Atención al cliente", d: "Escríbenos por WhatsApp ante cualquier duda o reclamo." },
                  ].map((f, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(23,87,194,0.2)", color: "var(--tp-sky)" }}>
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
                <Button onClick={() => setShowAyuda(false)} className="w-full h-11 rounded-xl font-bold text-white border-0" style={{ background: "linear-gradient(135deg, #1757C2 0%, var(--tp-sky) 100%)" }}>
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
            style={{ background: "var(--tp-yellow)", color: "#1a1300", boxShadow: "0 12px 40px rgba(245,194,0,0.55)" }}
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

        {/* Botón de ayuda "¿Cómo funciona?" (móvil: sobre el peek del sheet) */}
        <button
          onClick={() => setShowAyuda(true)}
          className="absolute bottom-[262px] md:bottom-36 left-3 z-[1000] flex items-center justify-center w-11 h-11 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg hover:bg-secondary active:scale-95 transition-all"
          title="¿Cómo funciona?"
          aria-label="¿Cómo funciona?"
        >
          <HelpCircle className="w-5 h-5" style={{ color: "var(--tp-sky)" }} />
        </button>

        {/* Botón "Mi ubicación" (GPS del pasajero) */}
        <button
          onClick={locateMe}
          disabled={locating}
          className="absolute bottom-[206px] md:bottom-20 left-3 z-[1000] flex items-center justify-center w-11 h-11 bg-card/95 backdrop-blur-sm border border-border rounded-xl shadow-lg hover:bg-secondary active:scale-95 transition-all disabled:opacity-60"
          title="Centrar en mi ubicación"
          aria-label="Centrar en mi ubicación"
        >
          {locating
            ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
            : <LocateFixed className="w-5 h-5 text-primary" />}
        </button>

        {/* FAB "Elegir destino" — SOLO móvil (en desktop está en el sidebar); en la
            zona del pulgar (abajo-derecha) y siempre accesible aunque el sheet esté colapsado. */}
        <button
          onClick={destino ? limpiarDestino : armarDestino}
          className={`md:hidden absolute bottom-[150px] right-3 z-[1000] flex items-center justify-center w-12 h-12 rounded-full shadow-xl active:scale-95 transition-all border ${modoDestino ? "animate-pulse" : ""}`}
          style={ destino || modoDestino
            ? { background: "var(--tp-yellow)", color: "#1a1300", borderColor: "transparent" }
            : { background: "hsl(var(--card))", color: "var(--tp-yellow)", borderColor: "rgba(245,194,0,0.4)" } }
          title={destino ? "Quitar destino" : "¿A dónde vas? Elige tu destino"}
          aria-label={destino ? "Quitar destino" : "Elegir destino en el mapa"}
        >
          {destino ? <X className="w-5 h-5" /> : <Navigation className="w-5 h-5" />}
        </button>

        {/* Pill de carga inicial del mapa */}
        {rutasLoading && rutas.length === 0 && (
          <div className="absolute top-16 md:top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Cargando el mapa…</span>
          </div>
        )}

        {/* Aviso flotante: modo "elegir destino" armado */}
        {modoDestino && (
          <div className="absolute top-16 md:top-3 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-2 rounded-xl px-3.5 py-2 shadow-xl"
            style={{ background: "var(--tp-yellow)", color: "#1a1300" }}
          >
            <Navigation className="w-4 h-4" />
            <span className="text-xs font-bold">Toca tu destino en el mapa</span>
            <button onClick={() => setModoDestino(false)} className="ml-1 hover:opacity-70" aria-label="Cancelar">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Chip "siguiendo bus" */}
        {busSeguido && (
          <div
            className="absolute top-16 md:top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg"
            style={{ background: "var(--tp-sky)", color: "#001018" }}
          >
            <LocateFixed className="w-4 h-4 animate-pulse" />
            <span className="text-xs font-bold">Siguiendo {busSeguido.placa}</span>
            <button onClick={() => setSiguiendoBusId(null)} className="ml-1 hover:opacity-70" aria-label="Dejar de seguir">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Indicador de conexión: honesto sobre si los datos llegan en vivo. */}
        <div className="absolute bottom-[150px] md:bottom-4 left-3 z-[1000] flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg">
          <div className="relative">
            <Radio className={`w-3.5 h-3.5 ${conectado ? "text-primary" : "text-amber-500"}`} />
            <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${conectado ? "bg-green-500 animate-pulse" : "bg-amber-500"}`} />
          </div>
          <span className="text-xs text-muted-foreground font-medium">{conectado ? "En vivo" : "Reconectando…"}</span>
        </div>

        {/* FAB de soporte por WhatsApp (compacto, no compite con el mapa) */}
        <a
          href={`https://wa.me/${WHATSAPP_NUMERO}?text=Hola%20TransPadilla%2C%20necesito%20informaci%C3%B3n%20sobre%20el%20servicio`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-[206px] md:bottom-4 right-3 z-[1000] flex items-center justify-center w-12 h-12 rounded-full shadow-xl transition-transform active:scale-95 hover:scale-105"
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

      {MobileSheet()}
    </div>
  );
}
