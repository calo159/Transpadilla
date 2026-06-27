import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateBus, useDeleteBus, getGetBusesQueryKey, type Bus, type Ruta,
} from "@workspace/api-client";
import { Plus, Bus as BusIcon, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { ConfirmOpts } from "@/components/ConfirmDialog";
import { inputCls, selectTriggerCls } from "./shared";

interface Props {
  buses: Bus[];
  busesLoading: boolean;
  rutas: Ruta[];
  setConfirmar: (opts: ConfirmOpts) => void;
}

/** Tab "Buses": registrar buses (con ruta opcional) y listar la flota. */
export default function BusesTab({ buses, busesLoading, rutas, setConfirmar }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBus = useCreateBus();
  const deleteBus = useDeleteBus();

  const [placa, setPlaca] = useState("");
  const [rutaId, setRutaId] = useState<string>("");

  const crear = async () => {
    if (!placa.trim()) { toast({ title: "La placa es obligatoria", variant: "destructive" }); return; }
    try {
      const ruta_id = (rutaId && rutaId !== "none") ? parseInt(rutaId, 10) : null;
      await createBus.mutateAsync({ data: { placa: placa.trim().toUpperCase(), ruta_id } });
      queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setPlaca(""); setRutaId("");
      toast({ title: "Bus registrado exitosamente" });
    } catch {
      toast({ title: "Error al registrar el bus", variant: "destructive" });
    }
  };

  const eliminar = (id: number, placaBus: string) => {
    setConfirmar({
      titulo: "Eliminar bus",
      descripcion: `¿Eliminar el bus "${placaBus}"?`,
      textoConfirmar: "Eliminar",
      destructivo: true,
      accion: async () => {
        try {
          await deleteBus.mutateAsync({ id });
          queryClient.invalidateQueries({ queryKey: getGetBusesQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
          toast({ title: `Bus "${placaBus}" eliminado` });
        } catch {
          toast({ title: "Error al eliminar el bus", variant: "destructive" });
        }
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 h-fit">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Registrar bus
        </h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5">Placa del vehículo</Label>
            <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="Ej: GUA-001" className={`${inputCls} font-mono`} data-testid="input-bus-placa" maxLength={10} />
          </div>
          <div>
            <Label className="text-xs mb-1.5">Asignar a ruta (opcional — la puedes cambiar después)</Label>
            <Select value={rutaId} onValueChange={setRutaId}>
              <SelectTrigger className={selectTriggerCls} data-testid="select-bus-ruta"><SelectValue placeholder="Sin ruta asignada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin ruta</SelectItem>
                {rutas.map((r) => <SelectItem key={r.id} value={r.id.toString()}>{r.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={crear} disabled={createBus.isPending} className="w-full h-11 rounded-xl" data-testid="button-crear-bus">
            <Plus className="w-4 h-4 mr-2" />{createBus.isPending ? "Registrando..." : "Registrar bus"}
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2"><BusIcon className="w-4 h-4 text-primary" /> Flota de buses</span>
          <span className="text-xs text-muted-foreground font-normal">{buses.length} en total</span>
        </h3>
        {busesLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />)}</div>
        ) : buses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay buses. Registra el primero.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {buses.map((b) => (
              <div key={b.id} className="flex items-start gap-3 p-3 bg-secondary/30 border border-border rounded-xl">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${b.estado === "activo" ? "bg-green-500" : b.estado === "demora" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono font-bold text-foreground">{b.placa}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${b.estado === "activo" ? "bg-green-500/20 text-green-400" : b.estado === "demora" ? "bg-amber-500/20 text-amber-400" : "bg-muted/20 text-muted-foreground"}`}>{b.estado}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.nombre_ruta ?? "Sin ruta"}{b.velocidad && b.velocidad > 0 ? ` · ${Math.round(b.velocidad)} km/h` : ""}</p>
                  {b.novedad && <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--tp-yellow)" }}><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{b.novedad}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => eliminar(b.id, b.placa)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" data-testid={`delete-bus-${b.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
