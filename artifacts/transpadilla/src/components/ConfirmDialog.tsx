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
 * un setter para cerrarlo. Reemplaza al `window.confirm()` por una UI profesional.
 */
export function ConfirmDialog({
  opts,
  onClose,
}: {
  opts: ConfirmOpts | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={!!opts} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.titulo}</AlertDialogTitle>
          <AlertDialogDescription>{opts?.descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await opts?.accion();
              onClose();
            }}
            className={opts?.destructivo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {opts?.textoConfirmar ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
