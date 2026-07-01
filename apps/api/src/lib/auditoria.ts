import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Registra una acción administrativa en la tabla `auditoria`. Best-effort: si el
 * insert falla, NO rompe la request (la operación principal ya se hizo). Solo se
 * llama en mutaciones protegidas por `requireRol("admin")`.
 */
export function registrarAuditoria(
  usuarioId: number | undefined,
  accion: string,
  entidadTipo?: string,
  entidadId?: number | null,
  detalle?: unknown,
): void {
  void pool
    .query(
      `INSERT INTO auditoria (usuario_id, accion, entidad_tipo, entidad_id, detalle)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        usuarioId ?? null,
        accion,
        entidadTipo ?? null,
        entidadId ?? null,
        detalle != null ? JSON.stringify(detalle) : null,
      ],
    )
    .catch((err) => logger.warn({ err, accion }, "No se pudo registrar auditoría (best-effort)"));
}
