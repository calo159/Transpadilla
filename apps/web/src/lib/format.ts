// Utilidades de formato de tiempo para la interfaz.

/** "hace 5s" / "hace 3 min" / "hace 2 h" a partir de una fecha ISO. */
export function tiempoRelativo(isoDate: string | null | undefined): string {
  if (!isoDate) return "sin datos";
  const diff = (Date.now() - new Date(isoDate).getTime()) / 1000;
  if (diff < 60) return `hace ${Math.round(diff)}s`;
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  return `hace ${Math.round(diff / 3600)} h`;
}

/** Segundos → "M:SS" o "H:MM:SS" (cronómetro del recorrido del conductor). */
export function formatearDuracion(totalSegundos: number): string {
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = totalSegundos % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
