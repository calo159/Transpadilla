import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCrearParada, useAsignarParada, useDeleteParada,
  getGetRutasQueryKey, getGetTodasParadasQueryKey,
  type Ruta, type Parada,
} from "@workspace/api-client";
import { Plus, Route, MapPin, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import type { ConfirmOpts } from "@/components/ConfirmDialog";
import type { PromptOpts } from "@/components/PromptDialog";
import { inputCls, selectTriggerCls } from "./shared";

interface Props {
  rutas: Ruta[];
  paradas: Parada[];
  setConfirmar: (opts: ConfirmOpts) => void;
  setRenombrar: (opts: PromptOpts) => void;
}

/** Tab "Paradas": crear paradas, asignarlas a rutas, listarlas, renombrar y borrar. */
export default function ParadasTab({ rutas, paradas, setConfirmar, setRenombrar }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const crearParada = useCrearParada();
  const asignarParadaMutation = useAsignarParada();
  const deleteParada = useDeleteParada();

  const [nombre, setNombre] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [asignarRutaId, setAsignarRutaId] = useState<string>("");
  const [asignarParadaId, setAsignarParadaId] = useState<string>("");
  const [asignarOrden, setAsignarOrden] = useState("0");
  const [query, setQuery] = useState("");

  const crear = async () => {
    if (!nombre.trim() || !lat || !lng) { toast({ title: "Completa todos los campos", variant: "destructive" }); return; }
    const latNum = parseFloat(lat); const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) { toast({ title: "Latitud y longitud deben ser números", variant: "destructive" }); return; }
    try {
      await crearParada.mutateAsync({ data: { nombre: nombre.trim(), latitud: latNum, longitud: lngNum } });
      queryClient.invalidateQueries({ queryKey: getGetTodasParadasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setNombre(""); setLat(""); setLng("");
      toast({ title: "Parada creada" });
    } catch {
      toast({ title: "Error al crear la parada", variant: "destructive" });
    }
  };

  const asignar = async () => {
    if (!asignarRutaId || !asignarParadaId) { toast({ title: "Selecciona ruta y parada", variant: "destructive" }); return; }
    try {
      await asignarParadaMutation.mutateAsync({
        id: parseInt(asignarRutaId, 10),
        data: { parada_id: parseInt(asignarParadaId, 10), orden: parseInt(asignarOrden, 10) || 0 },
      });
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
      setAsignarParadaId(""); setAsignarOrden("0"); setQuery("");
      toast({ title: "Parada asignada a la ruta" });
    } catch {
      toast({ title: "Error al asignar la parada", variant: "destructive" });
    }
  };

  const eliminar = (id: number, nombreParada: string) => {
    setConfirmar({
      titulo: "Eliminar parada",
      descripcion: `¿Eliminar la parada "${nombreParada}"? Se quitará de todas las rutas.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
      accion: async () => {
        try {
          await deleteParada.mutateAsync({ id });
          queryClient.invalidateQueries({ queryKey: getGetTodasParadasQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
          toast({ title: `Parada "${nombreParada}" eliminada` });
        } catch {
          toast({ title: "Error al eliminar la parada", variant: "destructive" });
        }
      },
    });
  };

  const renombrar = (id: number, actual: string) => {
    setRenombrar({
      titulo: "Renombrar parada",
      etiqueta: "Nuevo nombre de la parada",
      valorInicial: actual,
      onGuardar: async (nuevo) => {
        if (nuevo === actual) return;
        try {
          const res = await apiFetch(`/api/rutas/paradas/${id}`, { method: "PATCH", body: JSON.stringify({ nombre: nuevo }) });
          if (!res.ok) throw new Error();
          queryClient.invalidateQueries({ queryKey: getGetTodasParadasQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
          toast({ title: "Parada renombrada" });
        } catch {
          toast({ title: "Error al renombrar la parada", variant: "destructive" });
        }
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Nueva parada
          </h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1.5">Nombre de la parada</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Terminal Central" className={inputCls} data-testid="input-parada-nombre" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs mb-1.5">Latitud</Label>
                <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="11.5444" className={`${inputCls} font-mono`} inputMode="decimal" data-testid="input-parada-lat" />
              </div>
              <div>
                <Label className="text-xs mb-1.5">Longitud</Label>
                <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-72.9072" className={`${inputCls} font-mono`} inputMode="decimal" data-testid="input-parada-lng" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Centro de Riohacha: Lat 11.5444, Lng -72.9072</p>
            <Button onClick={crear} disabled={crearParada.isPending} className="w-full h-11 rounded-xl" data-testid="button-crear-parada">
              <Plus className="w-4 h-4 mr-2" />{crearParada.isPending ? "Creando..." : "Crear parada"}
            </Button>
          </div>
        </div>

        {rutas.length > 0 && paradas.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Route className="w-4 h-4 text-purple-400" /> Asignar parada a ruta
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1.5">Ruta</Label>
                <Select value={asignarRutaId} onValueChange={setAsignarRutaId}>
                  <SelectTrigger className={selectTriggerCls} data-testid="select-asignar-ruta"><SelectValue placeholder="Selecciona ruta" /></SelectTrigger>
                  <SelectContent>{rutas.map((r) => <SelectItem key={r.id} value={r.id.toString()}>{r.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5">Parada</Label>
                {(() => {
                  // Paradas filtradas por el buscador; se marca cuál ya está en la ruta.
                  const rutaSel = rutas.find((r) => r.id.toString() === asignarRutaId);
                  const yaEnRuta = new Set((rutaSel?.paradas ?? []).map((p) => p.id));
                  const disponibles = paradas.filter((p) => p.nombre.toLowerCase().includes(query.toLowerCase()));
                  return (
                    <div>
                      <div className="relative mb-2">
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Buscar parada por nombre..."
                          className="w-full h-10 pl-3 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      {!asignarRutaId ? (
                        <p className="text-xs text-muted-foreground py-2">Primero selecciona una ruta.</p>
                      ) : disponibles.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">Sin resultados.</p>
                      ) : (
                        <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                          {disponibles.map((p) => {
                            const sel = asignarParadaId === p.id.toString();
                            const incluida = yaEnRuta.has(p.id);
                            return (
                              <button
                                key={p.id}
                                onClick={() => setAsignarParadaId(p.id.toString())}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                                  sel ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-secondary/50"
                                }`}
                              >
                                <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${sel ? "text-primary" : "text-sky-400"}`} />
                                <span className="flex-1 min-w-0 truncate text-sm text-foreground">{p.nombre}</span>
                                {incluida && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 flex-shrink-0">ya en ruta</span>
                                )}
                                <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
                                  {p.latitud.toFixed(3)}, {p.longitud.toFixed(3)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <Label className="text-xs mb-1.5">Orden en la ruta</Label>
                <Input value={asignarOrden} onChange={(e) => setAsignarOrden(e.target.value)} type="number" min="0" className={inputCls} inputMode="numeric" data-testid="input-asignar-orden" />
              </div>
              <Button onClick={asignar} disabled={asignarParadaMutation.isPending} className="w-full h-11 rounded-xl" data-testid="button-asignar-parada">
                <Route className="w-4 h-4 mr-2" />Asignar parada
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-sky-400" /> Paradas registradas</span>
          <span className="text-xs text-muted-foreground font-normal">{paradas.length} en total</span>
        </h3>
        {paradas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay paradas. Crea la primera.</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {paradas.map((p) => (
              <div key={p.id} className="flex items-start gap-3 p-3 bg-secondary/30 border border-border rounded-xl">
                <MapPin className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{p.nombre}</p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">{p.latitud.toFixed(5)}, {p.longitud.toFixed(5)}</p>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => renombrar(p.id, p.nombre)}
                  className="h-9 w-9 p-0 text-muted-foreground hover:text-primary flex-shrink-0"
                  title="Renombrar parada"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => eliminar(p.id, p.nombre)}
                  className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                  data-testid={`delete-parada-${p.id}`}
                  title="Eliminar parada"
                >
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
