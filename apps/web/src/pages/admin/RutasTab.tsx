import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateRuta, useDeleteRuta, getGetRutasQueryKey, type Ruta,
} from "@workspace/api-client";
import { Plus, Route, Pencil, Trash2, MapPin, X, Power, GripVertical, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { COLORES } from "@/lib/constants";
import type { ConfirmOpts } from "@/components/ConfirmDialog";
import type { PromptOpts } from "@/components/PromptDialog";
import { inputCls, cardCls, stickyFormCls, SectionHeader } from "./shared";

interface Props {
  rutas: Ruta[];
  rutasLoading: boolean;
  setConfirmar: (opts: ConfirmOpts) => void;
  setRenombrar: (opts: PromptOpts) => void;
}

/** Tab "Rutas": crear rutas, listarlas y quitarles paradas. */
export default function RutasTab({ rutas, rutasLoading, setConfirmar, setRenombrar }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createRuta = useCreateRuta();
  const deleteRuta = useDeleteRuta();

  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState("#2558A5");
  // Qué ruta tiene la paleta de color abierta en la lista (null = ninguna).
  const [editColorId, setEditColorId] = useState<number | null>(null);
  // Parada que se está arrastrando (para reordenar el recorrido).
  const [drag, setDrag] = useState<{ rutaId: number; idx: number } | null>(null);

  // Guarda el nuevo orden de las paradas de una ruta (define el sentido de circulación).
  const guardarOrden = async (rutaId: number, ids: number[]) => {
    try {
      const res = await apiFetch(`/api/rutas/${rutaId}/paradas/orden`, { method: "PUT", body: JSON.stringify({ orden: ids }) });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
    } catch {
      toast({ title: "Error al reordenar las paradas", variant: "destructive" });
    }
  };

  // Mueve una parada una posición arriba/abajo en el recorrido.
  const moverParada = (ruta: Ruta, idx: number, dir: -1 | 1) => {
    const ids = ruta.paradas.map((p) => p.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    void guardarOrden(ruta.id, ids);
  };

  // Suelta la parada arrastrada en la posición `idx`.
  const soltarEn = (ruta: Ruta, idx: number) => {
    if (!drag || drag.rutaId !== ruta.id || drag.idx === idx) { setDrag(null); return; }
    const ids = ruta.paradas.map((p) => p.id);
    const [movido] = ids.splice(drag.idx, 1);
    ids.splice(idx, 0, movido!);
    setDrag(null);
    void guardarOrden(ruta.id, ids);
  };

  // Invierte el sentido de circulación (recorre las paradas al revés).
  const invertirSentido = (ruta: Ruta) => {
    if (ruta.paradas.length < 2) return;
    void guardarOrden(ruta.id, ruta.paradas.map((p) => p.id).reverse());
  };

  // Pausar / reactivar una ruta. Pausada = no aparece para los pasajeros.
  const togglePausa = async (ruta: Ruta) => {
    try {
      const res = await apiFetch(`/api/rutas/${ruta.id}/activa`, { method: "PATCH", body: JSON.stringify({ activa: !ruta.activa }) });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast({ title: ruta.activa ? `Ruta "${ruta.nombre}" pausada` : `Ruta "${ruta.nombre}" reactivada` });
    } catch {
      toast({ title: "Error al cambiar el estado de la ruta", variant: "destructive" });
    }
  };

  // Cambiar el color de una ruta ya creada.
  const cambiarColor = async (id: number, nuevo: string) => {
    setEditColorId(null);
    try {
      const res = await apiFetch(`/api/rutas/${id}`, { method: "PATCH", body: JSON.stringify({ color: nuevo }) });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
      toast({ title: "Color actualizado" });
    } catch {
      toast({ title: "Error al cambiar el color", variant: "destructive" });
    }
  };

  const crear = async () => {
    if (!nombre.trim()) { toast({ title: "El nombre de la ruta es obligatorio", variant: "destructive" }); return; }
    try {
      await createRuta.mutateAsync({ data: { nombre: nombre.trim(), color } });
      queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      setNombre(""); setColor("#2558A5");
      toast({ title: "Ruta creada exitosamente" });
    } catch {
      toast({ title: "Error al crear la ruta", variant: "destructive" });
    }
  };

  const eliminar = (id: number, nombreRuta: string) => {
    setConfirmar({
      titulo: "Eliminar ruta",
      descripcion: `¿Eliminar la ruta "${nombreRuta}"? Esta acción no se puede deshacer.`,
      textoConfirmar: "Eliminar",
      destructivo: true,
      accion: async () => {
        try {
          await deleteRuta.mutateAsync({ id });
          queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
          toast({ title: `Ruta "${nombreRuta}" eliminada` });
        } catch {
          toast({ title: "Error al eliminar la ruta", variant: "destructive" });
        }
      },
    });
  };

  const renombrar = (id: number, actual: string) => {
    setRenombrar({
      titulo: "Renombrar ruta",
      etiqueta: "Nuevo nombre de la ruta",
      valorInicial: actual,
      onGuardar: async (nuevo) => {
        if (nuevo === actual) return;
        try {
          const res = await apiFetch(`/api/rutas/${id}`, { method: "PATCH", body: JSON.stringify({ nombre: nuevo }) });
          if (!res.ok) throw new Error();
          queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
          toast({ title: "Ruta renombrada" });
        } catch {
          toast({ title: "Error al renombrar la ruta", variant: "destructive" });
        }
      },
    });
  };

  const quitarParada = (rutaId: number, paradaId: number, paradaNombre: string) => {
    setConfirmar({
      titulo: "Quitar parada de la ruta",
      descripcion: `¿Quitar la parada "${paradaNombre}" de esta ruta? La parada NO se borra.`,
      textoConfirmar: "Quitar",
      accion: async () => {
        try {
          const res = await apiFetch(`/api/rutas/${rutaId}/paradas/${paradaId}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          queryClient.invalidateQueries({ queryKey: getGetRutasQueryKey() });
          toast({ title: "Parada quitada de la ruta" });
        } catch {
          toast({ title: "Error al quitar la parada", variant: "destructive" });
        }
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className={`${cardCls} ${stickyFormCls}`}>
        <SectionHeader icon={<Plus className="w-4 h-4 text-primary" />} title="Nueva ruta" />
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5">Nombre de la ruta</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Ruta A — Centro a Marbella" maxLength={50} className={inputCls} data-testid="input-ruta-nombre" />
          </div>
          <div>
            <Label className="text-xs mb-1.5">Color en el mapa (con este color se verá la ruta y sus buses)</Label>
            <div className="flex flex-wrap gap-2.5 mt-1">
              {COLORES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 ${color === c.value ? "border-white scale-110 shadow-lg" : "border-transparent"}`}
                  style={{ background: c.value }}
                />
              ))}
            </div>
          </div>
          <Button onClick={crear} disabled={createRuta.isPending} className="w-full h-11 rounded-xl" data-testid="button-crear-ruta">
            <Plus className="w-4 h-4 mr-2" />{createRuta.isPending ? "Creando..." : "Crear ruta"}
          </Button>
        </div>
      </div>

      <div className={cardCls}>
        <SectionHeader icon={<Route className="w-4 h-4 text-purple-400" />} title="Rutas registradas" count={`${rutas.length} en total`} />
        {rutasLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-muted/40 rounded-xl animate-pulse" />)}</div>
        ) : rutas.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center bg-muted/40">
              <Route className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Aún no hay rutas</p>
            <p className="text-xs text-muted-foreground mt-0.5">Crea la primera con el formulario de la izquierda.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 lg:max-h-[calc(100vh-14rem)] overflow-y-auto">
            {rutas.map((ruta) => (
              <div key={ruta.id} className="p-3 bg-secondary/30 border border-border rounded-xl" style={{ opacity: ruta.activa === false ? 0.6 : 1 }}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditColorId(editColorId === ruta.id ? null : ruta.id)}
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-transparent hover:ring-primary/40 transition-all"
                    style={{ background: ruta.color }}
                    title="Cambiar color"
                    aria-label="Cambiar color de la ruta"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                      {ruta.nombre}
                      {ruta.activa === false && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 uppercase">Pausada</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{ruta.paradas.length} paradas</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => invertirSentido(ruta)} disabled={ruta.paradas.length < 2} className="h-9 w-9 p-0 text-muted-foreground hover:text-primary" title="Invertir sentido de circulación">
                    <ArrowUpDown className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => togglePausa(ruta)} className={`h-9 w-9 p-0 ${ruta.activa === false ? "text-amber-500" : "text-muted-foreground hover:text-green-500"}`} title={ruta.activa === false ? "Reactivar ruta" : "Pausar ruta (ocultarla a los pasajeros)"}>
                    <Power className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => renombrar(ruta.id, ruta.nombre)} className="h-9 w-9 p-0 text-muted-foreground hover:text-primary" title="Renombrar ruta">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => eliminar(ruta.id, ruta.nombre)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive" data-testid={`delete-ruta-${ruta.id}`} title="Eliminar ruta">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {/* Paleta para cambiar el color (se abre al tocar el círculo) */}
                {editColorId === ruta.id && (
                  <div className="flex flex-wrap gap-2 mt-2 pl-7">
                    {COLORES.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => cambiarColor(ruta.id, c.value)}
                        title={c.label}
                        className={`w-7 h-7 rounded-full border-2 transition-all active:scale-90 ${ruta.color === c.value ? "border-white scale-110 shadow-lg" : "border-transparent"}`}
                        style={{ background: c.value }}
                      />
                    ))}
                  </div>
                )}
                {/* Recorrido: paradas EN ORDEN = sentido de circulación. Arrastra o usa ↑↓ para reordenar. */}
                {ruta.paradas.length > 0 && (
                  <div className="mt-2 pl-7 space-y-1">
                    {ruta.paradas.length > 1 && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-1">
                        Recorrido (arrastra para ordenar)
                      </p>
                    )}
                    {ruta.paradas.map((p, i) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDrag({ rutaId: ruta.id, idx: i })}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => soltarEn(ruta, i)}
                        className={`flex items-center gap-1.5 text-xs rounded-md py-0.5 ${drag?.rutaId === ruta.id && drag.idx === i ? "opacity-40" : ""}`}
                      >
                        <GripVertical className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 cursor-grab" />
                        <span className="w-4 text-center font-bold text-[10px] text-primary flex-shrink-0">{i + 1}</span>
                        <MapPin className="w-3 h-3 text-sky-400 flex-shrink-0" />
                        <span className="flex-1 truncate text-muted-foreground">{p.nombre}</span>
                        <button onClick={() => moverParada(ruta, i, -1)} disabled={i === 0} className="p-0.5 rounded text-muted-foreground hover:text-primary disabled:opacity-30" title="Subir">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => moverParada(ruta, i, 1)} disabled={i === ruta.paradas.length - 1} className="p-0.5 rounded text-muted-foreground hover:text-primary disabled:opacity-30" title="Bajar">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => quitarParada(ruta.id, p.id, p.nombre)}
                          className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Quitar de la ruta"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
