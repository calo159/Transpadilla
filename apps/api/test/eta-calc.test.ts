import { describe, it, expect } from "vitest";
import { calcularEtaPorParada, type EtaParadaInput, type EtaBusInput } from "../src/lib/eta-calc";

// 4 paradas en línea por latitud (~5.5 km entre consecutivas).
const secuencia: EtaParadaInput[] = [
  { id: 10, nombre: "s0", latitud: 0.00, longitud: 0 },
  { id: 11, nombre: "s1", latitud: 0.05, longitud: 0 },
  { id: 12, nombre: "s2", latitud: 0.10, longitud: 0 },
  { id: 13, nombre: "s3", latitud: 0.15, longitud: 0 },
];

const bus = (
  placa: string,
  lat: number | null,
  lng: number | null,
  velocidad: number | null = 60,
): EtaBusInput => ({ placa, lat, lng, velocidad });

describe("calcularEtaPorParada", () => {
  it("sin paradas devuelve vacío", () => {
    expect(calcularEtaPorParada([], [])).toEqual({ buses_activos: 0, paradas: [] });
  });

  it("sin buses: todas las paradas con eta_min y placa null", () => {
    const r = calcularEtaPorParada(secuencia, []);
    expect(r.buses_activos).toBe(0);
    expect(r.paradas).toHaveLength(4);
    for (const p of r.paradas) {
      expect(p.eta_min).toBeNull();
      expect(p.placa).toBeNull();
    }
  });

  it("un bus al inicio: ETA 0 en su parada y creciente hacia el final", () => {
    const r = calcularEtaPorParada(secuencia, [bus("AAA", 0, 0)]);
    expect(r.buses_activos).toBe(1);
    expect(r.paradas[0]!.eta_min).toBe(0);
    expect(r.paradas[0]!.placa).toBe("AAA");
    // Monótono creciente y finito.
    const etas = r.paradas.map((p) => p.eta_min!);
    expect(etas.every((e) => Number.isFinite(e) && e >= 0)).toBe(true);
    expect(etas[1]!).toBeLessThan(etas[2]!);
    expect(etas[2]!).toBeLessThan(etas[3]!);
  });

  it("bus en medio (s2), circuito cerrado: las paradas ya pasadas dan casi una vuelta", () => {
    const r = calcularEtaPorParada(secuencia, [bus("MID", 0.10, 0)]);
    expect(r.paradas[2]!.eta_min).toBe(0);    // s2 = posición del bus
    expect(r.paradas[2]!.placa).toBe("MID");
    expect(r.paradas[3]!.eta_min!).toBeGreaterThan(0); // s3 justo por delante
    // s0 y s1 quedan "detrás": el bus las alcanza dando la vuelta (no null, no 0),
    // y por eso su ETA es MAYOR que la de s3 (que está justo adelante).
    expect(r.paradas[0]!.eta_min!).toBeGreaterThan(r.paradas[3]!.eta_min!);
    expect(r.paradas[1]!.eta_min!).toBeGreaterThan(r.paradas[0]!.eta_min!);
    expect(r.paradas.every((p) => Number.isFinite(p.eta_min!))).toBe(true);
  });

  it("con dos buses, cada parada elige el que llega más pronto (por delante en el circuito)", () => {
    const lejano = bus("FAR", 0, 0);      // en s0
    const cercano = bus("NEAR", 0.10, 0); // en s2
    const r = calcularEtaPorParada(secuencia, [lejano, cercano]);
    expect(r.buses_activos).toBe(2);
    // s1: el de s0 llega en 1 segmento; el de s2 tendría que dar casi la vuelta → gana FAR.
    expect(r.paradas[1]!.placa).toBe("FAR");
    // s3: el de s2 la alcanza en 1 segmento; el de s0 en 3 → gana NEAR.
    expect(r.paradas[3]!.placa).toBe("NEAR");
  });

  it("velocidad 0/null: ETA finito (usa 18 km/h), nunca Infinity/NaN", () => {
    for (const vel of [0, null]) {
      const r = calcularEtaPorParada(secuencia, [bus("ZERO", 0, 0, vel)]);
      const eta = r.paradas[3]!.eta_min!;
      expect(Number.isFinite(eta)).toBe(true);
      expect(eta).toBeGreaterThan(0);
    }
  });

  it("ignora buses sin posición (lat/lng null)", () => {
    const r = calcularEtaPorParada(secuencia, [bus("NOPOS", null, null)]);
    expect(r.buses_activos).toBe(0);
    expect(r.paradas.every((p) => p.eta_min === null)).toBe(true);
  });
});
