import { AlertTriangle, HelpCircle } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

export interface ConfirmOpts {
  titulo: string;
  descripcion: string;
  textoConfirmar?: string;
  destructivo?: boolean;
  accion: () => void | Promise<void>;
}

/**
 * Diálogo de confirmación reutilizable y controlado. Se le pasa `opts` (o null) y
 * un setter para cerrarlo. Reemplaza al `window.confirm()` por una UI de marca.
 *
 * Nota de estilo: se renderiza por portal en el <body> (fuera de `.tp-light`), así
 * que se usan colores de marca constantes (`var(--color-navy/danger/...)`, `#fff`)
 * con estilos explícitos en vez de tokens de tema, para que se vea igual y correcto
 * abra desde donde abra.
 */
export function ConfirmDialog({
  opts,
  onClose,
}: {
  opts: ConfirmOpts | null;
  onClose: () => void;
}) {
  const destructivo = !!opts?.destructivo;
  const acento = destructivo ? "var(--color-danger)" : "var(--color-blue)";
  const Icono = destructivo ? AlertTriangle : HelpCircle;

  return (
    <AlertDialog open={!!opts} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent
        className="tp-light max-w-sm gap-0 border-0 rounded-2xl p-0 overflow-hidden tp-shadow-float"
        style={{ background: "#fff" }}
      >
        {/* Franja de acento superior según el tipo */}
        <div style={{ height: 4, background: acento }} />
        <div className="p-6">
          <AlertDialogHeader className="items-center sm:items-center text-center sm:text-center">
            <span
              className="tp-dialog-pop w-14 h-14 rounded-full flex items-center justify-center mb-1"
              style={{ background: `color-mix(in srgb, ${acento} 12%, #fff)`, color: acento }}
            >
              <Icono className="w-7 h-7" />
            </span>
            <AlertDialogTitle className="font-display text-lg" style={{ color: "var(--color-navy)" }}>
              {opts?.titulo}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed" style={{ color: "var(--color-gray-text)" }}>
              {opts?.descripcion}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2 sm:gap-2">
            <AlertDialogCancel
              className="rounded-xl border-0 mt-0 active:scale-95 transition-transform"
              style={{ background: "#fff", color: "var(--color-navy)", boxShadow: "inset 0 0 0 1px #e2e8f0" }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                // AlertDialogAction ya cierra el diálogo (dispara onOpenChange →
                // onClose); por eso aquí NO llamamos onClose, para no hacerlo doble.
                await opts?.accion();
              }}
              className="rounded-xl border-0 text-white active:scale-95 transition-transform hover:opacity-90"
              style={{ background: acento }}
            >
              {opts?.textoConfirmar ?? "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
