import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env["JWT_SECRET"] ?? "transpadilla_clave_secreta_2026_guajira";

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
