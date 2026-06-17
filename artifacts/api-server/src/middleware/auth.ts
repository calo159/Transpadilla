import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.usuario = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
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
