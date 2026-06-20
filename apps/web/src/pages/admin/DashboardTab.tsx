import { Bus as BusIcon, Activity, Clock, Map, MapPin, Route, AlertTriangle } from "lucide-react";
import type { Bus, Ruta, Stats } from "@workspace/api-client";

interface Props {
  stats: Stats | undefined;
  statsLoading: boolean;
  buses: Bus[];
  busesLoading: boolean;
  rutas: Ruta[];
  rutasLoading: boolean;
}

/** Tab "Dashboard" del panel Admin: resumen de la flota, rutas y novedades. */
export default function DashboardTab({
  stats, statsLoading, buses, busesLoading, rutas, rutasLoading,
}: Props) {
  const activeBuses = buses.filter((b) => b.estado === "activo");
  const inactiveBuses = buses.filter((b) => b.estado === "inactivo");
  const demoraBuses = buses.filter((b) => b.estado === "demora");

  return (
    <div className="space-y-5">
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-muted rounded mb-3 w-1/2" /><div className="h-7 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Total Buses",  value: stats?.totalBuses ?? 0,     icon: <BusIcon className="w-5 h-5" />,  tint: "#4BA9D8" },
            { label: "Activos",      value: stats?.busesActivos ?? 0,   icon: <Activity className="w-5 h-5" />, tint: "#22c55e" },
            { label: "Con Demora",   value: stats?.busesConDemora ?? 0, icon: <Clock className="w-5 h-5" />,    tint: "#F5C200" },
            { label: "Rutas",        value: stats?.totalRutas ?? 0,     icon: <Map className="w-5 h-5" />,      tint: "#a78bfa" },
            { label: "Paradas",      value: stats?.totalParadas ?? 0,   icon: <MapPin className="w-5 h-5" />,   tint: "#38bdf8" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-4 transition-colors hover:border-primary/40">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ background: `${stat.tint}1f`, color: stat.tint }}
              >
                {stat.icon}
              </div>
              <p className="text-2xl md:text-3xl font-black leading-none" style={{ color: stat.tint }}>
                {stat.value}
              </p>
              <span className="text-xs font-medium text-muted-foreground mt-1.5 block">{stat.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Estado de la flota */}
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BusIcon className="w-4 h-4 text-primary" /> Estado de la flota
          </h3>
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
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Route className="w-4 h-4 text-purple-400" /> Rutas activas
          </h3>
          {rutasLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-10 bg-muted/40 rounded-lg animate-pulse" />)}</div>
          ) : rutas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay rutas configuradas</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
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
        <div className="rounded-xl p-4 md:p-5 border" style={{ borderColor: "rgba(245,194,0,0.3)", background: "rgba(245,194,0,0.05)" }}>
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
