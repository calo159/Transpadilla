import { Star, Bell, BellRing } from "lucide-react";
import type { Ruta } from "@workspace/api-client";

/**
 * Fila plana de ruta para el sidebar de escritorio: punto de color, nombre,
 * estado en vivo, ETA aproximada y favorito — una sola línea de lectura rápida,
 * sin el gradiente/rail de `RutaCard` (pensado para tarjetas más grandes en
 * móvil). Presentacional puro: recibe todo por props.
 */
export function RouteRow({
  ruta,
  vivos,
  etaMin,
  favorito,
  selected,
  onSelect,
  onToggleFavorito,
  notificando = false,
  onToggleNotificar,
  mostrarNotificar = true,
}: {
  ruta: Ruta;
  vivos: number;
  etaMin: number | null;
  favorito: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorito: () => void;
  notificando?: boolean;
  onToggleNotificar?: () => void;
  mostrarNotificar?: boolean;
}) {
  const enVivo = vivos > 0;
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-2.5 px-[11px] py-2.5 rounded-xl text-left transition-colors"
      style={{
        background: selected ? ruta.color + "14" : "#fff",
        border: `1px solid ${selected ? ruta.color + "55" : "#eef2f7"}`,
      }}
    >
      <span className="w-[11px] h-[11px] rounded flex-shrink-0" style={{ background: ruta.color, opacity: enVivo ? 1 : 0.4 }} />
      <span className="flex-1 min-w-0">
        <span className="font-display block text-xs font-bold truncate" style={{ color: "var(--color-navy)" }}>{ruta.nombre}</span>
        <span className="block text-[9px] font-semibold truncate mt-0.5" style={{ color: enVivo ? "#2f8a56" : "#a6b0bf" }}>
          {enVivo ? `${vivos} bus${vivos > 1 ? "es" : ""} en vivo` : "sin buses ahora"}
        </span>
      </span>
      <span className="font-display text-[11px] font-bold flex-shrink-0" style={{ color: enVivo && etaMin != null ? ruta.color : "#c3ccd9" }}>
        {etaMin == null || !enVivo ? "—" : etaMin <= 0 ? "llegando" : `${etaMin} min`}
      </span>
      {mostrarNotificar && onToggleNotificar && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggleNotificar(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggleNotificar(); } }}
          className="p-0.5 flex-shrink-0 rounded-full"
          aria-label={notificando ? "Quitar notificaciones de esta ruta" : "Notificarme de esta ruta"}
          aria-pressed={notificando}
        >
          {notificando
            ? <BellRing className="w-[17px] h-[17px]" style={{ color: "var(--color-gold)" }} />
            : <Bell className="w-[17px] h-[17px]" style={{ color: "#c3ccd9" }} />}
        </span>
      )}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onToggleFavorito(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggleFavorito(); } }}
        className="p-0.5 flex-shrink-0 rounded-full"
        aria-label={favorito ? "Quitar de favoritas" : "Marcar favorita"}
      >
        <Star className="w-[17px] h-[17px]" style={favorito ? { color: "var(--color-gold)", fill: "var(--color-gold)" } : { color: "#c3ccd9" }} />
      </span>
    </button>
  );
}
