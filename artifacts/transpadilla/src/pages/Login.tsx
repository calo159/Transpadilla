import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Bus, Loader2, ArrowLeft, Shield, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAuth, getUser } from "@/lib/auth";

export default function Login() {
  const [, setLocation] = useLocation();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  useEffect(() => {
    const user = getUser();
    if (user) {
      if (user.rol === "admin") setLocation("/admin");
      else if (user.rol === "conductor") setLocation("/conductor");
      else setLocation("/");
    }
  }, [setLocation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo, password }),
      });
      if (!res.ok) {
        setError("Correo o contraseña incorrectos");
        return;
      }
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
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const loginRapido = async (correoDemo: string, passDemo: string) => {
    setCorreo(correoDemo);
    setPassword(passDemo);
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: correoDemo, password: passDemo }),
      });
      if (!res.ok) {
        setError("Error al iniciar sesión de prueba");
        return;
      }
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
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      {/* Back to map */}
      <button
        onClick={() => setLocation("/")}
        className="absolute top-4 left-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Volver al mapa
      </button>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 bg-primary/10 border border-primary/30 rounded-2xl flex items-center justify-center">
              <Bus className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-black tracking-widest text-foreground">
              TRANSPADILLA
            </h1>
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            Riohacha, La Guajira
          </p>
          <p className="text-muted-foreground/70 text-xs mt-1">
            Acceso para conductores y administradores
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleLogin}
          className="bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4"
        >
          <div>
            <Label htmlFor="correo" className="text-sm font-medium">
              Correo electrónico
            </Label>
            <Input
              id="correo"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="mt-1.5 h-10"
              autoComplete="email"
              data-testid="input-correo"
              required
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 h-10"
              autoComplete="current-password"
              data-testid="input-password"
              required
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
              <p className="text-destructive text-sm text-center" data-testid="error-login">
                {error}
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-11 font-bold text-sm tracking-wide"
            disabled={loading}
            data-testid="button-login"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {loading ? "Ingresando..." : "Iniciar sesión"}
          </Button>
        </form>

        {/* Demo accounts */}
        <div className="mt-4 bg-card/60 border border-border rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Accesos de prueba
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => loginRapido("admin@transpadilla.co", "admin123")}
              disabled={loading}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">Administrador</p>
                <p className="text-[10px] text-muted-foreground">Gestión de rutas, buses y paradas</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => loginRapido("conductor@transpadilla.co", "conductor123")}
              disabled={loading}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Truck className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">Conductor</p>
                <p className="text-[10px] text-muted-foreground">Transmisión GPS y reporte de novedades</p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground/50 mt-6 tracking-wider">
          TRANSPADILLA © {new Date().getFullYear()} · Riohacha, La Guajira
        </p>
      </div>
    </div>
  );
}