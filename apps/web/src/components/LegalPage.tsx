import type { ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { LogoTP } from "@/components/LogoTP";

/** Encabezado de sección dentro de una página legal. */
export function LegalH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-lg font-extrabold mt-7 md:mt-9 mb-2" style={{ color: "var(--color-navy)" }}>
      {children}
    </h2>
  );
}

/** Párrafo de cuerpo. */
export function LegalP({ children }: { children: ReactNode }) {
  return <p className="text-sm md:text-base leading-relaxed mb-3" style={{ color: "#334155" }}>{children}</p>;
}

/** Lista con viñetas de marca. */
export function LegalUl({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 mb-3">
      {items.map((it, i) => (
        <li key={i} className="text-sm leading-relaxed flex gap-2" style={{ color: "#334155" }}>
          <span style={{ color: "var(--color-gold)" }}>▸</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Layout común de las páginas legales (Privacidad, Términos). */
export function LegalPage({
  titulo, actualizado, children,
}: { titulo: string; actualizado: string; children: ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <div className="tp-light min-h-screen flex flex-col" style={{ background: "#EEF1F6" }}>
      {/* Cabecera navy de marca */}
      <header
        className="px-4 md:px-8 h-14 md:h-16 flex items-center justify-between shrink-0"
        style={{ background: "linear-gradient(135deg, #24487e 0%, #1B3B6F 60%, #16335f 100%)" }}
      >
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-sm font-semibold text-white/85 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al mapa
        </button>
        <div className="flex items-center gap-2">
          <LogoTP size={26} />
          <span className="font-display font-extrabold tracking-wide text-white">TRANSPADILLA</span>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 md:py-12">
        <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8" style={{ border: "1px solid #e5e7eb" }}>
          <h1 className="font-display text-2xl font-black mb-1" style={{ color: "var(--color-navy)" }}>{titulo}</h1>
          <p className="text-xs mb-5" style={{ color: "var(--color-gray-text)" }}>Última actualización: {actualizado}</p>
          {children}

          <div className="mt-8 pt-4 flex gap-4 text-xs" style={{ borderTop: "1px solid #eef2f7" }}>
            <Link href="/privacidad" className="font-semibold" style={{ color: "var(--color-blue)" }}>Política de Privacidad</Link>
            <Link href="/terminos" className="font-semibold" style={{ color: "var(--color-blue)" }}>Términos y Condiciones</Link>
          </div>
        </div>
        <p className="text-center text-[11px] mt-4" style={{ color: "var(--color-gray-text)" }}>
          TransPadilla — Moviendo la Ciudad · Riohacha, La Guajira
        </p>
      </main>
    </div>
  );
}
