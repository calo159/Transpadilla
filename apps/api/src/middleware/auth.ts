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
  // Versión de sesión vigente al firmar (usuarios.token_version). Cambiar la
  // contraseña la incrementa: un token firmado con una versión vieja deja de
  // servir de inmediato, aunque no haya expirado ni se haya cerrado sesión.
  tv: number;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: AuthPayload;
      /** Token crudo ya extraído (de header o cookie) — ver `extraerToken`. */
      tokenCrudo?: string;
    }
  }
}

// Nombre de la cookie de sesión (httpOnly) que usa el navegador web. El APK de
// Capacitor sigue con `Authorization: Bearer` + localStorage (no encaja bien con
// cookies en un WebView cross-origin); esta función acepta AMBOS sin romper nada:
// Bearer tiene prioridad (comportamiento actual intacto), la cookie es el fallback
// para el navegador, que ya no expone el JWT a JS.
const COOKIE_SESION = "tp_session";

function extraerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookieToken = req.cookies?.[COOKIE_SESION];
  return typeof cookieToken === "string" && cookieToken ? cookieToken : null;
}

/** Fija la cookie de sesión con el mismo vencimiento real del JWT (su `exp`). */
export function setSessionCookie(res: Response, token: string): void {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const maxAge = decoded?.exp ? decoded.exp * 1000 - Date.now() : 3 * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: Math.max(maxAge, 0),
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_SESION, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extraerToken(req);
  if (!token) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }
  let payload: AuthPayload;
  try {
    // Fijar el algoritmo (HS256) evita ataques de "confusión de algoritmo":
    // sin esto, jwt aceptaría cualquier alg del header del token.
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AuthPayload;
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }
  // Dos comprobaciones en una sola consulta (evita 2 round-trips por request):
  // 1) lista negra (cierre de sesión real) y 2) token_version vigente del
  // usuario (cambiar contraseña la incrementa → invalida sesiones viejas).
  // FAIL-CLOSED: si no se puede comprobar (BD caída, usuario borrado), se
  // responde 401/503 en vez de dejar pasar — de lo contrario un token
  // revocado/viejo volvería a funcionar justo cuando la BD falla, y esas
  // garantías dejarían de serlo.
  try {
    const { rows } = await pool.query<{ token_version: number; revocado: boolean }>(
      `SELECT u.token_version,
              EXISTS(SELECT 1 FROM tokens_revocados r WHERE r.token_hash = $2) AS revocado
         FROM usuarios u WHERE u.id = $1`,
      [payload.id, hashToken(token)],
    );
    const fila = rows[0];
    if (!fila || fila.revocado) {
      res.status(401).json({ error: "Sesión cerrada" });
      return;
    }
    if (fila.token_version !== payload.tv) {
      res.status(401).json({ error: "Tu contraseña cambió; inicia sesión de nuevo." });
      return;
    }
  } catch {
    res.status(503).json({ error: "No se pudo validar la sesión. Inténtalo de nuevo." });
    return;
  }
  req.usuario = payload;
  req.tokenCrudo = token;
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
