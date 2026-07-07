/**
 * Ocupación reportada por el conductor de un bus. Un único lugar para el color
 * y la etiqueta de cada nivel — antes duplicado inline en 3 sitios de Pasajero.tsx
 * (marcador del bus, panel de detalle y hoja móvil), con textos ligeramente
 * distintos entre ellos.
 */
export type NivelOcupacion = "vacio" | "medio" | "lleno";

export interface OcupacionInfo {
  nivel: NivelOcupacion;
  label: string;
  color: string;
}

const NIVELES: Record<NivelOcupacion, OcupacionInfo> = {
  vacio: { nivel: "vacio", label: "Disponible", color: "#38A169" },
  medio: { nivel: "medio", label: "Medio", color: "#F5B731" },
  lleno: { nivel: "lleno", label: "Lleno", color: "#E53E3E" },
};

/** Orden creciente de ocupación, usado para pintar las barras de nivel. */
export const OCUPACION_ORDEN: NivelOcupacion[] = ["vacio", "medio", "lleno"];

export function ocupacionInfo(valor?: string | null): OcupacionInfo | null {
  if (!valor) return null;
  return NIVELES[valor as NivelOcupacion] ?? null;
}
