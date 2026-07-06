import type { Request } from "express";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { clienteIp } from "./client-ip";

/**
 * Registra una acción administrativa en la tabla `auditoria`. Best-effort: si el
 * insert falla, NO rompe la request (la operación principal ya se hizo). Solo se
 * llama en mutaciones protegidas por `requireRol("admin")`.
 *
 * Recibe `req` (no solo el id) para capturar IP y user-agent de la petición.
 */
export function registrarAuditoria(
  req: Request,
  accion: string,
  entidadTipo?: string,
  entidadId?: number | null,
  detalle?: unknown,
): void {
  const userAgent = req.headers["user-agent"];
  void pool
    .query(
      `INSERT INTO auditoria (usuario_id, accion, entidad_tipo, entidad_id, detalle, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.usuario?.id ?? null,
        accion,
        entidadTipo ?? null,
        entidadId ?? null,
        detalle != null ? JSON.stringify(detalle) : null,
        clienteIp(req),
        typeof userAgent === "string" ? userAgent.slice(0, 500) : null,
      ],
    )
    .catch((err) => logger.warn({ err, accion }, "No se pudo registrar auditoría (best-effort)"));
}
