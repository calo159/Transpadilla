import type { Request, Response, NextFunction } from "express";

interface Registro {
  count: number;
  reset: number;
}

/**
 * Limitador de peticiones en memoria por IP (sin dependencias). Útil para frenar
 * fuerza bruta en el login. Para que la IP sea la real detrás del proxy de Render,
 * la app debe tener `trust proxy` activado (ver app.ts).
 */
export function rateLimit(opts: { ventanaMs: number; max: number }) {
  const store = new Map<string, Registro>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || "desconocida";
    const ahora = Date.now();
    let reg = store.get(ip);
    if (!reg || reg.reset < ahora) {
      reg = { count: 0, reset: ahora + opts.ventanaMs };
      store.set(ip, reg);
    }
    reg.count++;
    if (reg.count > opts.max) {
      const seg = Math.ceil((reg.reset - ahora) / 1000);
      res.setHeader("Retry-After", String(seg));
      res.status(429).json({ error: `Demasiados intentos. Espera ${seg} segundos e inténtalo de nuevo.` });
      return;
    }
    next();
  };
}
