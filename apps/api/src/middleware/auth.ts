import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { pool } from "@workspace/db";

/** Hash SHA-256 (hex) de un token: lo que se guarda en la lista negra, no el token. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// JWT_SECRET es obligatorio salvo en desarrollo local explícito: el fallback
// solo debe existir para `pnpm dev` sin .env configurado. Si NODE_ENV no es
// exactamente "development" (staging, prod, o un despliegue mal configurado
// sin NODE_ENV) y falta el secreto, abortamos el arranque (fail-fast) en vez
// de firmar/verificar tokens con un secreto público conocido del repo — eso
// permitiría forjar un JWT con rol "admin".
if (process.env["NODE_ENV"] !== "development" && !process.env["JWT_SECRET"]) {
  throw new Error(
    "FATAL: JWT_SECRET es obligatorio fuera de desarrollo. Configúralo en las variables de entorno.",
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
    // Fijar el algoritmo (HS256) evita ataques de "confusión de algoritmo":
    // sin esto, jwt aceptaría cualquier alg del header del token.
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AuthPayload;
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }
  // Lista negra: si el token fue revocado (cierre de sesión), se rechaza.
  // FAIL-CLOSED: si no se puede comprobar la revocación (BD caída, error de
  // red), se responde 503 en vez de dejar pasar — de lo contrario un token
  // revocado por logout volvería a funcionar justo cuando la BD falla, y el
  // "cerrar sesión real" dejaría de ser una garantía.
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
    res.status(503).json({ error: "No se pudo validar la sesión. Inténtalo de nuevo." });
    return;
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
