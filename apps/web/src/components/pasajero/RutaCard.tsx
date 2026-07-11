import { Bus, Star, Bell, BellRing, ChevronRight, AlertTriangle } from "lucide-react";
import type { Ruta } from "@workspace/api-client";

/**
 * Tarjeta de ruta estilo "transit" (Moovit/Transit): rail del color de la ruta,
 * badge de línea, estado en vivo con pulso, y el TRAYECTO origen ●───● destino en
 * el color de la ruta. Se usa igual en el sidebar de escritorio (`compact`) y en
 * las vistas móviles a pantalla completa. Presentacional puro (sin fetch): recibe
 * por props los datos ya calculados en Pasajero (buses vivos, favorito, demora).
 */
export function RutaCard({
  ruta,
  vivos,
  demora = false,
  favorito,
  onSelect,
  onToggleFavorito,
  notificando = false,
  onToggleNotificar,
  mostrarNotificar = true,
  selected = false,
  dimmed = false,
  compact = false,
}: {
  ruta: Ruta;
  vivos: number;
  demora?: boolean;
  favorito: boolean;
  onSelect: () => void;
  onToggleFavorito: () => void;
  notificando?: boolean;
  onToggleNotificar?: () => void;
  mostrarNotificar?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  compact?: boolean;
}) {
  const origen = ruta.paradas[0]?.nombre;
  const destino = ruta.paradas[ruta.paradas.length - 1]?.nombre;
  const hayTrayecto = ruta.paradas.length >= 2 && !!origen && !!destino;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className={`group relative w-full overflow-hidden cursor-pointer transition-all duration-200 active:scale-[0.98] hover:-translate-y-0.5 ${compact ? "rounded-xl" : "rounded-2xl"}`}
      style={{
        background: `linear-gradient(100deg, ${ruta.color}14 0%, #ffffff 62%)`,
        boxShadow: selected ? `0 0 0 2px ${ruta.color}, 0 8px 20px ${ruta.color}22` : "0 6px 16px rgba(27,59,111,0.10)",
        opacity: dimmed ? 0.5 : 1,
        padding: compact ? "12px 12px 12px 16px" : "14px 14px 14px 18px",
      }}
    >
      {/* Rail lateral del color de la ruta */}
      <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: ruta.color }} />

      {/* Fila superior: badge + nombre + estado */}
      <div className="flex items-center gap-3">
        <span
          className={`flex items-center justify-center flex-shrink-0 shadow-md ${compact ? "w-9 h-9 rounded-lg" : "w-11 h-11 rounded-xl"}`}
          style={{ background: ruta.color }}
        >
          <Bus className={compact ? "w-[18px] h-[18px] text-white" : "w-[22px] h-[22px] text-white"} />
        </span>
        <div className="flex-1 min-w-0">
          <span
            className={`font-display block font-bold truncate ${compact ? "text-sm" : "text-[17px]"}`}
            style={{ color: "var(--color-navy)" }}
          >
            {ruta.nombre}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            <EstadoPill vivos={vivos} compact={compact} />
            {demora && (
              <span
                className="inline-flex items-center gap-1 font-bold rounded-full"
                style={{ background: "rgba(245,183,49,0.16)", color: "#9a6a00", fontSize: 11, padding: "2px 8px" }}
              >
                <AlertTriangle className="w-3 h-3" /> con demora
              </span>
            )}
          </span>
        </div>
        {mostrarNotificar && onToggleNotificar && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleNotificar(); }}
            className={`flex-shrink-0 rounded-full active:scale-90 transition-transform ${compact ? "p-1.5" : "p-2.5"}`}
            aria-label={notificando ? "Quitar notificaciones de esta ruta" : "Notificarme de esta ruta"}
            aria-pressed={notificando}
          >
            {notificando
              ? <BellRing className={compact ? "w-5 h-5" : "w-6 h-6"} style={{ color: "var(--color-gold)" }} />
              : <Bell className={compact ? "w-5 h-5" : "w-6 h-6"} style={{ color: "#cbd5e1" }} />}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorito(); }}
          className={`flex-shrink-0 rounded-full active:scale-90 transition-transform ${compact ? "p-1.5 -mr-0.5" : "p-2.5 -mr-1"}`}
          aria-label={favorito ? "Quitar de favoritas" : "Marcar favorita"}
        >
          <Star className={compact ? "w-5 h-5" : "w-6 h-6"} style={favorito ? { color: "var(--color-gold)", fill: "var(--color-gold)" } : { color: "#cbd5e1" }} />
        </button>
      </div>

      {/* Trayecto: origen ●───● destino (en el color de la ruta) */}
      {hayTrayecto ? (
        <div className={compact ? "mt-2.5 pl-0.5" : "mt-3 pl-0.5"}>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ruta.color, boxShadow: `0 0 0 3px ${ruta.color}22` }} />
            <span className="flex-1 h-[3px] rounded-full" style={{ background: `linear-gradient(90deg, ${ruta.color}, ${ruta.color}66)` }} />
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "#fff", border: `2.5px solid ${ruta.color}` }} />
          </div>
          <div className="flex justify-between mt-1.5 gap-2" style={{ color: "var(--color-gray-text)" }}>
            <span className={`truncate max-w-[46%] font-medium ${compact ? "text-[11px]" : "text-xs"}`}>{origen}</span>
            <span className={`truncate max-w-[46%] text-right font-medium ${compact ? "text-[11px]" : "text-xs"}`}>{destino}</span>
          </div>
        </div>
      ) : (
        <div className={compact ? "mt-2" : "mt-2.5"} />
      )}

      {/* Fila meta: paradas + chevron */}
      <div className="mt-2 flex items-center justify-between">
        <span className={`font-semibold ${compact ? "text-[11px]" : "text-xs"}`} style={{ color: "var(--color-gray-text)" }}>
          {ruta.paradas.length} {ruta.paradas.length === 1 ? "parada" : "paradas"}
        </span>
        <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: "#cbd5e1" }} />
      </div>
    </div>
  );
}

/** Pill de estado en vivo: "X en vivo" (verde, pulso) o "Sin buses" (gris). */
function EstadoPill({ vivos, compact }: { vivos: number; compact: boolean }) {
  const hay = vivos > 0;
  return (
    <span
      className="inline-flex items-center gap-1.5 font-bold rounded-full"
      style={{
        fontSize: 11,
        padding: compact ? "2px 7px" : "3px 9px",
        background: hay ? "rgba(56,161,105,0.14)" : "rgba(107,114,128,0.12)",
        color: hay ? "var(--color-success)" : "var(--color-gray-text)",
      }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${hay ? "animate-pulse" : ""}`}
        style={{ background: hay ? "var(--color-success)" : "var(--color-gray-text)" }}
      />
      {hay ? `${vivos} en vivo` : "Sin buses"}
    </span>
  );
}
