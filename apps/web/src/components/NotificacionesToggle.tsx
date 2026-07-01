import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import {
  pushSoportado, pushDisponibleEnServidor, estadoSuscripcion,
  activarNotificaciones, desactivarNotificaciones, actualizarRutas,
} from "@/lib/push";
import { useToast } from "@/hooks/use-toast";

/**
 * Activar/desactivar notificaciones push de las rutas favoritas (sin cuenta).
 * Solo aparece si el navegador lo soporta Y el servidor tiene el push habilitado
 * (claves VAPID) — así nunca es un botón "muerto".
 *
 * variant "menu" → fila completa (menú ☰ móvil).  "pill" → botón compacto (sidebar).
 */
export function NotificacionesToggle({ rutas, variant = "menu" }: { rutas: number[]; variant?: "menu" | "pill" }) {
  const { toast } = useToast();
  const [disponible, setDisponible] = useState(false);
  const [activo, setActivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const rutasRef = useRef(rutas);
  rutasRef.current = rutas;

  useEffect(() => {
    if (!pushSoportado()) return;
    void pushDisponibleEnServidor().then(async (ok) => {
      setDisponible(ok);
      if (ok) setActivo(await estadoSuscripcion());
    });
  }, []);

  // Si está activo y cambian los favoritos, re-sincroniza las rutas seguidas.
  useEffect(() => {
    if (activo) void actualizarRutas(rutas);
  }, [rutas, activo]);

  if (!disponible) return null; // no soportado o servidor sin push → no se muestra

  const toggle = async () => {
    setCargando(true);
    try {
      if (activo) {
        await desactivarNotificaciones();
        setActivo(false);
        toast({ title: "Notificaciones desactivadas" });
      } else {
        if (rutasRef.current.length === 0) {
          toast({ title: "Marca una ruta como favorita ⭐ para recibir sus avisos", variant: "destructive" });
          return;
        }
        const r = await activarNotificaciones(rutasRef.current);
        setActivo(r.ok);
        if (r.ok) {
          toast({ title: "Notificaciones activadas", description: "Te avisaremos de tus rutas favoritas." });
        } else if (r.motivo === "permiso-denegado") {
          toast({ title: "Permiso denegado", description: "Activa las notificaciones en tu navegador.", variant: "destructive" });
        } else {
          toast({ title: "No se pudo activar", description: "Inténtalo de nuevo más tarde.", variant: "destructive" });
        }
      }
    } finally {
      setCargando(false);
    }
  };

  const Icono = cargando ? Loader2 : activo ? BellRing : Bell;
  const iconoCls = `w-5 h-5 flex-shrink-0 ${cargando ? "animate-spin" : ""}`;

  // ── Variante "menu": fila completa, igual que los demás ítems del menú ──
  if (variant === "menu") {
    return (
      <button
        onClick={toggle}
        disabled={cargando}
        aria-label={activo ? "Desactivar notificaciones de tus rutas" : "Activar notificaciones de tus rutas"}
        aria-pressed={activo}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-t border-gray-100 active:bg-gray-100 disabled:opacity-60"
      >
        <Icono className={iconoCls} style={{ color: activo ? "var(--color-gold)" : "var(--color-sky)" }} />
        <span className="min-w-0">
          <span className="block font-semibold text-sm" style={{ color: "var(--color-navy)" }}>
            {activo ? "Notificaciones activadas" : "Notificarme"}
          </span>
          <span className="block text-[11px]" style={{ color: "var(--color-gray-text)" }}>
            {activo ? "Avisos de tus rutas favoritas" : "Recibe avisos de tus rutas favoritas"}
          </span>
        </span>
      </button>
    );
  }

  // ── Variante "pill": botón compacto para el sidebar de escritorio ──
  return (
    <button
      onClick={toggle}
      disabled={cargando}
      aria-label={activo ? "Desactivar notificaciones de tus rutas" : "Activar notificaciones de tus rutas"}
      aria-pressed={activo}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
      style={activo
        ? { background: "rgba(245,183,49,0.18)", color: "var(--tp-gold-ink)" }
        : { background: "#fff", border: "1px solid #e5e7eb", color: "var(--color-navy)" }}
      title={activo ? "Notificaciones activadas" : "Recibir avisos de tus rutas favoritas"}
    >
      <Icono className={`w-3.5 h-3.5 ${cargando ? "animate-spin" : ""}`} style={activo ? { color: "var(--tp-gold-ink)" } : undefined} />
      {activo ? "Notificaciones on" : "Notificarme"}
    </button>
  );
}
