import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface PromptOpts {
  titulo: string;
  etiqueta?: string;
  valorInicial: string;
  onGuardar: (valor: string) => void | Promise<void>;
}

/**
 * Diálogo con un campo de texto, reutilizable y controlado. Reemplaza al
 * `window.prompt()` por una UI profesional (p. ej. renombrar ruta/parada).
 */
export function PromptDialog({
  opts,
  onClose,
}: {
  opts: PromptOpts | null;
  onClose: () => void;
}) {
  const [valor, setValor] = useState("");
  useEffect(() => { setValor(opts?.valorInicial ?? ""); }, [opts]);

  const guardar = async () => {
    if (!valor.trim()) return;
    await opts?.onGuardar(valor.trim());
    onClose();
  };

  return (
    <Dialog open={!!opts} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{opts?.titulo}</DialogTitle>
        </DialogHeader>
        {opts?.etiqueta && <p className="text-xs text-muted-foreground -mt-2">{opts.etiqueta}</p>}
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
          autoFocus
          className="h-11 rounded-xl"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancelar</Button>
          <Button onClick={guardar} disabled={!valor.trim()} className="rounded-xl">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
