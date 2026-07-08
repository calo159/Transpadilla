import { describe, it, expect } from "vitest";
import { agruparRutasConParadas, type RutaParadaRow } from "../src/lib/agrupar-rutas";

const fila = (over: Partial<RutaParadaRow> & Pick<RutaParadaRow, "id">): RutaParadaRow => ({
  nombre: `R${over.id}`,
  color: "#000",
  activa: true,
  ruta_parada_id: over.parada_id != null ? over.parada_id + 1000 : null,
  parada_id: null,
  parada_nombre: null,
  latitud: null,
  longitud: null,
  orden: null,
  ...over,
});

describe("agruparRutasConParadas", () => {
  it("sin filas devuelve []", () => {
    expect(agruparRutasConParadas([])).toEqual([]);
  });

  it("una ruta sin paradas (LEFT JOIN sin match) → paradas: []", () => {
    const r = agruparRutasConParadas([fila({ id: 1 })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe(1);
    expect(r[0]!.paradas).toEqual([]);
  });

  it("agrupa varias paradas de una ruta en orden", () => {
    const rows: RutaParadaRow[] = [
      fila({ id: 1, parada_id: 100, parada_nombre: "A", latitud: 1, longitud: 1, orden: 0 }),
      fila({ id: 1, parada_id: 101, parada_nombre: "B", latitud: 2, longitud: 2, orden: 1 }),
    ];
    const r = agruparRutasConParadas(rows);
    expect(r).toHaveLength(1);
    expect(r[0]!.paradas.map((p) => p.id)).toEqual([100, 101]);
    expect(r[0]!.paradas[0]).toEqual({ id: 100, nombre: "A", latitud: 1, longitud: 1, orden: 0, asignacion_id: 1100 });
  });

  it("una misma parada puede repetirse en la ruta (asignacion_id distingue cada ocurrencia)", () => {
    const rows: RutaParadaRow[] = [
      fila({ id: 1, ruta_parada_id: 900, parada_id: 100, parada_nombre: "A", latitud: 1, longitud: 1, orden: 0 }),
      fila({ id: 1, ruta_parada_id: 901, parada_id: 200, parada_nombre: "B", latitud: 2, longitud: 2, orden: 1 }),
      fila({ id: 1, ruta_parada_id: 902, parada_id: 100, parada_nombre: "A", latitud: 1, longitud: 1, orden: 2 }),
    ];
    const r = agruparRutasConParadas(rows);
    expect(r[0]!.paradas.map((p) => p.id)).toEqual([100, 200, 100]);
    expect(r[0]!.paradas.map((p) => p.asignacion_id)).toEqual([900, 901, 902]);
  });

  it("agrupa varias rutas por separado, en orden de id", () => {
    const rows: RutaParadaRow[] = [
      fila({ id: 1, parada_id: 100, parada_nombre: "A", latitud: 1, longitud: 1, orden: 0 }),
      fila({ id: 2, parada_id: 200, parada_nombre: "X", latitud: 3, longitud: 3, orden: 0 }),
      fila({ id: 2, parada_id: 201, parada_nombre: "Y", latitud: 4, longitud: 4, orden: 1 }),
    ];
    const r = agruparRutasConParadas(rows);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
    expect(r[0]!.paradas).toHaveLength(1);
    expect(r[1]!.paradas.map((p) => p.id)).toEqual([200, 201]);
  });

  it("no inventa paradas a partir de columnas null", () => {
    const r = agruparRutasConParadas([
      fila({ id: 1, parada_id: null, latitud: null, longitud: null }),
    ]);
    expect(r[0]!.paradas).toEqual([]);
  });
});
