import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";
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
 * `window.prompt()` por una UI de marca (p. ej. renombrar ruta/parada).
 * Se renderiza por portal en el <body>: colores de marca explícitos (ver
 * ConfirmDialog para la nota de estilo).
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
      <DialogContent
        className="tp-light max-w-sm gap-0 border-0 rounded-2xl p-0 overflow-hidden tp-shadow-float"
        style={{ background: "#fff" }}
      >
        <div style={{ height: 4, background: "var(--color-blue)" }} />
        <div className="p-6">
          <DialogHeader className="items-center sm:items-center text-center sm:text-center">
            <span
              className="tp-dialog-pop w-14 h-14 rounded-full flex items-center justify-center mb-1"
              style={{ background: "color-mix(in srgb, var(--color-blue) 12%, #fff)", color: "var(--color-blue)" }}
            >
              <Pencil className="w-6 h-6" />
            </span>
            <DialogTitle className="font-display text-lg" style={{ color: "var(--color-navy)" }}>
              {opts?.titulo}
            </DialogTitle>
          </DialogHeader>
          {opts?.etiqueta && <p className="text-xs text-center mt-1 mb-1" style={{ color: "var(--color-gray-text)" }}>{opts.etiqueta}</p>}
          <Input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
            autoFocus
            className="h-11 rounded-xl mt-2"
          />
          <DialogFooter className="mt-5 gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="rounded-xl border-0 active:scale-95 transition-transform"
              style={{ background: "#fff", color: "var(--color-navy)", boxShadow: "inset 0 0 0 1px #e2e8f0" }}
            >
              Cancelar
            </Button>
            <Button
              onClick={guardar}
              disabled={!valor.trim()}
              className="rounded-xl text-white active:scale-95 transition-transform hover:opacity-90"
              style={{ background: "var(--color-navy)" }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
