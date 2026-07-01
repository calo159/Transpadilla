import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { pool } from "@workspace/db";

/** Hash SHA-256 (hex) de un token: lo que se guarda en la lista negra, no el token. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// En producción el JWT_SECRET es obligatorio: si falta, abortamos el arranque
// (fail-fast) en vez de usar un secreto por defecto inseguro.
if (process.env["NODE_ENV"] === "production" && !process.env["JWT_SECRET"]) {
  throw new Error(
    "FATAL: JWT_SECRET es obligatorio en producción. Configúralo en las variables de entorno.",
  );
}
const JWT_SECRET =
  process.env["JWT_SECRET"] ?? "transpadilla_dev_secret_solo_para_desarrollo_local";

export interface AuthPayload {
  id: number;
  correo: string;
  rol: string;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: AuthPayload;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }
  const token = header.slice(7);
  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }
  // Lista negra: si el token fue revocado (cierre de sesión), se rechaza.
  try {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM tokens_revocados WHERE token_hash = $1 LIMIT 1`,
      [hashToken(token)],
    );
    if (rowCount && rowCount > 0) {
      res.status(401).json({ error: "Sesión cerrada" });
      return;
    }
  } catch {
    // Si la comprobación falla (BD caída), no bloqueamos: el token ya es válido.
  }
  req.usuario = payload;
  next();
}

export function requireRol(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      res.status(403).json({ error: "Acceso denegado" });
      return;
    }
    next();
  };
}

export { JWT_SECRET };
