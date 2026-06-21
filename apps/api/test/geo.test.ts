import { describe, it, expect } from "vitest";
import { haversineMetros, velEfectiva } from "../src/lib/geo";

describe("haversineMetros", () => {
  it("es 0 entre el mismo punto", () => {
    expect(haversineMetros(11.5444, -72.9072, 11.5444, -72.9072)).toBe(0);
  });

  it("calcula ~1.11 km por 0.01° de latitud", () => {
    const d = haversineMetros(11.5, -72.9, 11.51, -72.9);
    // 0.01° de latitud ≈ 1112 m; toleramos ±10 m.
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1125);
  });

  it("es simétrica", () => {
    const ab = haversineMetros(11.5, -72.9, 11.55, -72.95);
    const ba = haversineMetros(11.55, -72.95, 11.5, -72.9);
    expect(ab).toBeCloseTo(ba, 6);
  });
});

describe("velEfectiva", () => {
  it("usa 18 km/h cuando está detenido o sin dato", () => {
    expect(velEfectiva(0)).toBe(18);
    expect(velEfectiva(null)).toBe(18);
    expect(velEfectiva(undefined)).toBe(18);
    expect(velEfectiva(3)).toBe(18);
  });

  it("respeta la velocidad real si es >= 5", () => {
    expect(velEfectiva(30)).toBe(30);
    expect(velEfectiva(5)).toBe(5);
  });
});
