import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

/**
 * Diálogo de cambio de contraseña para el usuario autenticado (admin/conductor).
 * Pide la clave actual + la nueva (con confirmación) y llama a
 * POST /api/auth/cambiar-password, que verifica la actual en el servidor.
 */
export function CambiarPasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verActual, setVerActual] = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const [pending, setPending] = useState(false);

  const limpiar = () => { setActual(""); setNueva(""); setConfirmar(""); setVerActual(false); setVerNueva(false); };
  const cerrar = () => { limpiar(); onClose(); };

  const guardar = async () => {
    if (!actual || !nueva) { toast({ title: "Completa todos los campos", variant: "destructive" }); return; }
    if (nueva.length < 8) { toast({ title: "La nueva contraseña debe tener al menos 8 caracteres", variant: "destructive" }); return; }
    if (nueva !== confirmar) { toast({ title: "Las contraseñas no coinciden", variant: "destructive" }); return; }
    setPending(true);
    try {
      const res = await apiFetch("/api/auth/cambiar-password", {
        method: "POST",
        body: JSON.stringify({ actual, nueva }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: err.error ?? "No se pudo cambiar la contraseña", variant: "destructive" });
        return;
      }
      toast({ title: "Contraseña actualizada" });
      cerrar();
    } catch {
      toast({ title: "Error de conexión", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cerrar(); }}>
      <DialogContent
        className="tp-dialog tp-light max-w-sm gap-0 border-0 rounded-2xl p-0 overflow-hidden tp-shadow-float"
        style={{ background: "#fff" }}
      >
        <div style={{ height: 4, background: "var(--color-navy)" }} />
        <div className="p-6">
        <DialogHeader className="tp-rise items-center sm:items-center text-center sm:text-center" style={{ animationDelay: ".08s" }}>
          <span
            className="tp-dialog-pop w-14 h-14 rounded-full flex items-center justify-center mb-1"
            style={{ background: "color-mix(in srgb, var(--color-navy) 12%, #fff)", color: "var(--color-navy)", animationDelay: ".05s" }}
          >
            <KeyRound className="w-6 h-6" />
          </span>
          <DialogTitle className="font-display text-lg" style={{ color: "var(--color-navy)" }}>Cambiar contraseña</DialogTitle>
        </DialogHeader>
        <div className="tp-rise space-y-3 mt-4" style={{ animationDelay: ".14s" }}>
          <div>
            <Label className="text-xs mb-1.5">Contraseña actual</Label>
            <div className="relative">
              <Input
                type={verActual ? "text" : "password"}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                className="h-11 rounded-xl pr-11"
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setVerActual((v) => !v)} aria-label={verActual ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {verActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5">Nueva contraseña</Label>
            <div className="relative">
              <Input
                type={verNueva ? "text" : "password"}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="h-11 rounded-xl pr-11"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setVerNueva((v) => !v)} aria-label={verNueva ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {verNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5">Confirmar nueva contraseña</Label>
            <Input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
              className="h-11 rounded-xl"
              autoComplete="new-password"
            />
          </div>
        </div>
        <DialogFooter className="tp-rise mt-5 gap-2 sm:gap-2" style={{ animationDelay: ".2s" }}>
          <Button
            variant="outline"
            onClick={cerrar}
            className="rounded-xl border-0 active:scale-95 transition-transform"
            style={{ background: "#fff", color: "var(--color-navy)", boxShadow: "inset 0 0 0 1px #e2e8f0" }}
          >
            Cancelar
          </Button>
          <Button
            onClick={guardar}
            disabled={pending}
            className="rounded-xl text-white active:scale-95 transition-transform hover:opacity-90"
            style={{ background: "var(--color-navy)" }}
          >
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
