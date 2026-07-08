import { describe, it, expect } from "vitest";
import { haversineMetros, velEfectiva, posEnCircuito, distanciaAdelanteM } from "../src/lib/geo";

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

describe("distanciaAdelanteM", () => {
  it("es la diferencia directa cuando el destino está por delante", () => {
    expect(distanciaAdelanteM(10, 30, 100)).toBe(20);
  });
  it("da la vuelta (wrap-around) cuando el destino quedó atrás", () => {
    // desde 30 hasta 10 en un circuito de 100 → 80 (casi toda la vuelta).
    expect(distanciaAdelanteM(30, 10, 100)).toBe(80);
  });
  it("L<=0 → 0 (circuito degenerado)", () => {
    expect(distanciaAdelanteM(5, 9, 0)).toBe(0);
  });
});

describe("posEnCircuito", () => {
  // Circuito cuadrado de ~1.1 km de lado (paradas en las esquinas), sentido horario.
  const paradas = [
    { latitud: 0.00, longitud: 0.00 },
    { latitud: 0.01, longitud: 0.00 },
    { latitud: 0.01, longitud: 0.01 },
    { latitud: 0.00, longitud: 0.01 },
  ];

  it("menos de 2 paradas → null", () => {
    expect(posEnCircuito(0, 0, [])).toBeNull();
    expect(posEnCircuito(0, 0, [{ latitud: 0, longitud: 0 }])).toBeNull();
  });

  it("ubica la 1ª parada en s≈0 y el circuito cierra (L≈4 lados)", () => {
    const p0 = posEnCircuito(0, 0, paradas)!;
    expect(p0).not.toBeNull();
    const lado = haversineMetros(0, 0, 0.01, 0);
    expect(p0.s).toBeLessThan(lado * 0.1); // muy cerca del inicio
    expect(p0.L).toBeGreaterThan(lado * 3.5); // 4 lados cerrados
  });

  it("un bus que ACABA de pasar al usuario queda a casi una vuelta por delante", () => {
    // Usuario en la 2ª parada; bus un poco después (ya lo pasó, avanzando en el sentido).
    const usuario = posEnCircuito(0.01, 0.00, paradas)!;
    const bus = posEnCircuito(0.01, 0.002, paradas)!; // sobre el lado 2, tras el usuario
    const adelante = distanciaAdelanteM(bus.s, usuario.s, usuario.L);
    // El bus debe recorrer casi todo el circuito para volver al usuario.
    expect(adelante).toBeGreaterThan(usuario.L * 0.7);
  });
});
