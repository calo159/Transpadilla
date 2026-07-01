import { useEffect, useId } from "react";
import { Languages } from "lucide-react";
import { registrarGoogleTranslate } from "@/lib/google-translate";

/**
 * Selector de idioma con traducción automática (Google Translate). No requiere
 * cuenta ni configuración: traduce toda la página al vuelo.
 *
 * variant "menu" → fila completa (menú ☰ móvil, como los demás ítems).
 * variant "pill" → chip compacto (footer del sidebar de escritorio).
 */
export function GoogleTranslate({ variant = "pill" }: { variant?: "menu" | "pill" }) {
  const rawId = useId();
  const containerId = `gt-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    registrarGoogleTranslate(containerId);
  }, [containerId]);

  if (variant === "menu") {
    return (
      <div className="w-full flex items-center gap-3 px-4 py-3.5 border-t border-gray-100">
        <Languages className="w-5 h-5 flex-shrink-0" style={{ color: "var(--color-sky)" }} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sm" style={{ color: "var(--color-navy)" }}>Idioma</span>
          <span className="block text-[11px]" style={{ color: "var(--color-gray-text)" }}>Traduce la página automáticamente</span>
        </span>
        <div id={containerId} className="tp-google-translate flex-shrink-0" />
      </div>
    );
  }

  return (
    <div
      className="tp-google-translate flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
      style={{ background: "#fff", border: "1px solid #e5e7eb", color: "var(--color-navy)" }}
      title="Traducir la página"
    >
      <Languages className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-sky)" }} />
      <div id={containerId} />
    </div>
  );
}
