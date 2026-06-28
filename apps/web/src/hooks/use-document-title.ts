import { useEffect } from "react";

/**
 * Fija el título de la pestaña según la pantalla actual (SPA). Mejora el manejo
 * de pestañas/historial del navegador y el contexto que anuncian los lectores de
 * pantalla al cambiar de página. El siguiente render de otra página lo sobreescribe.
 */
export function useDocumentTitle(titulo: string): void {
  useEffect(() => {
    document.title = titulo;
  }, [titulo]);
}
