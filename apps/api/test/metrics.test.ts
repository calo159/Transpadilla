import { describe, it, expect, beforeEach } from "vitest";
import { registrarRespuesta, registrarError, snapshot, metricasPrometheus } from "../src/lib/metrics";

describe("metrics", () => {
  beforeEach(() => {
    // El módulo mantiene estado propio; cada test parte de una foto y valida deltas.
  });

  it("cuenta requests por clase de estado", () => {
    const antes = snapshot();
    registrarRespuesta(200);
    registrarRespuesta(201);
    registrarRespuesta(404);
    registrarRespuesta(500);
    const despues = snapshot();

    expect(despues.requests).toBe(antes.requests + 4);
    expect(despues.por_estado["2xx"]).toBe(antes.por_estado["2xx"] + 2);
    expect(despues.por_estado["4xx"]).toBe(antes.por_estado["4xx"] + 1);
    expect(despues.por_estado["5xx"]).toBe(antes.por_estado["5xx"] + 1);
  });

  it("registra errores y calcula la tasa de error", () => {
    const antes = snapshot();
    registrarRespuesta(500);
    registrarError(new Error("boom"), "/api/prueba");
    const despues = snapshot();

    expect(despues.errores).toBe(antes.errores + 1);
    expect(despues.ultimos_errores[0]?.mensaje).toBe("boom");
    expect(despues.ultimos_errores[0]?.ruta).toBe("/api/prueba");
    expect(despues.tasa_error).toBeGreaterThanOrEqual(0);
    expect(despues.tasa_error).toBeLessThanOrEqual(1);
  });

  it("el buffer de últimos errores no crece sin límite (tope 30, expone 15)", () => {
    for (let i = 0; i < 40; i++) registrarError(new Error(`e${i}`), "/x");
    const { ultimos_errores } = snapshot();
    expect(ultimos_errores.length).toBeLessThanOrEqual(15);
    // El más reciente queda primero.
    expect(ultimos_errores[0]?.mensaje).toBe("e39");
  });

  it("tolera errores que no son instancias de Error", () => {
    registrarError("string plano", "/y");
    const { ultimos_errores } = snapshot();
    expect(ultimos_errores[0]?.mensaje).toBe("string plano");
  });

  it("metricasPrometheus produce texto de exposición válido (Fase 4.2)", () => {
    const txt = metricasPrometheus();
    // Cabeceras HELP/TYPE + los contadores base.
    expect(txt).toMatch(/# TYPE tp_requests_total counter/);
    expect(txt).toMatch(/^tp_requests_total \d+$/m);
    expect(txt).toMatch(/tp_responses_total\{class="2xx"\} \d+/);
    expect(txt).toMatch(/tp_memory_bytes\{type="rss"\} \d+/);
    // Sin `extra`, no aparecen las métricas opcionales.
    expect(txt).not.toMatch(/tp_ws_connections/);
    expect(txt).not.toMatch(/tp_db_pool/);
  });

  it("metricasPrometheus incluye ws y pool cuando se pasan (Fase 4.2)", () => {
    const txt = metricasPrometheus({ wsConexiones: 42, dbPool: { total: 5, idle: 3, waiting: 0 } });
    expect(txt).toMatch(/tp_ws_connections 42/);
    expect(txt).toMatch(/tp_db_pool\{state="total"\} 5/);
    expect(txt).toMatch(/tp_db_pool\{state="idle"\} 3/);
    expect(txt).toMatch(/tp_db_pool\{state="waiting"\} 0/);
  });
});
