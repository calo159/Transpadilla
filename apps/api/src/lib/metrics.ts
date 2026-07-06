// Métricas en memoria (sin dependencias, bundle-safe). Da observabilidad básica
// —requests, errores, últimos fallos— sin un SDK pesado. Se exponen por
// GET /api/metrics (solo admin). Al reiniciar el proceso se reinician (es normal).

const MAX_ERRORES = 30;

interface ErrorRegistrado {
  ts: string;
  ruta: string;
  mensaje: string;
}

const inicio = Date.now();
let requests = 0;
const porEstado = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
let errores = 0;
const ultimosErrores: ErrorRegistrado[] = [];

function claseEstado(status: number): keyof typeof porEstado {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  return "2xx";
}

/** Cuenta una respuesta HTTP por su clase de estado. */
export function registrarRespuesta(status: number): void {
  requests++;
  porEstado[claseEstado(status)]++;
}

/** Registra un error no controlado (para el conteo y el buffer de últimos errores). */
export function registrarError(err: unknown, ruta: string): void {
  errores++;
  const mensaje = err instanceof Error ? err.message : String(err);
  ultimosErrores.unshift({ ts: new Date().toISOString(), ruta, mensaje: mensaje.slice(0, 300) });
  if (ultimosErrores.length > MAX_ERRORES) ultimosErrores.length = MAX_ERRORES;
}

/**
 * Métricas en formato de exposición Prometheus (texto plano), para
 * GET /api/metrics/prometheus (Fase 4.2). Reutiliza los mismos contadores en
 * memoria — sin dependencias (no hay prom-client). `extra` permite inyectar
 * métricas que viven fuera de este módulo (conexiones WebSocket, pool de BD).
 */
export function metricasPrometheus(extra?: {
  wsConexiones?: number;
  dbPool?: { total: number; idle: number; waiting: number };
}): string {
  const mem = process.memoryUsage();
  const l: string[] = [];

  l.push("# HELP tp_uptime_seconds Segundos desde el arranque del proceso.");
  l.push("# TYPE tp_uptime_seconds gauge");
  l.push(`tp_uptime_seconds ${Math.round((Date.now() - inicio) / 1000)}`);

  l.push("# HELP tp_requests_total Total de respuestas HTTP servidas.");
  l.push("# TYPE tp_requests_total counter");
  l.push(`tp_requests_total ${requests}`);

  l.push("# HELP tp_responses_total Respuestas HTTP por clase de estado.");
  l.push("# TYPE tp_responses_total counter");
  for (const clase of Object.keys(porEstado) as (keyof typeof porEstado)[]) {
    l.push(`tp_responses_total{class="${clase}"} ${porEstado[clase]}`);
  }

  l.push("# HELP tp_errors_total Errores no controlados (500).");
  l.push("# TYPE tp_errors_total counter");
  l.push(`tp_errors_total ${errores}`);

  l.push("# HELP tp_memory_bytes Memoria del proceso Node.");
  l.push("# TYPE tp_memory_bytes gauge");
  l.push(`tp_memory_bytes{type="rss"} ${mem.rss}`);
  l.push(`tp_memory_bytes{type="heap_used"} ${mem.heapUsed}`);

  if (typeof extra?.wsConexiones === "number") {
    l.push("# HELP tp_ws_connections Conexiones WebSocket (Socket.IO) activas.");
    l.push("# TYPE tp_ws_connections gauge");
    l.push(`tp_ws_connections ${extra.wsConexiones}`);
  }

  if (extra?.dbPool) {
    l.push("# HELP tp_db_pool Conexiones del pool de PostgreSQL.");
    l.push("# TYPE tp_db_pool gauge");
    l.push(`tp_db_pool{state="total"} ${extra.dbPool.total}`);
    l.push(`tp_db_pool{state="idle"} ${extra.dbPool.idle}`);
    l.push(`tp_db_pool{state="waiting"} ${extra.dbPool.waiting}`);
  }

  return l.join("\n") + "\n";
}

/** Foto actual de las métricas (para el endpoint /api/metrics). */
export function snapshot() {
  const mem = process.memoryUsage();
  return {
    uptime_s: Math.round((Date.now() - inicio) / 1000),
    node: process.version,
    memoria_mb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heap_usado: Math.round(mem.heapUsed / 1024 / 1024),
    },
    requests,
    por_estado: { ...porEstado },
    errores,
    tasa_error: requests > 0 ? Number((errores / requests).toFixed(4)) : 0,
    ultimos_errores: ultimosErrores.slice(0, 15),
  };
}
