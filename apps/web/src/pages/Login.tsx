import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, ArrowLeft, Eye, EyeOff, MessageCircle, Instagram, Radio, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAuth, getUser } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { LogoTP } from "@/components/LogoTP";
import { WHATSAPP_URL, INSTAGRAM_URL } from "@/lib/constants";
import { useDocumentTitle } from "@/hooks/use-document-title";

export default function Login() {
  useDocumentTitle("Iniciar sesión · TransPadilla");
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
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
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

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row"
      style={{ background: "linear-gradient(180deg,#eaf1fb 0%, #f6f9fc 55%)" }}
    >
      {/* ── Panel de marca (hero navy) — como el TopBar de la app ──
          En escritorio es la columna izquierda de alto completo; en móvil es una
          franja superior compacta. */}
      <div
        className="relative overflow-hidden shrink-0 flex flex-col items-center justify-center text-center px-6 py-8 md:w-[42%] md:max-w-[520px] md:px-10 md:py-0 md:gap-7"
        style={{ background: "linear-gradient(135deg, #24487e 0%, #1B3B6F 55%, #16335f 100%)" }}
      >
        {/* Decoración de marca */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-28 w-80 h-80 rounded-full opacity-15" style={{ background: "radial-gradient(circle, var(--color-sky) 0%, transparent 70%)" }} />
          <div className="absolute -bottom-32 -right-28 w-80 h-80 rounded-full opacity-10" style={{ background: "radial-gradient(circle, var(--color-gold) 0%, transparent 70%)" }} />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute w-full h-px opacity-[0.06]" style={{ top: `${15 + i * 14}%`, background: "linear-gradient(90deg, transparent, white, transparent)" }} />
          ))}
        </div>

        {/* Volver al mapa */}
        <button
          onClick={() => setLocation("/")}
          className="absolute top-4 left-4 flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors group z-10"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="hidden sm:inline">Volver al mapa</span>
        </button>

        <div className="relative z-10 flex flex-col items-center gap-4 md:gap-6 animate-in fade-in slide-in-from-top-3 md:slide-in-from-left-4 duration-700">
          <LogoTP size={84} />
          <div>
            <h1 className="text-3xl md:text-5xl font-black tracking-widest text-white mb-1">
              Trans<span style={{ color: "var(--color-gold)" }}>Padilla</span>
            </h1>
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="h-px w-8 md:w-10 opacity-40" style={{ background: "var(--color-gold)" }} />
              <p className="text-[10px] md:text-xs font-bold tracking-[0.25em] uppercase text-white/70">Moviendo la Ciudad</p>
              <div className="h-px w-8 md:w-10 opacity-40" style={{ background: "var(--color-gold)" }} />
            </div>
            <p className="text-white/55 text-xs md:text-sm px-4">Rastreo de buses en tiempo real para Riohacha</p>
          </div>

          {/* Señales de confianza — solo escritorio */}
          <div className="hidden md:flex flex-col gap-3 mt-1 w-full max-w-[280px]">
            {[
              { icon: <Radio className="w-4 h-4" />, t: "Posición de los buses en tiempo real" },
              { icon: <MapPin className="w-4 h-4" />, t: "Cobertura de todas las rutas de la ciudad" },
              { icon: <ShieldCheck className="w-4 h-4" />, t: "Acceso protegido para conductores y admins" },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 text-white/65 text-xs text-left">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(123,184,213,0.16)", color: "var(--color-sky)" }}>{f.icon}</span>
                {f.t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Área del formulario (clara) ── */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="tp-light w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <form
            onSubmit={handleLogin}
            className="bg-white rounded-2xl p-6 tp-shadow-float space-y-4"
            style={{ border: "1px solid #eef2f7" }}
          >
            <div className="mb-1">
              <h2 className="font-display text-xl font-extrabold" style={{ color: "var(--color-navy)" }}>Iniciar sesión</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-gray-text)" }}>Acceso para conductores y administradores</p>
            </div>

            <div>
              <Label htmlFor="correo" className="text-sm font-medium" style={{ color: "var(--color-navy)" }}>
                Correo electrónico
              </Label>
              <Input
                id="correo"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="mt-1.5 h-12 text-base rounded-xl"
                autoComplete="email"
                inputMode="email"
                data-testid="input-correo"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--color-navy)" }}>
                Contraseña
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 text-base rounded-xl pr-12"
                  autoComplete="current-password"
                  data-testid="input-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: "var(--color-gray-text)" }}
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPass}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(229,62,62,0.08)", border: "1px solid rgba(229,62,62,0.25)" }}>
                <p className="text-sm text-center" style={{ color: "var(--color-danger)" }} data-testid="error-login">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full font-bold text-base tracking-wide rounded-xl text-white shadow-lg border-0 active:scale-[0.98] transition-transform"
              style={{
                height: "52px",
                background: "linear-gradient(135deg, var(--color-blue) 0%, var(--color-sky) 100%)",
                boxShadow: "0 6px 20px rgba(37,88,165,0.35)",
              }}
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              {loading ? "Ingresando..." : "Iniciar sesión"}
            </Button>

            <p className="text-[11px] text-center leading-relaxed" style={{ color: "var(--color-gray-text)" }}>
              ¿Olvidaste tu contraseña? Pídele al administrador que te la restablezca.
            </p>

            {/* Atención al cliente */}
            <div className="flex gap-2 pt-1">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold transition-colors"
                style={{ background: "rgba(37,211,102,0.10)", color: "#16a34a", border: "1px solid rgba(37,211,102,0.25)" }}
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-semibold transition-colors"
                style={{ background: "#fff", color: "var(--color-navy)", border: "1px solid #e5e7eb" }}
              >
                <Instagram className="w-3.5 h-3.5" /> Instagram
              </a>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-5 text-center space-y-1">
            <p className="text-[11px] tracking-wider" style={{ color: "var(--color-gray-text)" }}>
              TransPadilla © {new Date().getFullYear()} · Riohacha, La Guajira
            </p>
            <div className="flex items-center justify-center gap-3 text-[10px]" style={{ color: "var(--color-gray-text)" }}>
              <a href="/privacidad" className="hover:underline">Privacidad</a>
              <span>·</span>
              <a href="/terminos" className="hover:underline">Términos</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
