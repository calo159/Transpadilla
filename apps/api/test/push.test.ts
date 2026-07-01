import { describe, it, expect } from "vitest";
import { suscripcionesParaRuta } from "../src/lib/push-util";

describe("suscripcionesParaRuta", () => {
  const subs = [
    { id: 1, rutas: [1, 2] },
    { id: 2, rutas: [3] },
    { id: 3, rutas: [] },
    { id: 4, rutas: [2, 5] },
  ];

  it("devuelve solo las suscripciones que siguen la ruta", () => {
    expect(suscripcionesParaRuta(subs, 2).map((s) => s.id)).toEqual([1, 4]);
    expect(suscripcionesParaRuta(subs, 3).map((s) => s.id)).toEqual([2]);
  });

  it("ruta sin seguidores → vacío", () => {
    expect(suscripcionesParaRuta(subs, 99)).toEqual([]);
  });

  it("tolera rutas no-array", () => {
    const raras = [{ id: 1, rutas: undefined as unknown as number[] }];
    expect(suscripcionesParaRuta(raras, 1)).toEqual([]);
  });
});
