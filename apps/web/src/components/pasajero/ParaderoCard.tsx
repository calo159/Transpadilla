import { MapPin, ChevronRight } from "lucide-react";
import type { Ruta, Parada } from "@workspace/api-client";

/**
 * Tarjeta de paradero estilo "transit": el nombre del paradero + CHIPS de las
 * líneas (rutas) que pasan por él, cada una en su color, y la distancia a pie.
 * Presentacional puro. Reemplaza el texto plano "N rutas · nombres".
 */
export function ParaderoCard({
  parada,
  rutas,
  dist,
  onSelect,
}: {
  parada: Parada;
  rutas: Ruta[];
  dist: number | null;
  onSelect: () => void;
}) {
  const color = rutas[0]?.color ?? "var(--color-sky)";
  const MAX_CHIPS = 4;
  const visibles = rutas.slice(0, MAX_CHIPS);
  const extra = rutas.length - visibles.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className="relative w-full overflow-hidden rounded-2xl p-4 pl-5 cursor-pointer transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5"
      style={{ background: "#fff", boxShadow: "0 6px 16px rgba(27,59,111,0.10)" }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} />
      <div className="flex items-center gap-4">
        <span
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
          style={{ background: typeof color === "string" && color.startsWith("#") ? color + "22" : "rgba(123,184,213,0.18)" }}
        >
          <MapPin className="w-6 h-6" style={{ color }} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="block text-base font-bold truncate" style={{ color: "var(--color-navy)" }}>{parada.nombre}</span>
          <span className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {visibles.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded-full font-bold text-white max-w-[120px]"
                style={{ background: r.color, fontSize: 10.5, padding: "2px 8px" }}
                title={r.nombre}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />
                <span className="truncate">{r.nombre}</span>
              </span>
            ))}
            {extra > 0 && (
              <span
                className="inline-flex items-center rounded-full font-bold"
                style={{ background: "rgba(107,114,128,0.14)", color: "var(--color-gray-text)", fontSize: 10.5, padding: "2px 8px" }}
              >
                +{extra}
              </span>
            )}
          </span>
        </div>
        {dist != null && (
          <span
            className="text-xs font-bold flex-shrink-0 px-2.5 py-1 rounded-full"
            style={{ background: "rgba(245,183,49,0.18)", color: "#9a6a00" }}
          >
            {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
          </span>
        )}
        <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: "#cbd5e1" }} />
      </div>
    </div>
  );
}
