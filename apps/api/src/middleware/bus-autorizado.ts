import type { Request, Response, NextFunction } from "express";
import { db, buses } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      /** Id del bus que el usuario autenticado tiene permitido operar. */
      busId?: number;
    }
  }
}

/**
 * Middleware que decide, EN EL BACKEND, qué bus puede operar el usuario y lo
 * deja en `req.busId`. Nunca se confía en el `bus_id` que mande un conductor:
 *  - conductor → SOLO su propio bus (el asignado a su `conductor_id`). Se ignora
 *    cualquier `bus_id` del body; así no puede mover/reportar/finalizar el bus de
 *    otro conductor (evita IDOR/suplantación).
 *  - admin     → el `bus_id` que indique en el body (puede operar cualquiera).
 * Si no hay bus válido responde 403 y corta la cadena.
 *
 * Requiere haber pasado antes por `authMiddleware` (necesita `req.usuario`).
 */
export async function busAutorizado(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const usuario = req.usuario;
  if (!usuario) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }

  let busId: number | null = null;
  if (usuario.rol === "admin") {
    const id = Number((req.body as { bus_id?: unknown }).bus_id);
    busId = Number.isInteger(id) && id > 0 ? id : null;
  } else {
    // Conductor: su bus se determina por su identidad (JWT), no por el cliente.
    const [propio] = await db
      .select({ id: buses.id })
      .from(buses)
      .where(eq(buses.conductor_id, usuario.id));
    busId = propio?.id ?? null;
  }

  if (!busId) {
    res.status(403).json({ error: "No tienes un bus asignado" });
    return;
  }
  req.busId = busId;
  next();
}
