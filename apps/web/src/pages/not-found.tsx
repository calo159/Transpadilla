import { useLocation } from "wouter";
import { Bus } from "lucide-react";
import { LogoTP } from "@/components/LogoTP";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{
        background: "radial-gradient(ellipse at 50% -10%, #2558A5 0%, #1B3B6F 35%, #080D18 70%)",
      }}
    >
      <LogoTP size={64} />
      <p className="mt-4 text-8xl font-black text-white leading-none tracking-tighter">404</p>
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
  );
}
