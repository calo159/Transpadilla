import { Bus, Star, Bell, BellRing, AlertTriangle } from "lucide-react";
import type { Ruta } from "@workspace/api-client";

/**
 * Tarjeta de ruta estilo "tablero de llegadas": a la izquierda la identidad de la
 * ruta (badge + nombre), el estado en vivo y el corredor por donde pasa (mini línea
 * ●──●──● del color de la ruta); a la derecha, como el panel de una parada, el
 * tiempo GRANDE del próximo bus. Se usa igual en el sidebar de escritorio
 * (`compact`) y en las vistas móviles a pantalla completa. Presentacional puro
 * (sin fetch): recibe por props los datos ya calculados en Pasajero (buses vivos,
 * ETA, favorito, demora).
 */
export function RutaCard({
  ruta,
  vivos,
  etaMin = null,
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
  etaMin?: number | null;
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
  // "Pasa por": hasta 3 paradas representativas repartidas a lo largo del recorrido
  // (no los extremos, que en un circuito cerrado quedan en la misma zona y confunden).
  // Ayuda al usuario a reconocer "esta ruta me sirve" de un vistazo.
  const pasaPor = (() => {
    const nombres = ruta.paradas.map((p) => p.nombre).filter(Boolean) as string[];
    if (nombres.length <= 3) return nombres;
    // Posiciones ~1/6, 3/6, 5/6 del recorrido (interiores, bien repartidas).
    const idx = [0, 1, 2].map((k) => Math.round(((k + 0.5) / 3) * nombres.length));
    const elegidos: string[] = [];
    for (const i of idx) {
      const n = nombres[Math.min(i, nombres.length - 1)];
      if (n && !elegidos.includes(n)) elegidos.push(n);
    }
    return elegidos;
  })();
  const hayTrayecto = pasaPor.length > 0;
  const enVivo = vivos > 0;
  const hayEta = enVivo && etaMin != null;
  // Puntos del corredor: uno por parada representativa (mínimo 2 para que se vea "línea").
  const puntos = Math.max(2, Math.min(pasaPor.length, 3));

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

      <div className="flex items-stretch gap-3">
        {/* ── Columna izquierda: identidad + estado + corredor ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Identidad: badge + nombre */}
          <div className="flex items-center gap-2.5">
            <span
              className={`flex items-center justify-center flex-shrink-0 shadow-md ${compact ? "w-9 h-9 rounded-lg" : "w-11 h-11 rounded-xl"}`}
              style={{ background: ruta.color }}
            >
              <Bus className={compact ? "w-[18px] h-[18px] text-white" : "w-[22px] h-[22px] text-white"} />
            </span>
            <span
              className={`font-display block font-extrabold truncate ${compact ? "text-sm" : "text-lg"}`}
              style={{ color: "var(--color-navy)" }}
            >
              {ruta.nombre}
            </span>
          </div>

          {/* Estado en vivo + demora */}
          <span className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${enVivo ? "animate-pulse" : ""}`}
                style={{ background: enVivo ? "var(--color-success)" : "var(--color-gray-text)" }}
              />
              <span className={`font-bold ${compact ? "text-[11px]" : "text-xs"}`} style={{ color: enVivo ? "var(--color-success)" : "var(--color-gray-text)" }}>
                {enVivo ? `${vivos} ${vivos === 1 ? "bus" : "buses"} en vivo` : "Sin buses ahora"}
              </span>
            </span>
            {demora && (
              <span
                className="inline-flex items-center gap-1 font-bold rounded-full"
                style={{ background: "rgba(245,183,49,0.16)", color: "#9a6a00", fontSize: 11, padding: "2px 8px" }}
              >
                <AlertTriangle className="w-3 h-3" /> con demora
              </span>
            )}
          </span>

          {/* Corredor: mini línea ●──●──● del color de la ruta + nombres */}
          {hayTrayecto && (
            <div className={`flex items-center gap-2 min-w-0 ${compact ? "mt-2" : "mt-2.5"}`}>
              <span className="flex items-center flex-shrink-0" aria-hidden="true">
                {Array.from({ length: puntos }).map((_, i) => (
                  <span key={i} className="flex items-center">
                    <span className="w-2 h-2 rounded-full" style={{ background: ruta.color }} />
                    {i < puntos - 1 && <span className="block w-3 h-[3px]" style={{ background: ruta.color, opacity: 0.5 }} />}
                  </span>
                ))}
              </span>
              <p className={`truncate ${compact ? "text-[11px]" : "text-xs"}`} style={{ color: "var(--color-gray-text)" }}>
                {pasaPor.join(" · ")}
              </p>
            </div>
          )}

          {/* Nº de paradas, al pie de la columna */}
          <span className={`font-semibold ${compact ? "text-[10px] mt-1.5" : "text-[11px] mt-auto pt-2"}`} style={{ color: "var(--color-gray-text)" }}>
            {ruta.paradas.length} {ruta.paradas.length === 1 ? "parada" : "paradas"}
          </span>
        </div>

        {/* ── Columna derecha: acciones (arriba) + tablero de llegada (abajo) ── */}
        <div
          className={`flex-shrink-0 flex flex-col items-end justify-between ${compact ? "w-[64px] pl-2" : "w-[86px] pl-3"}`}
          style={{ borderLeft: "1px solid rgba(27,59,111,0.08)" }}
        >
          {/* Acciones como íconos chicos (sin etiqueta, para dar aire al ETA) */}
          <div className="flex items-center gap-0.5 -mt-0.5 -mr-1">
            {mostrarNotificar && onToggleNotificar && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleNotificar(); }}
                className="flex-shrink-0 p-1.5 rounded-full active:scale-90 transition-transform"
                aria-label={notificando ? "Quitar notificaciones de esta ruta" : "Notificarme de esta ruta"}
                aria-pressed={notificando}
              >
                {notificando
                  ? <BellRing className={compact ? "w-4 h-4" : "w-5 h-5"} style={{ color: "var(--color-gold)" }} />
                  : <Bell className={compact ? "w-4 h-4" : "w-5 h-5"} style={{ color: "#94a3b8" }} />}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleFavorito(); }}
              className="flex-shrink-0 p-1.5 rounded-full active:scale-90 transition-transform"
              aria-label={favorito ? "Quitar de favoritas" : "Marcar favorita"}
            >
              <Star className={compact ? "w-4 h-4" : "w-5 h-5"} style={favorito ? { color: "var(--color-gold)", fill: "var(--color-gold)" } : { color: "#94a3b8" }} />
            </button>
          </div>

          {/* Tablero de llegada */}
          <div className="flex flex-col items-end leading-none mt-1">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--color-gray-text)" }}>
              {hayEta ? "Próximo bus" : "Sin buses"}
            </span>
            {hayEta ? (
              etaMin! <= 0 ? (
                <span className={`font-black tabular-nums mt-0.5 ${compact ? "text-lg" : "text-[26px]"}`} style={{ color: ruta.color }}>
                  YA
                </span>
              ) : (
                <span className="flex items-baseline gap-0.5 mt-0.5">
                  <span className={`font-black tabular-nums ${compact ? "text-lg" : "text-[28px]"}`} style={{ color: ruta.color, lineHeight: 1 }}>
                    {etaMin}
                  </span>
                  <span className={`font-bold ${compact ? "text-[10px]" : "text-xs"}`} style={{ color: "var(--color-gray-text)" }}>min</span>
                </span>
              )
            ) : (
              <>
                <span className={`font-black mt-0.5 ${compact ? "text-lg" : "text-[26px]"}`} style={{ color: "#cbd5e1", lineHeight: 1 }}>—</span>
                {!compact && <span className="text-[9px] font-semibold mt-0.5" style={{ color: "var(--color-gray-text)" }}>5 am–10 pm</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
