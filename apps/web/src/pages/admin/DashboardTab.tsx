import { useEffect, useRef } from "react";
import { Bus as BusIcon, Activity, MapPin, Route, AlertTriangle, UserCheck } from "lucide-react";
import type { Bus, Ruta, Stats } from "@workspace/api-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLeafletMap } from "@/hooks/use-leaflet-map";
import { crearFlechasDireccion } from "@/lib/map-arrows";
import { cardCls, SectionHeader } from "./shared";

interface Props {
  stats: Stats | undefined;
  statsLoading: boolean;
  buses: Bus[];
  busesLoading: boolean;
  rutas: Ruta[];
  rutasLoading: boolean;
}

/**
 * Mini-mapa en vivo del dashboard (solo escritorio): rutas como líneas de color
 * (rectas entre paradas, sin seguir calles — es una referencia, no el mapa
 * detallado del pasajero) + un punto por bus con GPS activo. Reusa el mismo
 * hook de mapa (`useLeafletMap`) que ya usa ParadasTab.
 */
function DashboardMiniMap({ rutas, buses }: { rutas: Ruta[]; buses: Bus[] }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useLeafletMap(mapContainerRef, { zoom: 13 });
  const layerRef = useRef<L.LayerGroup | null>(null);

  const busesConGps = buses.filter((b) => b.lat != null && b.lng != null && b.estado !== "inactivo");
  const rutasConTrazo = rutas.filter((r) => r.paradas.length >= 2);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 80); // el tab acaba de montarse
    return () => clearTimeout(t);
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current?.remove();
    const grupo = L.layerGroup();
    rutasConTrazo.forEach((ruta) => {
      const puntos: [number, number][] = ruta.paradas
        .slice()
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map((p) => [p.latitud, p.longitud]);
      L.polyline(puntos, { color: ruta.color, weight: 4, opacity: 0.75, lineCap: "round" }).addTo(grupo);
      // Flechas que indican el sentido de circulación (orden de las paradas).
      crearFlechasDireccion(puntos, ruta.color).addTo(grupo);
    });
    busesConGps.forEach((b) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${b.color_ruta ?? "#2558A5"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      L.marker([b.lat!, b.lng!], { icon, interactive: false }).addTo(grupo);
    });
    grupo.addTo(map);
    layerRef.current = grupo;
    const todosPuntos = rutasConTrazo.flatMap((r) => r.paradas.map((p): [number, number] => [p.latitud, p.longitud]));
    if (todosPuntos.length >= 2) map.fitBounds(L.latLngBounds(todosPuntos), { padding: [24, 24] });
    return () => { grupo.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutas, buses, mapRef]);

  return (
    <div className="hidden md:block rounded-2xl overflow-hidden relative tp-shadow-card" style={{ height: 260 }}>
      <div ref={mapContainerRef} className="w-full h-full" role="application" aria-label="Mapa en vivo de la flota" />
      <div className="absolute left-3.5 top-3.5 z-[500] flex items-center gap-2 bg-white rounded-full px-3 py-1.5 tp-shadow-fab">
        <span className="tp-livedot" style={{ width: 6, height: 6, background: "var(--color-success)" }} />
        <span className="text-[11px] font-bold" style={{ color: "var(--color-navy)" }}>Mapa en vivo · {busesConGps.length} bus{busesConGps.length !== 1 ? "es" : ""}</span>
      </div>
      {rutasConTrazo.length > 0 && (
        <div className="absolute left-3.5 bottom-3.5 z-[500] flex gap-2.5 flex-wrap bg-white/90 rounded-xl px-2.5 py-2" style={{ maxWidth: "calc(100% - 28px)" }}>
          {rutasConTrazo.slice(0, 4).map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "var(--color-navy)" }}>
              <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: r.color }} />{r.nombre}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tab "Dashboard" del panel Admin: resumen de la flota, rutas y novedades. */
