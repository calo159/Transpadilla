import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Job de historial: cada ~60 s toma una "foto" de los buses en circulación y la
 * guarda en posiciones_historial. NO se escribe en cada ping de GPS (sería
 * enorme); muestrear acota la escritura a ≤ (nº de buses) filas por minuto.
 *
 * También poda periódicamente el historial viejo para controlar el tamaño en la
 * base (importante en planes con poco almacenamiento).
 *
 * Configurable por entorno:
 *   HISTORIAL=false            → desactiva el job (p. ej. en tests)
 *   HISTORIAL_INTERVALO_MS     → cada cuánto toma la foto (default 60000)
 *   HISTORIAL_RETENCION_DIAS   → cuántos días conserva (default 30)
 */
const INTERVALO_MS = Number(process.env["HISTORIAL_INTERVALO_MS"] ?? 60_000);
const RETENCION_DIAS = Number(process.env["HISTORIAL_RETENCION_DIAS"] ?? 30);
const PODA_CADA = 60; // podar una vez cada 60 snapshots (~1 h con 60 s)

let snapTimer: NodeJS.Timeout | null = null;

async function tomarSnapshot(): Promise<void> {
  // Una sola query: copia la posición actual de los buses activos/en demora.
  await pool.query(
    `INSERT INTO posiciones_historial (bus_id, ruta_id, lat, lng, velocidad, ocupacion)
       SELECT id, ruta_id, lat, lng, velocidad, ocupacion
       FROM buses
       WHERE estado <> 'inactivo' AND lat IS NOT NULL AND lng IS NOT NULL`,
  );
}

async function podar(): Promise<void> {
  await pool.query(
    `DELETE FROM posiciones_historial WHERE capturado < now() - ($1 || ' days')::interval`,
    [String(RETENCION_DIAS)],
  );
}

/** Arranca el job de snapshot. Devuelve una función para detenerlo (apagado ordenado). */
export function iniciarHistorial(): () => void {
  if (process.env["HISTORIAL"] === "false") {
    logger.info("Historial desactivado (HISTORIAL=false)");
    return () => {};
  }
  let ciclos = 0;
  snapTimer = setInterval(() => {
    void (async () => {
      try {
        await tomarSnapshot();
        if (++ciclos % PODA_CADA === 0) await podar();
      } catch (err) {
        // Best-effort: un fallo del historial no debe tumbar el servicio.
        logger.warn({ err }, "Snapshot de historial falló (se reintenta al siguiente ciclo)");
      }
    })();
  }, INTERVALO_MS);
  // No bloquear el cierre del proceso por este timer.
  snapTimer.unref?.();
  logger.info({ intervaloMs: INTERVALO_MS, retencionDias: RETENCION_DIAS }, "Job de historial iniciado");
  return () => {
    if (snapTimer) { clearInterval(snapTimer); snapTimer = null; }
  };
}
