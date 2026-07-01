import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import {
  pushSoportado, estadoSuscripcion, activarNotificaciones,
  desactivarNotificaciones, actualizarRutas,
} from "@/lib/push";

/**
 * Botón para activar/desactivar notificaciones push de las rutas favoritas.
 * No requiere cuenta: se identifica por la suscripción del navegador.
 */
export function NotificacionesToggle({ rutas, compacto }: { rutas: number[]; compacto?: boolean }) {
  const [soportado] = useState(() => pushSoportado());
  const [activo, setActivo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const rutasRef = useRef(rutas);
  rutasRef.current = rutas;

  useEffect(() => { void estadoSuscripcion().then(setActivo); }, []);

  // Si está activo y cambian los favoritos, re-sincroniza las rutas seguidas.
  useEffect(() => {
    if (activo) void actualizarRutas(rutas);
  }, [rutas, activo]);

  if (!soportado) return null;

  const toggle = async () => {
    setCargando(true);
    try {
      if (activo) {
        await desactivarNotificaciones();
        setActivo(false);
      } else {
        const r = await activarNotificaciones(rutasRef.current);
        setActivo(r.ok);
        if (!r.ok && r.motivo === "permiso-denegado") {
          alert("Activa el permiso de notificaciones en tu navegador para recibir avisos.");
        } else if (!r.ok && r.motivo === "servidor-sin-vapid") {
          alert("Las notificaciones aún no están habilitadas en el servidor.");
        }
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={cargando}
      aria-label={activo ? "Desactivar notificaciones de tus rutas" : "Activar notificaciones de tus rutas"}
      aria-pressed={activo}
      className={`flex items-center gap-2 rounded-xl transition-colors ${compacto ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"} font-semibold`}
      style={activo
        ? { background: "rgba(245,183,49,0.18)", color: "#9a6a00" }
        : { background: "var(--color-secondary, #eef2f7)", color: "var(--color-navy, #1B3B6F)" }}
      title={activo ? "Notificaciones activadas" : "Recibir avisos de tus rutas favoritas"}
    >
      {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : activo ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      {activo ? "Notificaciones activadas" : "Notificarme"}
    </button>
  );
}
