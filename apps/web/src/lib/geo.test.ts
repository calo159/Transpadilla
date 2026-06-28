import { describe, it, expect } from "vitest";
import { distanciaKm, velEfectiva } from "@/lib/geo";

describe("distanciaKm (Haversine)", () => {
  it("es 0 entre un punto y sí mismo", () => {
    expect(distanciaKm(11.5444, -72.9072, 11.5444, -72.9072)).toBe(0);
  });

  it("es simétrica (a→b == b→a)", () => {
    const ab = distanciaKm(11.54, -72.90, 11.55, -72.91);
    const ba = distanciaKm(11.55, -72.91, 11.54, -72.90);
    expect(ab).toBeCloseTo(ba, 10);
  });

  it("calcula una distancia conocida (~1 grado de latitud ≈ 111 km)", () => {
    const d = distanciaKm(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it("da un valor finito y positivo entre dos puntos de Riohacha", () => {
    const d = distanciaKm(11.5444, -72.9072, 11.5360, -72.9190);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(5); // misma ciudad: pocos km
  });
});

describe("velEfectiva", () => {
  it("usa el promedio urbano (18) si no hay dato o está detenido", () => {
    expect(velEfectiva(null)).toBe(18);
    expect(velEfectiva(undefined)).toBe(18);
    expect(velEfectiva(0)).toBe(18);
    expect(velEfectiva(4.9)).toBe(18);
  });

  it("respeta la velocidad real cuando es >= 5", () => {
    expect(velEfectiva(5)).toBe(5);
    expect(velEfectiva(30)).toBe(30);
  });

  it("nunca devuelve 0 (evita división por cero en el ETA)", () => {
    for (const v of [null, undefined, 0, -10, 1, 4, 5, 50]) {
      expect(velEfectiva(v as number | null | undefined)).toBeGreaterThan(0);
    }
  });
});
