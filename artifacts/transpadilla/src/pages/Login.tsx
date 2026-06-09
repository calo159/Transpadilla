import { useState } from "react";
import { useLocation } from "wouter";
import { Bus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAuth } from "@/lib/auth";

export default function Login() {
  const [, setLocation] = useLocation();
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      else setLocation("/pasajero");
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
      else setLocation("/pasajero");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <div className="w-10 h-10 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-center">
              <Bus className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-3xl font-black tracking-widest text-foreground">
              TRANSPADILLA
            </h1>
          </div>
          <p className="text-muted-foreground text-sm font-medium">
            Riohacha, La Guajira
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Sistema de seguimiento de transporte público en tiempo real
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
              className="mt-1.5"
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
              className="mt-1.5"
              autoComplete="current-password"
              data-testid="input-password"
              required
            />
          </div>

          {error && (
            <p
              className="text-destructive text-sm text-center py-1"
              data-testid="error-login"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-10 font-semibold"
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
        <div className="mt-4 bg-card/60 border border-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground mb-3">
            Accesos rápidos de prueba:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: "Admin",
                correo: "admin@transpadilla.co",
                pass: "admin123",
                color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
              },
              {
                label: "Conductor",
                correo: "conductor@transpadilla.co",
                pass: "conductor123",
                color: "bg-blue-500/10 text-blue-400 border-blue-500/30",
              },
              {
                label: "Pasajero",
                correo: "pasajero@transpadilla.co",
                pass: "pasajero123",
                color: "bg-green-500/10 text-green-400 border-green-500/30",
              },
            ].map((demo) => (
              <button
                key={demo.label}
                type="button"
                onClick={() => loginRapido(demo.correo, demo.pass)}
                disabled={loading}
                className={`text-xs font-semibold py-2 px-3 rounded-lg border transition-opacity hover:opacity-80 disabled:opacity-50 ${demo.color}`}
              >
                {demo.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center pt-1">
            Haz clic para entrar directamente
          </p>
        </div>
      </div>
    </div>
  );
}