export default function DashboardTab({
  stats, statsLoading, buses, busesLoading, rutas, rutasLoading,
}: Props) {
  const activeBuses = buses.filter((b) => b.estado === "activo");
  const inactiveBuses = buses.filter((b) => b.estado === "inactivo");
  const demoraBuses = buses.filter((b) => b.estado === "demora");

  // Guía de primeros pasos: solo cuando aún no hay rutas (sistema recién creado).
  const sinConfigurar = !rutasLoading && rutas.length === 0;

  return (
    <div className="space-y-5">
      {sinConfigurar && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 md:p-5" style={{ background: "rgba(37,88,165,0.06)" }}>
          <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Primeros pasos
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Configura el sistema en este orden para que los pasajeros vean los buses en vivo:</p>
          <ol className="space-y-2.5">
            {[
              { n: 1, icon: <Route className="w-4 h-4" />, t: "Crea las rutas", d: "Nombre y color de cada línea (ej. Centro – Aeropuerto)." },
              { n: 2, icon: <MapPin className="w-4 h-4" />, t: "Agrega las paradas", d: "Tocando el mapa donde está cada paradero, y asígnalas a su ruta." },
              { n: 3, icon: <BusIcon className="w-4 h-4" />, t: "Registra los buses", d: "Con su placa y la ruta que cubren." },
              { n: 4, icon: <UserCheck className="w-4 h-4" />, t: "Crea los conductores", d: "Su cuenta de acceso y asígnale un bus a cada uno." },
            ].map((s) => (
              <li key={s.n} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black text-white" style={{ background: "var(--color-blue, #2558A5)" }}>{s.n}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">{s.icon}{s.t}</p>
                  <p className="text-xs text-muted-foreground">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {/* Banda hero institucional: las cifras clave en vivo como una tira con
          divisores (no mosaicos), sobre el navy de marca con halo dorado. */}
      <div className="tp-admin-hero p-5 md:px-7 md:py-6">
        <div className="flex items-center gap-2 mb-4 relative">
          <span className="tp-livedot" style={{ width: 7, height: 7, background: "var(--color-gold)" }} />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Estado del sistema en vivo</span>
        </div>
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-y-5 relative">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="lg:pl-5 lg:first:pl-0">
                <div className="h-9 w-16 rounded bg-white/15 animate-pulse" />
                <div className="h-3 w-20 rounded bg-white/10 mt-2.5 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-y-5 relative">
            {[
              { label: "Total buses", value: stats?.totalBuses ?? 0,     hi: false },
              { label: "Activos",     value: stats?.busesActivos ?? 0,   hi: true },
              { label: "Con demora",  value: stats?.busesConDemora ?? 0, hi: false },
              { label: "Rutas",       value: stats?.totalRutas ?? 0,     hi: false },
              { label: "Paradas",     value: stats?.totalParadas ?? 0,   hi: false },
            ].map((s) => (
              <div key={s.label} className="lg:border-l lg:border-white/[0.14] lg:pl-5 lg:first:border-l-0 lg:first:pl-0">
                <p className="font-display text-3xl md:text-4xl font-extrabold leading-none" style={{ color: s.hi ? "var(--color-gold)" : "#fff" }}>{s.value}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mt-2">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mapa en vivo (solo escritorio) */}
      {!rutasLoading && rutas.length > 0 && <DashboardMiniMap rutas={rutas} buses={buses} />}

      <div className="tp-stagger grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Estado de la flota */}
        <div className={cardCls}>
          <SectionHeader icon={<BusIcon className="w-4 h-4 text-primary" />} title="Estado de la flota" />
          {busesLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted/40 rounded-lg animate-pulse" />)}</div>
          ) : buses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay buses registrados</p>
          ) : (
            <div className="space-y-2">
              {[
                { label: "Activos",    items: activeBuses,   style: "border-green-500/20 bg-green-500/5 text-green-400" },
                { label: "Con demora", items: demoraBuses,   style: "border-amber-500/20 bg-amber-500/5 text-amber-400" },
                { label: "Inactivos",  items: inactiveBuses, style: "border-border bg-muted/5 text-muted-foreground" },
              ].filter((g) => g.items.length > 0).map((group) => (
                <div key={group.label} className={`border rounded-xl p-3 ${group.style}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">{group.label}</span>
                    <span className="text-xl font-black">{group.items.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map((b) => (
                      <span key={b.id} className="text-xs font-mono bg-black/20 px-2 py-0.5 rounded-md">{b.placa}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rutas activas */}
        <div className={cardCls}>
          <SectionHeader icon={<Route className="w-4 h-4 text-purple-400" />} title="Rutas activas" />
          {rutasLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted/40 rounded-lg animate-pulse" />)}</div>
          ) : rutas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay rutas configuradas</p>
          ) : (
            <div className="space-y-2 max-h-56 lg:max-h-72 overflow-y-auto">
              {rutas.map((ruta) => {
                const rb = buses.filter((b) => b.ruta_id === ruta.id);
                return (
                  <div key={ruta.id} className="flex items-center gap-3 p-2.5 bg-secondary/30 rounded-xl">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: ruta.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{ruta.nombre}</p>
                      <p className="text-xs text-muted-foreground">{ruta.paradas.length} paradas{rb.length > 0 ? ` · ${rb.length} bus${rb.length !== 1 ? "es" : ""}` : ""}</p>
                    </div>
                    {rb.some((b) => b.estado === "activo") && (
                      <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-md font-bold flex-shrink-0">En línea</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Novedades activas */}
      {buses.filter((b) => b.novedad).length > 0 && (
        <div className={cardCls} style={{ borderColor: "rgba(245,183,49,0.3)", background: "rgba(245,183,49,0.05)" }}>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3" style={{ color: "var(--tp-yellow)" }}>
            <AlertTriangle className="w-4 h-4" /> Novedades activas
          </h3>
          <div className="space-y-2">
            {buses.filter((b) => b.novedad).map((b) => (
              <div key={b.id} className="flex items-start gap-2 text-sm">
                <span className="font-mono font-bold flex-shrink-0" style={{ color: "var(--tp-yellow)" }}>{b.placa}</span>
                <span className="text-foreground/80">{b.novedad}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
