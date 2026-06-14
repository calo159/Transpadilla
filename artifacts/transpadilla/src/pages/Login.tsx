import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, Shield, Truck, Eye, EyeOff, MessageCircle, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAuth, getUser } from "@/lib/auth";
import { LogoTP } from "@/components/LogoTP";

// Actualiza con el número real de WhatsApp de TransPadilla
const WHATSAPP_NUMERO = "3144167656";
const INSTAGRAM_URL   = "https://www.instagram.com/transpadilla.co";

export default function Login() {
  const [, setLocation] = useLocation();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (user) {
      if (user.rol === "admin") setLocation("/admin");
      else if (user.rol === "conductor") setLocation("/conductor");
      else setLocation("/");
    }
  }, [setLocation]);

  const doLogin = async (c: string, p: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: c, password: p }),
      });
      if (!res.ok) { setError("Correo o contraseña incorrectos"); return; }
      const data = (await res.json()) as {
        token: string;
        usuario: { id: number; nombre: string; correo: string; rol: string };
      };
      setAuth(data.token, data.usuario);
      const rol = data.usuario.rol;
      if (rol === "admin") setLocation("/admin");
      else if (rol === "conductor") setLocation("/conductor");
      else setLocation("/");
    } catch {
      setError("Error de conexión. Verifica que el servidor esté activo.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => { e.preventDefault(); doLogin(correo, password); };
  const loginRapido = (c: string, p: string) => { setCorreo(c); setPassword(p); doLogin(c, p); };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% -10%, #1757C2 0%, #0D2461 35%, #080D18 70%)",
      }}
    >
      {/* Fondo decorativo — ondas de marca */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, var(--tp-sky) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, var(--tp-yellow) 0%, transparent 70%)" }}
        />
        {/* Líneas horizontales decorativas — evocan carretera */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-full h-px opacity-5"
            style={{ top: `${15 + i * 14}%`, background: "linear-gradient(90deg, transparent, white, transparent)" }}
          />
        ))}
      </div>

      {/* Botón volver */}
      <button
        onClick={() => setLocation("/")}
        className="absolute top-4 left-4 flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors group z-10"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        <span className="hidden sm:inline">Volver al mapa</span>
      </button>

      {/* Links de contacto arriba derecha */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <a
          href={`https://wa.me/${WHATSAPP_NUMERO}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: "rgba(37,211,102,0.15)", color: "#25D366", border: "1px solid rgba(37,211,102,0.25)" }}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">WhatsApp</span>
        </a>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/25 transition-colors"
        >
          <Instagram className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo y marca */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-5">
            <LogoTP size={96} />
          </div>
          <h1 className="text-4xl font-black tracking-widest text-white mb-1">
            Trans<span style={{ color: "var(--tp-yellow)" }}>Padilla</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="h-px w-10 opacity-40" style={{ background: "var(--tp-yellow)" }} />
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-white/70">
              Moviendo la Ciudad
            </p>
            <div className="h-px w-10 opacity-40" style={{ background: "var(--tp-yellow)" }} />
          </div>
          <p className="text-white/50 text-xs">
            Acceso para conductores y administradores
          </p>
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleLogin}
          className="rounded-2xl p-5 shadow-2xl space-y-4"
          style={{ background: "rgba(12,18,32,0.85)", border: "1px solid rgba(75,169,216,0.2)", backdropFilter: "blur(16px)" }}
        >
          <div>
            <Label htmlFor="correo" className="text-sm font-medium text-white/75">
              Correo electrónico
            </Label>
            <Input
              id="correo"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="mt-1.5 h-12 text-base bg-white/5 border-white/15 focus:border-primary rounded-xl text-white placeholder:text-white/30"
              autoComplete="email"
              inputMode="email"
              data-testid="input-correo"
              required
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-sm font-medium text-white/75">
              Contraseña
            </Label>
            <div className="relative mt-1.5">
              <Input
                id="password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 text-base bg-white/5 border-white/15 focus:border-primary rounded-xl pr-12 text-white placeholder:text-white/30"
                autoComplete="current-password"
                data-testid="input-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
              <p className="text-red-400 text-sm text-center" data-testid="error-login">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full font-bold text-base tracking-wide rounded-xl text-white shadow-lg border-0"
            style={{
              height: "52px",
              background: "linear-gradient(135deg, #1757C2 0%, var(--tp-sky) 100%)",
              boxShadow: "0 4px 20px rgba(23,87,194,0.5)",
            }}
            disabled={loading}
            data-testid="button-login"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
            {loading ? "Ingresando..." : "Iniciar sesión"}
          </Button>
        </form>

        {/* Accesos rápidos demo */}
        <div
          className="mt-4 rounded-2xl p-4 space-y-3"
          style={{ background: "rgba(12,18,32,0.7)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 text-center">
            Accesos rápidos de prueba
          </p>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => loginRapido("admin@transpadilla.co", "admin123")}
              disabled={loading}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-colors disabled:opacity-50"
              style={{ borderColor: "rgba(156,39,176,0.25)", background: "rgba(156,39,176,0.08)" }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(156,39,176,0.15)" }}>
                <Shield className="w-4.5 h-4.5" style={{ width: "18px", height: "18px", color: "#c084fc" }} />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Administrador</p>
                <p className="text-[11px] text-white/40">Gestión de rutas, buses y paradas</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => loginRapido("conductor@transpadilla.co", "conductor123")}
              disabled={loading}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-colors disabled:opacity-50"
              style={{ borderColor: "rgba(75,169,216,0.25)", background: "rgba(75,169,216,0.08)" }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(75,169,216,0.15)" }}>
                <Truck className="w-4.5 h-4.5" style={{ width: "18px", height: "18px", color: "var(--tp-sky)" }} />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Conductor</p>
                <p className="text-[11px] text-white/40">Transmisión GPS y reporte de novedades</p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-[11px] text-white/30 tracking-wider">
            TransPadilla © {new Date().getFullYear()} · Riohacha, La Guajira
          </p>
          <p className="text-[10px] text-white/20">
            Muévete siempre con seguridad
          </p>
        </div>
      </div>
    </div>
  );
}
