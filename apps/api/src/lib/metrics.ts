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
