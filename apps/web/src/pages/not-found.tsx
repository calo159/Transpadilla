import { useLocation } from "wouter";
import { Bus, MapPinOff } from "lucide-react";
import { LogoTP } from "@/components/LogoTP";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function NotFound() {
  useDocumentTitle("Página no encontrada · TransPadilla");
  const [, setLocation] = useLocation();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center md:flex-row md:items-center md:justify-center md:gap-16 md:p-0 md:text-left"
      style={{
        background: "radial-gradient(ellipse at 50% -10%, #2558A5 0%, #1B3B6F 35%, #080D18 70%)",
      }}
    >
      {/* Panel de marca — solo escritorio */}
      <div className="hidden md:flex md:w-[300px] flex-shrink-0 flex-col items-center gap-5">
        <span className="w-24 h-24 rounded-2xl flex items-center justify-center" style={{ background: "rgba(123,184,213,0.15)", color: "var(--tp-sky)" }}>
          <MapPinOff className="w-12 h-12" />
        </span>
        <h1 className="text-3xl font-black tracking-widest text-white text-center">
          Trans<span style={{ color: "var(--tp-yellow)" }}>Padilla</span>
        </h1>
        <p className="text-white/50 text-sm text-center max-w-[220px]">
          Rastreo de buses en tiempo real para Riohacha
        </p>
      </div>

      <div className="flex flex-col items-center text-center md:items-start md:text-left">
        <div className="md:hidden"><LogoTP size={64} /></div>
        <p className="mt-4 md:mt-0 text-8xl font-black text-white leading-none tracking-tighter">404</p>
        <p className="mt-3 text-xl font-bold text-white/80">Página no encontrada</p>
        <p className="mt-2 text-sm text-white/50 max-w-xs leading-relaxed">
          Esta ruta no está en el mapa de TransPadilla.
        </p>
        <button
          onClick={() => setLocation("/")}
          className="mt-8 flex items-center gap-2 px-6 h-12 rounded-2xl font-bold text-white active:scale-95 transition-transform"
          style={{ background: "#2558A5" }}
        >
          <Bus className="w-5 h-5" /> Volver al mapa
        </button>
      </div>
    </div>
  );
}
