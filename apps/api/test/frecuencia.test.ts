import { describe, it, expect } from "vitest";
import { calcularFrecuencia, type MuestraFrec } from "../src/lib/frecuencia";

const MIN = 60_000;

describe("calcularFrecuencia (headway proxy)", () => {
  it("sin datos → sin rutas y global null", () => {
    const r = calcularFrecuencia([]);
    expect(r.rutas).toEqual([]);
    expect(r.global_headway_min).toBeNull();
  });

  it("una sola aparición → headway null (insuficiente)", () => {
    const muestras: MuestraFrec[] = [
      { rutaId: 1, busId: 10, t: 0 },
      { rutaId: 1, busId: 10, t: MIN }, // misma aparición (gap < 5 min)
    ];
    const r = calcularFrecuencia(muestras);
    expect(r.rutas[0]!.apariciones).toBe(1);
    expect(r.rutas[0]!.headway_min).toBeNull();
  });

  it("apariciones cada 10 min → headway 10", () => {
    // Bus A aparece en t=0, Bus B en t=10min, Bus A reaparece (nueva) en t=20min.
    const muestras: MuestraFrec[] = [
      { rutaId: 1, busId: 10, t: 0 },
      { rutaId: 1, busId: 20, t: 10 * MIN },
      { rutaId: 1, busId: 10, t: 20 * MIN },
    ];
    const r = calcularFrecuencia(muestras);
    expect(r.rutas[0]!.apariciones).toBe(3);
    expect(r.rutas[0]!.headway_min).toBe(10);
    expect(r.global_headway_min).toBe(10);
  });

  it("muestras contiguas del mismo bus cuentan como UNA aparición", () => {
    const muestras: MuestraFrec[] = [
      { rutaId: 2, busId: 5, t: 0 },
      { rutaId: 2, busId: 5, t: MIN },
      { rutaId: 2, busId: 5, t: 2 * MIN }, // sigue siendo la misma aparición
    ];
    const r = calcularFrecuencia(muestras);
    expect(r.rutas[0]!.apariciones).toBe(1);
  });
});
