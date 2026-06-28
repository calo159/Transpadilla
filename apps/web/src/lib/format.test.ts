import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tiempoRelativo, formatearDuracion } from "@/lib/format";

describe("tiempoRelativo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve 'sin datos' si no hay fecha", () => {
    expect(tiempoRelativo(null)).toBe("sin datos");
    expect(tiempoRelativo(undefined)).toBe("sin datos");
  });

  it("muestra segundos cuando es reciente (< 1 min)", () => {
    expect(tiempoRelativo("2026-01-01T11:59:55Z")).toBe("hace 5s");
  });

  it("muestra minutos cuando es < 1 hora", () => {
    expect(tiempoRelativo("2026-01-01T11:57:00Z")).toBe("hace 3 min");
  });

  it("muestra horas cuando es >= 1 hora", () => {
    expect(tiempoRelativo("2026-01-01T10:00:00Z")).toBe("hace 2 h");
  });
});

describe("formatearDuracion", () => {
  it("formatea como M:SS por debajo de una hora, con padding", () => {
    expect(formatearDuracion(0)).toBe("00:00");
    expect(formatearDuracion(5)).toBe("00:05");
    expect(formatearDuracion(65)).toBe("01:05");
    expect(formatearDuracion(599)).toBe("09:59");
  });

  it("formatea como H:MM:SS a partir de una hora", () => {
    expect(formatearDuracion(3600)).toBe("1:00:00");
    expect(formatearDuracion(3661)).toBe("1:01:01");
    expect(formatearDuracion(7325)).toBe("2:02:05");
  });
});
