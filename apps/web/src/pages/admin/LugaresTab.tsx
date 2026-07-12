import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPinned, Plus, Pencil, Trash2, EyeOff } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLeafletMap } from "@/hooks/use-leaflet-map";
import { apiFetch } from "@/lib/api";
import { escHtml } from "@/lib/html";
import type { ConfirmOpts } from "@/components/ConfirmDialog";
import type { PromptOpts } from "@/components/PromptDialog";
import { inputCls, cardCls, SectionHeader } from "./shared";

interface Lugar {
  id: number;
  nombre: string;
  categoria: string | null;
  latitud: number;
  longitud: number;
  activo: boolean;
}

interface Props {
  setConfirmar: (opts: ConfirmOpts) => void;
  setRenombrar: (opts: PromptOpts) => void;
}

const LUGARES_KEY = ["lugares-admin"] as const;

/**
 * Tab "Lugares": puntos de interés (hospital, mercado, terminal…) que el pasajero
 * puede buscar como DESTINO para que la app le recomiende la mejor ruta. El admin
 * crea cada uno tocando el mapa (mismo selector que Paradas), lo activa/desactiva,
 * lo renombra o lo elimina. Usa apiFetch directo (endpoints /api/lugares).
 */
export default function LugaresTab({ setConfirmar, setRenombrar }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lugares = [] } = useQuery({
    queryKey: LUGARES_KEY,
    queryFn: async (): Promise<Lugar[]> => {
      const res = await apiFetch("/api/lugares/todos");
      if (!res.ok) throw new Error("No se pudieron cargar los lugares");
      return res.json();
    },
  });

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [guardando, setGuardando] = useState(false);

  // ── Mini-mapa selector: el admin toca un punto y esa es la ubicación del lugar ──
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useLeafletMap(mapContainerRef, { zoom: 13 });
  const nuevoMarkerRef = useRef<L.Marker | null>(null);
  const lugaresLayerRef = useRef<L.LayerGroup | null>(null);

  // Clic en el mapa → fija la ubicación del nuevo lugar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 80);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    const onClick = (e: L.LeafletMouseEvent) => {
      setLat(e.latlng.lat.toFixed(6));
      setLng(e.latlng.lng.toFixed(6));
      const icon = L.divIcon({
        className: "",
        html: `<div style="line-height:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))"><svg width="26" height="26" viewBox="0 0 24 24" fill="#F5B731" stroke="#1B3B6F" stroke-width="1.5"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.5" fill="#1B3B6F" stroke="none"/></svg></div>`,
        iconSize: [26, 26], iconAnchor: [13, 26],
      });
      if (nuevoMarkerRef.current) nuevoMarkerRef.current.setLatLng(e.latlng);
      else nuevoMarkerRef.current = L.marker(e.latlng, { icon }).addTo(map);
      map.panTo(e.latlng);
    };
    map.on("click", onClick);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); map.off("click", onClick); };
  }, [mapRef]);

  // Dibuja los lugares existentes como referencia (puntos pequeños, no interactivos).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    lugaresLayerRef.current?.remove();
    const grupo = L.layerGroup();
    lugares.forEach((l) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${l.activo ? "#38A169" : "#94a3b8"};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5],
      });
      L.marker([l.latitud, l.longitud], { icon, interactive: false }).bindTooltip(escHtml(l.nombre)).addTo(grupo);
    });
    grupo.addTo(map);
    lugaresLayerRef.current = grupo;
    return () => { grupo.remove(); };
  }, [lugares, mapRef]);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: LUGARES_KEY });
    queryClient.invalidateQueries({ queryKey: ["lugares"] }); // caché público del pasajero
  };

  const crear = async () => {
    if (!nombre.trim()) { toast({ title: "Escribe el nombre del lugar", variant: "destructive" }); return; }
    if (!lat || !lng) { toast({ title: "Toca el mapa para ubicar el lugar", variant: "destructive" }); return; }
    const latNum = parseFloat(lat); const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) { toast({ title: "Ubicación inválida; vuelve a tocar el mapa", variant: "destructive" }); return; }
    setGuardando(true);
    try {
      const res = await apiFetch("/api/lugares", {
        method: "POST",
        body: JSON.stringify({ nombre: nombre.trim(), categoria: categoria.trim() || undefined, latitud: latNum, longitud: lngNum }),
      });
      if (!res.ok) throw new Error();
      refrescar();
      setNombre(""); setCategoria(""); setLat(""); setLng("");
      nuevoMarkerRef.current?.remove(); nuevoMarkerRef.current = null;
      toast({ title: "Lugar creado" });
    } catch {
      toast({ title: "Error al crear el lugar", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async (l: Lugar) => {
    try {
      const res = await apiFetch(`/api/lugares/${l.id}`, { method: "PATCH", body: JSON.stringify({ activo: !l.activo }) });
      if (!res.ok) throw new Error();
      refrescar();
      toast({ title: l.activo ? "Lugar ocultado a los pasajeros" : "Lugar visible para los pasajeros" });
    } catch {
      toast({ title: "Error al actualizar el lugar", variant: "destructive" });
    }
  };

  const renombrar = (l: Lugar) => {
    setRenombrar({
      titulo: "Renombrar lugar",
      etiqueta: "Nuevo nombre del lugar",
      valorInicial: l.nombre,
      onGuardar: async (nuevo) => {
        if (nuevo === l.nombre) return;
        try {
          const res = await apiFetch(`/api/lugares/${l.id}`, { method: "PATCH", body: JSON.stringify({ nombre: nuevo }) });
          if (!res.ok) throw new Error();
          refrescar();
          toast({ title: "Lugar renombrado" });
        } catch {
          toast({ title: "Error al renombrar el lugar", variant: "destructive" });
        }
      },
    });
  };

  const eliminar = (l: Lugar) => {
    setConfirmar({
      titulo: "Eliminar lugar",
      descripcion: `¿Eliminar "${l.nombre}"? Los pasajeros ya no podrán buscarlo como destino.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
      accion: async () => {
        try {
          const res = await apiFetch(`/api/lugares/${l.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          refrescar();
          toast({ title: `"${l.nombre}" eliminado` });
        } catch {
          toast({ title: "Error al eliminar el lugar", variant: "destructive" });
        }
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className={cardCls}>
        <SectionHeader icon={<Plus className="w-4 h-4 text-primary" />} title="Nuevo lugar" />
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5">Nombre del lugar</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Hospital, Mercado Nuevo, Universidad" maxLength={100} className={inputCls} />
          </div>
          <div>
            <Label className="text-xs mb-1.5">Categoría (opcional)</Label>
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej: Salud, Comercio, Transporte" maxLength={40} className={inputCls} />
          </div>
          <div>
            <Label className="text-xs mb-1.5 flex items-center gap-1.5">
              <MapPinned className="w-3.5 h-3.5 text-sky-400" /> Ubicación — toca el mapa donde está el lugar
            </Label>
            <div className="relative">
              <div
                ref={mapContainerRef}
                className="w-full h-64 lg:h-[420px] rounded-xl overflow-hidden border border-border"
              />
              {!(lat && lng) && (
                <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-md animate-pulse" style={{ background: "var(--color-navy, #1B3B6F)", color: "#fff" }}>
                  <MapPinned className="w-3.5 h-3.5" /> Toca el mapa para ubicar el lugar
                </div>
              )}
            </div>
          </div>
          {lat && lng ? (
            <p className="text-xs text-muted-foreground">
              Punto elegido: <span className="font-mono text-foreground">{lat}, {lng}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Aún no has elegido un punto. Toca el mapa para ubicar el lugar (los puntos verdes son los lugares ya creados).
            </p>
          )}
          <Button onClick={crear} disabled={guardando} className="w-full h-11 rounded-xl">
            <Plus className="w-4 h-4 mr-2" />{guardando ? "Creando..." : "Crear lugar"}
          </Button>
        </div>
      </div>

      <div className={cardCls}>
        <SectionHeader icon={<MapPinned className="w-4 h-4 text-sky-400" />} title="Lugares registrados" count={`${lugares.length} en total`} />
        {lugares.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center bg-muted/40">
              <MapPinned className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Aún no hay lugares</p>
            <p className="text-xs text-muted-foreground mt-0.5">Crea el primero tocando el mapa de la izquierda. Los pasajeros podrán buscarlo como destino.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] lg:max-h-[calc(100vh-14rem)] overflow-y-auto">
            {lugares.map((l) => (
              <div key={l.id} className="flex items-start gap-3 p-3 bg-secondary/30 border border-border rounded-xl" style={{ opacity: l.activo ? 1 : 0.6 }}>
                <MapPinned className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    {l.nombre}
                    {!l.activo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">oculto</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {l.categoria ? <span className="font-medium">{l.categoria} · </span> : null}
                    <span className="font-mono">{l.latitud.toFixed(5)}, {l.longitud.toFixed(5)}</span>
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => toggleActivo(l)} className="h-9 w-9 p-0 text-muted-foreground hover:text-primary flex-shrink-0" title={l.activo ? "Ocultar a los pasajeros" : "Mostrar a los pasajeros"}>
                  <EyeOff className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => renombrar(l)} className="h-9 w-9 p-0 text-muted-foreground hover:text-primary flex-shrink-0" title="Renombrar lugar">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => eliminar(l)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" title="Eliminar lugar">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
