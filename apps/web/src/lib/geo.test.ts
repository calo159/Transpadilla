import { describe, it, expect } from "vitest";
import { distanciaKm, velEfectiva, etaPorParadaDeBus } from "@/lib/geo";

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

describe("etaPorParadaDeBus", () => {
  // Circuito cuadrado pequeño (4 paradas, cierra de vuelta a la 0).
  const paradas = [
    { latitud: 11.54, longitud: -72.90 },
    { latitud: 11.55, longitud: -72.90 },
    { latitud: 11.55, longitud: -72.91 },
    { latitud: 11.54, longitud: -72.91 },
  ];

  it("da {} con menos de 2 paradas o sin posición del bus", () => {
    expect(etaPorParadaDeBus([paradas[0]!], { lat: 11.54, lng: -72.90, velocidad: 30 })).toEqual({});
    expect(etaPorParadaDeBus(paradas, { lat: null, lng: null, velocidad: 30 })).toEqual({});
    expect(etaPorParadaDeBus(paradas, {})).toEqual({});
  });

  it("sigue A ESE bus específico: ETA≈0 en su propia posición, creciente hacia adelante", () => {
    // El bus está justo en la parada 1 (índice 1).
    const bus = { lat: paradas[1]!.latitud, lng: paradas[1]!.longitud, velocidad: 30 };
    const etas = etaPorParadaDeBus(paradas, bus);
    expect(Object.keys(etas)).toHaveLength(4);
    // En su propia parada, el ETA es ~0 (puede haber un residuo mínimo de redondeo/proyección).
    expect(etas[1]!).toBeLessThanOrEqual(1);
    // Adelante en el sentido del recorrido: parada 2 más cerca que la 3, y la 3
    // más cerca que la 0 (que el bus ya pasó — casi una vuelta completa).
    expect(etas[2]!).toBeLessThan(etas[3]!);
    expect(etas[3]!).toBeLessThan(etas[0]!);
    // Todos los ETA son finitos y no negativos.
    Object.values(etas).forEach((eta) => {
      expect(Number.isFinite(eta)).toBe(true);
      expect(eta).toBeGreaterThanOrEqual(0);
    });
  });

  it("un bus más lento da ETAs mayores que uno rápido, misma posición", () => {
    const lento = etaPorParadaDeBus(paradas, { lat: paradas[0]!.latitud, lng: paradas[0]!.longitud, velocidad: 10 });
    const rapido = etaPorParadaDeBus(paradas, { lat: paradas[0]!.latitud, lng: paradas[0]!.longitud, velocidad: 40 });
    expect(lento[2]!).toBeGreaterThan(rapido[2]!);
  });
});
