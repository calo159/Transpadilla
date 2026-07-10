import { useState } from "react";
import { Link } from "wouter";
import { Cookie } from "lucide-react";

const CLAVE = "tp_cookies_ok";
const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;

function leerCookie(nombre: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function escribirCookie(nombre: string, valor: string, vigenciaMs: number): void {
  const expira = new Date(Date.now() + vigenciaMs).toUTCString();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${nombre}=${encodeURIComponent(valor)}; expires=${expira}; path=/; SameSite=Lax${secure}`;
}

// Migración suave: quien ya había aceptado bajo la versión anterior (localStorage)
// no debe volver a ver el banner — se traduce a la cookie real y se limpia la clave vieja.
function yaAcepto(): boolean {
  if (leerCookie(CLAVE) === "1") return true;
  try {
    if (localStorage.getItem(CLAVE) === "1") {
      escribirCookie(CLAVE, "1", UN_ANIO_MS);
      localStorage.removeItem(CLAVE);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * Banner informativo de cookies/almacenamiento (Fase 3.6). TransPadilla no usa
 * cookies de rastreo ni publicidad: solo una cookie de sesión (httpOnly) para
 * conductores/administradores y almacenamiento local para preferencias del
 * pasajero (favoritos, id anónimo). Es informativo — no bloquea la navegación.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(() => {
    try { return !yaAcepto(); } catch { return false; }
  });

  if (!visible) return null;

  const aceptar = () => {
    try { escribirCookie(CLAVE, "1", UN_ANIO_MS); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div
      className="tp-light fixed inset-x-0 bottom-0 z-[2000] px-4 pb-4 pt-3 animate-in fade-in slide-in-from-bottom-4 duration-300"
      style={{ pointerEvents: "none" }}
      role="region"
      aria-label="Aviso de cookies"
    >
      <div
        className="mx-auto max-w-2xl rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 tp-shadow-float"
        style={{ background: "#fff", border: "1px solid #e5e7eb", pointerEvents: "auto" }}
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(37,88,165,0.1)", color: "var(--color-blue)" }}
        >
          <Cookie className="w-5 h-5" />
        </span>
        <p className="text-xs leading-relaxed flex-1" style={{ color: "var(--color-gray-text)" }}>
          Usamos almacenamiento local y una cookie/token de sesión solo para el funcionamiento del
          servicio (no publicidad ni rastreo). Al continuar, lo aceptas. Más detalles en la{" "}
          <Link href="/privacidad" className="font-semibold" style={{ color: "var(--color-blue)" }}>
            Política de Privacidad
          </Link>.
        </p>
        <button
          onClick={aceptar}
          className="shrink-0 h-10 px-5 rounded-xl text-white font-bold text-sm active:scale-95 transition-transform"
          style={{ background: "var(--color-navy)" }}
          data-testid="cookie-aceptar"
        >
          Aceptar
        </button>
      </div>
    </div>
  );
}
