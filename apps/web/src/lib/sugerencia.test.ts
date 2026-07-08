import { describe, it, expect } from "vitest";
import type { Bus, Ruta, Parada } from "@workspace/api-client";
import { recomendarRuta, busMasCercano } from "@/lib/sugerencia";

// ── Fixtures mínimos (solo los campos que usan las funciones; tipos en runtime
//    no se necesitan porque los imports de tipos se borran al compilar). ──
const parada = (id: number, lat: number, lng: number): Parada =>
  ({ id, nombre: `P${id}`, latitud: lat, longitud: lng } as unknown as Parada);

const ruta = (id: number, paradas: Parada[], activa = true): Ruta =>
  ({ id, nombre: `R${id}`, color: "#000", activa, paradas } as unknown as Ruta);

const bus = (
  id: number,
  ruta_id: number,
  lat: number | null,
  lng: number | null,
  estado = "activo",
  velocidad: number | null = 20,
): Bus => ({ id, ruta_id, lat, lng, estado, velocidad } as unknown as Bus);

const DEST = { lat: 0, lng: 0 };
// A 0 grados, 1° de latitud ≈ 111 km → 0.001° ≈ 111 m.

describe("recomendarRuta", () => {
  it("sin origen, elige la ruta cuya parada quede más cerca del destino", () => {
    const cerca = ruta(1, [parada(10, 0.001, 0)]); // ~111 m
    const lejos = ruta(2, [parada(20, 0.005, 0)]); // ~555 m
    const sug = recomendarRuta([lejos, cerca], DEST);
    expect(sug).not.toBeNull();
    expect(sug!.ruta.id).toBe(1);
    expect(sug!.paradaDestino.id).toBe(10);
  });

  it("devuelve null si todas las paradas quedan más lejos que la caminata máxima (1.2 km)", () => {
    const muyLejos = ruta(1, [parada(10, 0.02, 0)]); // ~2.2 km
    expect(recomendarRuta([muyLejos], DEST)).toBeNull();
  });

  it("ignora rutas inactivas y rutas sin paradas", () => {
    const inactivaCerca = ruta(1, [parada(10, 0.0005, 0)], false); // cerca pero inactiva
    const vacia = ruta(2, []); // sin paradas
    const activaOk = ruta(3, [parada(30, 0.005, 0)]); // ~555 m, activa
    const sug = recomendarRuta([inactivaCerca, vacia, activaOk], DEST);
    expect(sug).not.toBeNull();
    expect(sug!.ruta.id).toBe(3);
  });

  it("con origen, minimiza la caminata total (abordaje + bajada)", () => {
    const origen = { lat: 0.01, lng: 0 }; // ~1.11 km al norte del destino
    // Ruta A: una parada junto al origen y otra junto al destino → caminata casi nula.
    const rutaA = ruta(1, [parada(10, 0.01, 0), parada(11, 0.001, 0)]);
    // Ruta B: una sola parada junto al destino → hay que caminar ~1 km desde el origen.
    const rutaB = ruta(2, [parada(20, 0.001, 0)]);
    const sug = recomendarRuta([rutaB, rutaA], DEST, origen);
    expect(sug!.ruta.id).toBe(1);
    expect(sug!.paradaOrigen?.id).toBe(10);
  });

  it("en empate de caminata, prefiere el recorrido en bus más corto (circuito cerrado)", () => {
    // Las rutas son circuitos cerrados: cualquier origen→destino es alcanzable
    // dando la vuelta, así que ya no se descarta un "sentido"; en empate de
    // caminata se prefiere el trayecto A BORDO más corto en el sentido de la ruta.
    const origenStop = parada(10, 0.01, 0);
    const destStop = parada(11, 0, 0.01);
    const waypoint = parada(12, 0.01, 0.01);
    const origen = { lat: 0.01, lng: 0 };
    const destino = { lat: 0, lng: 0.01 };
    // Corta: abordaje → bajada es el tramo directo (~1.57 km a bordo).
    const corta = ruta(1, [origenStop, destStop, waypoint]);
    // Larga: abordaje → bajada pasa por el punto intermedio (~2.22 km a bordo).
    const larga = ruta(2, [origenStop, waypoint, destStop]);
    const sug = recomendarRuta([larga, corta], destino, origen);
    expect(sug!.ruta.id).toBe(1); // gana la ruta con el trayecto a bordo más corto
  });
});

describe("busMasCercano", () => {
  const ref = { lat: 0, lng: 0 };

  it("elige el bus activo más cercano con posición, de la ruta indicada", () => {
    const buses = [
      bus(1, 1, 0.003, 0), // ~333 m
      bus(2, 1, 0.001, 0), // ~111 m  ← el más cercano
      bus(3, 2, 0.0001, 0), // otra ruta (se ignora)
      bus(4, 1, 0.0001, 0, "inactivo"), // inactivo (se ignora)
      bus(5, 1, null, null), // sin posición (se ignora)
    ];
    const res = busMasCercano(buses, 1, ref);
    expect(res).not.toBeNull();
    expect(res!.bus.id).toBe(2);
    expect(res!.etaMin).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(res!.etaMin)).toBe(true);
  });

  it("devuelve null si no hay buses elegibles", () => {
    expect(busMasCercano([], 1, ref)).toBeNull();
    expect(busMasCercano([bus(1, 99, 0.001, 0)], 1, ref)).toBeNull(); // solo otra ruta
  });
});
