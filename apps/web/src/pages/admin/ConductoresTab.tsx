import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBusesQueryKey, type Bus } from "@workspace/api-client";
import { UserCheck, Users, RefreshCw, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import type { Conductor } from "@/lib/types";
import type { ConfirmOpts } from "@/components/ConfirmDialog";
import { inputCls } from "./shared";

interface Props {
  /** Buses disponibles para asignar a cada conductor. */
  buses: Bus[];
  /** Abre el diálogo de confirmación global (lo renderiza Admin). */
  setConfirmar: (opts: ConfirmOpts) => void;
}

/** Tab "Conductores": alta, listado y asignación de bus a cada conductor. */
export default function ConductoresTab({ buses, setConfirmar }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(false);
  const [nombre, setNombre] = useState("");
  const [identificacion, setIdentificacion] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [pending, setPending] = useState(false);

  // silent=true para el refresco en segundo plano (no muestra el esqueleto de carga).
  const fetchConductores = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch("/api/conductores");
      if (res.ok) setConductores(await res.json() as Conductor[]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // El componente solo se monta cuando el tab está activo: cargar al entrar y
  // refrescar cada 20 s (silencioso) para reflejar cambios de otra sesión.
  useEffect(() => {
    fetchConductores();
    const t = setInterval(() => fetchConductores(true), 20000);
    return () => clearInterval(t);
  }, [fetchConductores]);

  const registrar = async () => {
    if (!nombre.trim() || !identificacion.trim() || !correo.trim() || !password.trim()) {
      toast({ title: "Completa todos los campos", variant: "destructive" }); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
      toast({ title: "El correo no es válido", description: "Ej: conductor@transpadilla.co", variant: "destructive" }); return;
    }
    if (password.length < 8) {
      toast({ title: "La contraseña debe tener al menos 8 caracteres", variant: "destructive" }); return;
    }
    setPending(true);
    try {
      const res = await apiFetch("/api/conductores", {
        method: "POST",
        body: JSON.stringify({ nombre: nombre.trim(), correo: correo.trim(), password, identificacion: identificacion.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({ title: err.error ?? "Error al registrar conductor", variant: "destructive" }); return;
      }
      toast({ title: `Conductor "${nombre.trim()}" registrado` });
      setNombre(""); setIdentificacion(""); setCorreo(""); setPassword("");
      fetchConductores();
    } catch {
      toast({ title: "Error de conexión", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  const eliminar = (id: number, nombreConductor: string) => {
    setConfirmar({
      titulo: "Eliminar conductor",
      descripcion: `¿Eliminar al conductor "${nombreConductor}"? Perderá acceso al sistema.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
      accion: async () => {
        try {
          const res = await apiFetch(`/api/conductores/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          toast({ title: `Conductor "${nombreConductor}" eliminado` });
          setConductores((prev) => prev.filter((c) => c.id !== id));
        } catch {
          toast({ title: "Error al eliminar conductor", variant: "destructive" });
        }
      },
    });
  };

  const asignarBus = async (conductorId: number, newBusId: number | null, prevBusId: number | null) => {
    const patch = async (busId: number, cId: number | null) => {
      const r = await apiFetch(`/api/buses/${busId}/conductor`, {
        method: "PATCH",
        body: JSON.stringify({ conductor_id: cId }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
    };
    try {
      if (prevBusId && prevBusId !== newBusId) await patch(prevBusId, null);
      if (newBusId) await patch(newBusId, conductorId);
      await queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      toast({ title: newBusId ? "Bus asignado al conductor" : "Bus desasignado" });
    } catch (err) {
      toast({ title: `Error al asignar bus: ${String(err)}`, variant: "destructive" });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Formulario de registro */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 h-fit">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-primary" /> Registrar conductor
        </h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5">Nombre completo</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Carlos Rodríguez"
              className={inputCls}
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5">Número de identificación (CC / CE)</Label>
            <Input
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value)}
              placeholder="Ej: 1234567890"
              className={`${inputCls} font-mono`}
              inputMode="numeric"
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5">Correo (usuario para iniciar sesión)</Label>
            <Input
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="conductor@transpadilla.co"
              className={inputCls}
              type="email"
              inputMode="email"
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5">Contraseña</Label>
            <div className="relative">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className={`${inputCls} pr-11`}
                type={showPass ? "text" : "password"}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              El conductor usará este correo y contraseña para entrar al sistema.
            </p>
          </div>
          <Button
            onClick={registrar}
            disabled={pending}
            className="w-full h-11 rounded-xl"
          >
            <Plus className="w-4 h-4 mr-2" />
            {pending ? "Registrando..." : "Registrar conductor"}
          </Button>
        </div>
      </div>

      {/* Lista de conductores */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Conductores registrados
          </span>
          <button onClick={() => fetchConductores()} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Actualizar
          </button>
        </h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}
          </div>
        ) : conductores.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center bg-muted/40">
              <UserCheck className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Aún no hay conductores</p>
            <p className="text-xs text-muted-foreground mt-0.5">Crea el primero con el formulario de la izquierda.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {conductores.map((c) => {
              const assignedBus = buses.find((b) => b.conductor_id === c.id);
              return (
                <div key={c.id} className="p-3 bg-secondary/30 border border-border rounded-xl space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: "rgba(37,88,165,0.2)", color: "var(--tp-sky)" }}>
                      {c.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{c.nombre}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.correo}</p>
                      {c.identificacion && (
                        <p className="text-xs font-mono mt-0.5" style={{ color: "var(--tp-sky)" }}>
                          CC {c.identificacion}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => eliminar(c.id, c.nombre)}
                      className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Bus asignado</p>
                    <Select
                      value={assignedBus?.id.toString() ?? "none"}
                      onValueChange={(v) =>
                        asignarBus(c.id, v === "none" ? null : parseInt(v, 10), assignedBus?.id ?? null)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs rounded-lg bg-background border-border">
                        <SelectValue placeholder="Sin bus" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin bus asignado</SelectItem>
                        {buses.map((b) => (
                          <SelectItem key={b.id} value={b.id.toString()}>
                            {b.placa}{b.nombre_ruta ? ` — ${b.nombre_ruta}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
