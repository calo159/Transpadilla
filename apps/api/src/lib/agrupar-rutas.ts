// Agrupa el resultado plano de la query "rutas LEFT JOIN ruta_paradas LEFT JOIN
// paradas" (una fila por par ruta×parada) en rutas con su arreglo de paradas.
// Se extrae aquí para poder probarlo sin base de datos y para quitar el N+1 de
// GET /rutas (antes: 1 query + una por cada ruta).

export interface RutaParadaRow {
  id: number;
  nombre: string;
  color: string;
  activa: boolean;
  // Id de la fila ruta_paradas (la asignación), no de la parada física: una misma
  // parada puede repetirse varias veces en el recorrido de una ruta, así que
  // `parada_id` deja de ser único dentro de una ruta — `asignacion_id` sí lo es.
  ruta_parada_id: number | null;
  parada_id: number | null;
  parada_nombre: string | null;
  latitud: number | null;
  longitud: number | null;
  orden: number | null;
}

export interface ParadaSalida {
  id: number;
  nombre: string;
  latitud: number;
  longitud: number;
  orden: number;
  asignacion_id: number;
}

export interface RutaConParadas {
  id: number;
  nombre: string;
  color: string;
  activa: boolean;
  paradas: ParadaSalida[];
}

/**
 * Las filas deben venir ordenadas por (ruta.id, orden) para que las rutas salgan
 * por id y sus paradas en orden. Las filas sin parada (LEFT JOIN sin coincidencia)
 * crean la ruta con `paradas: []` pero no agregan una parada fantasma.
 */
export function agruparRutasConParadas(rows: RutaParadaRow[]): RutaConParadas[] {
  const mapa = new Map<number, RutaConParadas>();
  for (const r of rows) {
    let ruta = mapa.get(r.id);
    if (!ruta) {
      ruta = { id: r.id, nombre: r.nombre, color: r.color, activa: r.activa, paradas: [] };
      mapa.set(r.id, ruta);
    }
    if (r.parada_id != null && r.latitud != null && r.longitud != null && r.ruta_parada_id != null) {
      ruta.paradas.push({
        id: r.parada_id,
        nombre: r.parada_nombre ?? "",
        latitud: r.latitud,
        longitud: r.longitud,
        orden: r.orden ?? 0,
        asignacion_id: r.ruta_parada_id,
      });
    }
  }
  return [...mapa.values()];
}
