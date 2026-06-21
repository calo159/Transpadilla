import type { Request, Response, NextFunction } from "express";

interface Registro {
  count: number;
  reset: number;
}

/**
 * Limitador de peticiones en memoria por IP (sin dependencias). Frena fuerza
 * bruta y floods de capa 7. Para que la IP sea la real detrás del proxy de Render,
 * la app debe tener `trust proxy` activado (ver app.ts).
 *
 * Nota: un DDoS volumétrico real se mitiga en el borde (Cloudflare / Render), no
 * aquí. Esto es defensa en profundidad contra abuso por IP.
 *
 * El store se BARRE periódicamente para no crecer sin límite (si no, un atacante
 * con muchas IPs distintas podría agotar la memoria del proceso — un DoS).
 */
export function rateLimit(opts: { ventanaMs: number; max: number; mensaje?: string }) {
  const store = new Map<string, Registro>();

  // Limpieza de entradas vencidas (evita fuga de memoria bajo muchos IPs).
  const limpiar = setInterval(() => {
    const ahora = Date.now();
    for (const [ip, reg] of store) {
      if (reg.reset < ahora) store.delete(ip);
    }
  }, Math.max(opts.ventanaMs, 60_000));
  limpiar.unref?.(); // no mantener vivo el proceso por este timer

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
      res.status(429).json({
        error: opts.mensaje ?? `Demasiadas solicitudes. Espera ${seg} segundos e inténtalo de nuevo.`,
      });
      return;
    }
    next();
  };
}
